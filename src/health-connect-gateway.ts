import fs from 'node:fs/promises';
import path from 'node:path';

import { TZDate } from '@date-fns/tz';
import ky, { HTTPError } from 'ky';

import { logger } from './logger.ts';

export const TOKEN_EXPIRY_BUFFER_MS = 60_000; // 1 minute buffer

export interface HealthConnectGatewayProps {
  username: string;
  password: string;
}

export interface LoginObject {
  token: string;
  refresh: string;
  expiry: string;
}

export interface PushParameters {
  data: object[];
}

export interface FetchParameters {
  queries: object;
}

class HealthConnectGateway {
  private tokenValidated?: string;

  private baseUrl = 'https://api.hcgateway.shuchir.dev';

  private tokensFile = path.resolve('./config/tokens.json');

  private token?: string;

  private refreshToken?: string;

  private expiry?: string;

  private username: string;

  private password: string;

  constructor(props: HealthConnectGatewayProps) {
    this.username = props.username;
    this.password = props.password;
  }

  private async loadToken(): Promise<void> {
    try {
      const file = await fs.readFile(this.tokensFile, 'utf-8');
      const tokens = JSON.parse(file) as Record<string, LoginObject>;
      if (tokens.hcgateway) {
        this.token = tokens.hcgateway.token;
        this.refreshToken = tokens.hcgateway.refresh;
        this.expiry = tokens.hcgateway.expiry;
      }
    } catch {
      // No tokens file yet
    }
  }

  private async validateToken(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/v2/fetch/sleepSession`;
      await ky.post(url, {
        json: { queries: {} },
        headers: { Authorization: `Bearer ${this.token}` },
      });
      this.tokenValidated = this.token;
      return true;
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 403) {
        return false;
      }
      throw error;
    }
  }

  private async saveToken(loginObj: LoginObject): Promise<void> {
    let tokens: Record<string, LoginObject> = {};
    try {
      const file = await fs.readFile(this.tokensFile, 'utf-8');
      tokens = JSON.parse(file);
    } catch {
      // No tokens file yet
    }
    tokens.hcgateway = loginObj;
    await fs.writeFile(this.tokensFile, JSON.stringify(tokens, null, 2));
    this.token = loginObj.token;
    this.refreshToken = loginObj.refresh;
    this.expiry = loginObj.expiry;
  }

  private async login(): Promise<void> {
    const url = `${this.baseUrl}/api/v2/login`;
    const response = await ky.post(url, {
      json: { username: this.username, password: this.password },
    });
    const data = await response.json<LoginObject>();
    await this.saveToken(data);
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) throw new Error('No refresh token available');
    const url = `${this.baseUrl}/api/v2/refresh`;
    const response = await ky.post(url, { json: { refresh: this.refreshToken } });
    const data = await response.json<LoginObject>();
    await this.saveToken(data);
  }

  private async ensureValidToken(): Promise<void> {
    await this.loadToken();
    const now = Date.now();
    const expiryTime = this.expiry ? new TZDate(this.expiry, 'UTC').getTime() : 0;
    if (!this.token || !this.expiry || expiryTime - TOKEN_EXPIRY_BUFFER_MS <= now) {
      if (this.refreshToken) {
        await this.refresh();
      } else {
        await this.login();
      }
    }
    if (this.token && this.tokenValidated !== this.token) {
      if (await this.validateToken()) return;
      // Try refresh
      if (this.refreshToken) {
        await this.refresh();
        if (await this.validateToken()) return;
      }
      // Try login
      await this.login();
      if (await this.validateToken()) return;
      throw new Error('Unable to validate token after refresh and login');
    }
  }

  public async push(method: string, params: PushParameters): Promise<void> {
    await this.ensureValidToken();
    if (!this.token) throw new Error('No token available');
    const url = `${this.baseUrl}/api/v2/push/${method}`;
    const chunkSize = 5;
    const dataArray = params.data;
    for (let i = 0; i < dataArray.length; i += chunkSize) {
      const chunk = dataArray.slice(i, i + chunkSize);
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await ky.put(url, {
          json: { ...params, data: chunk },
          headers: { Authorization: `Bearer ${this.token}` },
        });
        // eslint-disable-next-line no-await-in-loop
        const responseData = await resp.json();
        logger.debug({ responseData }, 'Health Connect data pushed successfully');
      } catch (error) {
        if (error instanceof HTTPError) {
          // eslint-disable-next-line no-await-in-loop
          const errorData = await error.response.json();
          throw new Error(`Failed to push data: ${errorData}`);
        }
        throw error;
      }
    }
  }
}

export default HealthConnectGateway;
