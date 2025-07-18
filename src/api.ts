/* eslint-disable n/no-sync */
import fs from 'node:fs';
import path from 'node:path';

import ky from 'ky';

import { logger } from './logger.ts';

import type { KyInstance, Options, ResponsePromise } from 'ky';

import type { CognitoLoginData } from './models/auth/cognito.model.ts';
import type { SleepDataStructure } from './models/sessions/sleep-data.model.ts';
import type { SleeperEntity } from './models/sleeper/sleeper.model.ts';

export interface SleepNumberApiOptions {
  clientId: string;
  email: string;
  password: string;
}

const API_VERSION = '5.3.10';

export class SleepNumberAPI {
  private clientId: string;

  private email: string;

  private password: string;

  private accessToken?: string;

  private tokenExpiry = 0;

  private tokensFile = path.resolve('./config/tokens.json');

  private ky: KyInstance;

  constructor(options: SleepNumberApiOptions) {
    this.clientId = options.clientId;
    this.email = options.email;
    this.password = options.password;
    this.ky = ky.create();
    logger.debug({ email: this.email }, 'SleepNumberAPI initialized');
  }

  private async loadRefreshToken(): Promise<string | undefined> {
    logger.trace({ file: this.tokensFile }, 'Loading refresh token');
    if (fs.existsSync(this.tokensFile)) {
      const tokens = JSON.parse(fs.readFileSync(this.tokensFile, 'utf-8')) as Record<
        string,
        string
      >;
      logger.debug({ email: this.email, hasToken: !!tokens[this.email] }, 'Refresh token loaded');
      return this.email ? tokens[this.email] : undefined;
    }
    logger.debug('No tokens file found');
    return undefined;
  }

  private async saveRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      logger.trace('No refresh token provided, skipping save');
      return;
    }
    const dir = path.dirname(this.tokensFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug({ dir }, 'Created tokens directory');
    }
    let tokens: Record<string, string> = {};
    if (fs.existsSync(this.tokensFile)) {
      tokens = JSON.parse(fs.readFileSync(this.tokensFile, 'utf-8'));
    }
    if (this.email) {
      tokens[this.email] = refreshToken;
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
      logger.info({ email: this.email }, 'Refresh token saved');
    }
  }

  async login(): Promise<void> {
    logger.info({ email: this.email }, 'Attempting login');
    const refreshToken = await this.loadRefreshToken();
    if (refreshToken) {
      logger.info({ email: this.email }, 'Using refresh token for login');
      await this.getNewTokens(refreshToken);
      return;
    }
    const url = 'https://ecim.sleepnumber.com/v1/token';
    const payload = {
      ClientID: this.clientId,
      Email: this.email,
      Password: this.password,
    };
    logger.debug({ url, email: this.email }, 'Requesting new tokens');
    const response = await this.ky.post<CognitoLoginData>(url, {
      json: payload,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    const data = await response.json();
    this.accessToken = data.AccessToken;
    this.tokenExpiry = Date.now() + (data.ExpiresIn ?? 3600) * 1000;
    logger.info(
      { expiresIn: data.ExpiresIn, tokenExpiry: this.tokenExpiry },
      'Access token received',
    );
    await this.saveRefreshToken(data.RefreshToken);
  }

  private async getNewTokens(refreshToken: string): Promise<void> {
    logger.info({ email: this.email }, 'Refreshing tokens');
    const url = 'https://ecim.sleepnumber.com/v1/token';
    const payload = {
      ClientID: this.clientId,
      RefreshToken: refreshToken,
    };
    logger.debug({ url, email: this.email }, 'Requesting new tokens with refresh token');
    const response = await this.ky.put<{ data: CognitoLoginData }>(url, {
      json: payload,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    const responseData = await response.json();
    const { data } = responseData;
    this.accessToken = data.AccessToken;
    this.tokenExpiry = Date.now() + (data.ExpiresIn ?? 3600) * 1000;
    logger.info(
      { expiresIn: data.ExpiresIn, tokenExpiry: this.tokenExpiry },
      'Access token refreshed',
    );
    await this.saveRefreshToken(data.RefreshToken);
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      logger.trace('Token missing or expired, logging in');
      await this.login();
    } else {
      logger.trace('Token is valid');
    }
  }

  async makeAuthorizedRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    options: Options = {},
  ): Promise<ResponsePromise<T>> {
    logger.trace({ method, url }, 'Making authorized request');
    await this.ensureValidToken();

    const headers = Object.assign(options.headers ?? {}, {
      Authorization: `Bearer ${this.accessToken}`,
    });
    logger.debug({ method, url, headers }, 'Request headers set');
    return this.ky<T>(url, { ...options, method, headers });
  }

  async getSleepData(
    date: string,
    interval: 'M1' | 'W1' | 'D1',
    sleeper: string,
    includeSlices: boolean,
  ): Promise<SleepDataStructure> {
    logger.info({ date, interval, sleeper, includeSlices }, 'Fetching sleep data');
    await this.ensureValidToken();
    const url = 'https://prod-api.sleepiq.sleepnumber.com/rest/sleepData';
    const searchParams = new URLSearchParams({
      date,
      interval,
      sleeper,
      includeSlices: includeSlices.toString(),
    });
    const headers = {
      Accept: '*/*',
      'Accept-Version': API_VERSION,
      'X-App-Version': API_VERSION,
      'X-App-Platform': 'web',
      Authorization: this.accessToken,
      Origin: 'https://sleepiq.sleepnumber.com',
      Referer: 'https://sleepiq.sleepnumber.com/',
    };
    logger.debug({ url, searchParams: Object.fromEntries(searchParams) }, 'Sleep data request');
    const response = await this.ky.get<SleepDataStructure>(url, { searchParams, headers });
    return response.json();
  }

  async getSleeper(): Promise<SleeperEntity> {
    logger.info('Fetching sleeper profile');
    await this.ensureValidToken();
    const url = 'https://prod-api.sleepiq.sleepnumber.com/rest/sleeper';
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Authorization: this.accessToken,
      'X-App-Version': API_VERSION,
      'Accept-Version': API_VERSION,
      'X-App-Platform': 'web',
      Origin: 'https://sleepiq.sleepnumber.com',
      Referer: 'https://sleepiq.sleepnumber.com/',
    };
    logger.debug({ url, headers }, 'Sleeper profile request');
    const response = await this.ky.get<SleeperEntity>(url, { headers });
    return response.json();
  }
}
