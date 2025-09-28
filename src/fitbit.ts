import ky, { HTTPError } from 'ky';

import { config } from './config.ts';
import { logger } from './logger.ts';
import { getFitbitRefreshToken, setFitbitRefreshToken } from './token-store.ts';

import type { KyResponse, SearchParamsOption } from 'ky';

export interface FitbitProps {
  sleeperId: string;
}

export interface SleepLogParams {
  /**
   * Log entry date in the format yyyy-MM-dd.
   */
  date: string;

  /**
   * Start time; hours and minutes in the format HH:mm
   */
  startTime: string; // HH:mm

  /**
   * Duration in milliseconds
   */
  duration: number;
}

export interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  user_id: string;
}

export const getFitbitAccessToken = async (
  params: SearchParamsOption,
): Promise<AccessTokenResponse> => {
  const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
  const clientId = config.fitbitClientId;
  const clientSecret = config.fitbitClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Fitbit client ID and client secret must be set in config.json');
  }
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const resp = await ky
      .post<AccessTokenResponse>(FITBIT_TOKEN_URL, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        searchParams: params,
      })
      .json();
    return resp;
  } catch (error) {
    if (error instanceof HTTPError) {
      const errorData = await error.response.json();
      throw new Error(`Fitbit API error: ${JSON.stringify(errorData)}`);
    }
    throw error;
  }
};

const wait = async (seconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });

export class Fitbit {
  private sleeperId: string;

  private accessToken?: string;

  private expiresAt = 0;

  constructor(props: FitbitProps) {
    this.sleeperId = props.sleeperId;
  }

  /**
   * Ensure access token is set and valid, fetch using refresh token if needed
   */
  private async ensureValidAccessToken(): Promise<string> {
    logger.trace({ sleeperId: this.sleeperId }, 'Ensuring Fitbit access token');
    if (this.accessToken && Date.now() < this.expiresAt) {
      logger.debug({ sleeperId: this.sleeperId }, 'Fitbit access token is valid');
      return this.accessToken;
    }

    logger.info(
      { sleeperId: this.sleeperId },
      'Fetching new Fitbit access token using refresh token',
    );
    const refreshToken = await getFitbitRefreshToken(this.sleeperId);
    if (!refreshToken) {
      logger.error({ sleeperId: this.sleeperId }, 'No Fitbit refresh token found');
      throw new Error(
        `No Fitbit refresh token found for sleeperId ${this.sleeperId}. Follow the setup instructions for Fitbit.`,
      );
    }
    logger.debug({ sleeperId: this.sleeperId }, 'Requesting new access token from Fitbit API');
    const resp = await getFitbitAccessToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    this.accessToken = resp.access_token;
    this.expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
    logger.info(
      { sleeperId: this.sleeperId, expiresAt: this.expiresAt },
      'Fitbit access token received',
    );
    await setFitbitRefreshToken(this.sleeperId, resp.refresh_token);
    return this.accessToken;
  }

  /**
   * Create a sleep log entry for the user.
   * @param params Sleep log parameters (see Fitbit API docs)
   * @returns The created sleep log response
   */
  public async createSleepLog(params: SleepLogParams): Promise<KyResponse> {
    logger.info({ sleeperId: this.sleeperId, params }, 'Creating Fitbit sleep log');
    const accessToken = await this.ensureValidAccessToken();
    const url = 'https://api.fitbit.com/1.2/user/-/sleep.json';
    logger.debug({ url, params }, 'Fitbit sleep log request');
    return ky.post(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      searchParams: {
        ...params,
      },
      throwHttpErrors: false,
    });
  }

  public async createSleepLogs(paramsArray: SleepLogParams[]): Promise<void> {
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    logger.info(
      { sleeperId: this.sleeperId, count: paramsArray.length },
      'Starting batch Fitbit sleep log upload',
    );
    for (const [index, params] of paramsArray.entries()) {
      let attempt = 0;
      const batchRequestsRemaining = paramsArray.length - index;
      while (true) {
        logger.trace({ index, params }, 'Uploading Fitbit sleep log');
        const resp = await this.createSleepLog(params);
        const { status } = resp;
        const intervalRequestsRemaining = parseInt(
          resp.headers.get('fitbit-rate-limit-remaining') ?? '1',
          10,
        );
        const secondsUntilIntervalReset = parseInt(
          resp.headers.get('fitbit-rate-limit-reset') ?? '1',
          10,
        );

        logger.debug(
          { status, intervalRequestsRemaining, secondsUntilIntervalReset },
          'Fitbit rate limit info',
        );

        if (status === 429) {
          logger.info(
            { index, params, attempt, secondsUntilIntervalReset },
            'Fitbit rate limit hit, waiting to retry',
          );
          await wait(secondsUntilIntervalReset);
          attempt += 1;
          if (attempt > 5) {
            logger.error({ params }, 'Max retries reached for Fitbit sleep log');
            break;
          }
        } else if (!resp.ok) {
          const errorText = await resp.text();
          logger.error({ status, errorText, params }, 'Error creating Fitbit sleep log');
          break;
        } else if (intervalRequestsRemaining <= 1) {
          logger.info(
            { index, params, secondsUntilIntervalReset },
            'Fitbit rate limit low, waiting for reset',
          );
          await wait(secondsUntilIntervalReset);
          break;
        } else {
          // if batchRequestsRemaining <= intervalRequestsRemaining, no wait needed
          if (batchRequestsRemaining > intervalRequestsRemaining) {
            const interval = secondsUntilIntervalReset / intervalRequestsRemaining;
            logger.trace({ index, params, interval }, 'Spacing out Fitbit sleep log requests');
            await wait(interval);
          }
          break;
        }
        logger.trace({ index, params, status }, 'Retrying Fitbit sleep log upload');
      }
    }
    logger.info({ sleeperId: this.sleeperId }, 'Batch Fitbit sleep log upload finished');
  }
}
