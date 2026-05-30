import google from '@googleapis/health';

import { config } from './config.ts';
import { getGoogleRefreshToken, setGoogleRefreshToken } from './token-store.ts';

import type { Logger } from 'pino';

export interface GoogleHealthProps {
  sleeperId: string;
  logger: Logger;
  clientId: string;
  clientSecret: string;
}

/**
 * https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#sleep.sleepstagetype
 */
export type GoogleHealthSleepStageType =
  | 'SLEEP_STAGE_TYPE_UNSPECIFIED'
  | 'AWAKE'
  | 'LIGHT'
  | 'DEEP'
  | 'REM'
  | 'ASLEEP'
  | 'RESTLESS';

export interface GoogleHealthAxiosError extends Error {
  code: number;
  response: {
    data?: {
      error?: {
        details?: {
          metadata?: {
            existing_resource_name?: string;
          };
        }[];
      };
    };
  };
}
export class GoogleHealth {
  private logger: Logger;

  private sleeperId: string;

  private clientId: string;

  private clientSecret: string;

  private healthClient?: google.health_v4.Health;

  constructor(props: GoogleHealthProps) {
    this.logger = props.logger;
    this.sleeperId = props.sleeperId;
    this.clientId = props.clientId;
    this.clientSecret = props.clientSecret;
  }

  /**
   * Ensure access token is set and valid, fetch using refresh token if needed
   */
  private async ensureHealthClient(): Promise<google.health_v4.Health> {
    this.logger.trace('Ensuring Google Health token');

    if (this.healthClient) {
      this.logger.trace('OAuth2 client already setup');
      return this.healthClient;
    }

    const refreshToken = await getGoogleRefreshToken(this.sleeperId);
    if (!refreshToken) {
      this.logger.error('No Google Health refresh token found');
      throw new Error(
        `No Google Health refresh token found for sleeperId ${this.sleeperId}. Follow the setup instructions for Google Health.`,
      );
    }
    this.logger.trace('Setting Google Health refresh token on OAuth2 client');
    const oAuth2Client = new google.auth.OAuth2({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    oAuth2Client.on('tokens', async (tokens) => {
      this.logger.debug(
        {
          tokenType: tokens.token_type,
          expiryDate: tokens.expiry_date,
          scope: tokens.scope,
          accessTokenLength: tokens.access_token?.length,
          refreshTokenLength: tokens.refresh_token?.length,
          idTokenLength: tokens.id_token?.length,
        },
        'New Google Health access token obtained',
      );
      if (tokens.refresh_token) {
        this.logger.info('Received new Google Health refresh token, saving to token store');
        await setGoogleRefreshToken(this.sleeperId, tokens.refresh_token);
      }
    });
    oAuth2Client.setCredentials({ refresh_token: refreshToken });

    this.healthClient = new google.health_v4.Health({ auth: oAuth2Client });

    return this.healthClient;
  }

  /**
   * Create a sleep log entry for the user.
   * @param params Sleep log parameters (see Google Health API docs)
   * @returns The created sleep log response
   */
  public async createSleepLog(params: google.health_v4.Schema$Sleep): Promise<void> {
    const healthClient = await this.ensureHealthClient();

    const startDate = params.interval?.startTime;

    this.logger.debug({ startDate }, 'Google Health create sleep log request');
    const createResp = await healthClient.users.dataTypes.dataPoints.create({
      parent: `users/me/dataTypes/sleep`,
      requestBody: {
        dataSource: {
          recordingMethod: 'PASSIVELY_MEASURED',
        },
        sleep: params,
      },
    });
    this.logger.info(
      {
        name: createResp.data.response?.name,
        startTime: createResp.data.response?.sleep?.interval?.startTime,
      },
      'Successfully created Google Health sleep log',
    );
  }

  /**
   * Overwrite an existing sleep log entry for the user.
   * @param params Sleep log parameters (see Google Health API docs)
   * @param name The name of the sleep log to overwrite
   * @returns The updated sleep log response
   */
  public async overwriteSleepLog(
    params: google.health_v4.Schema$Sleep,
    name: string,
  ): Promise<void> {
    const healthClient = await this.ensureHealthClient();

    const startDate = params.interval?.startTime;
    this.logger.debug({ startDate, name }, 'Google Health patch sleep log request');
    const createResp = await healthClient.users.dataTypes.dataPoints.patch({
      name,
      requestBody: {
        dataSource: {
          recordingMethod: 'PASSIVELY_MEASURED',
        },
        sleep: params,
      },
    });
    this.logger.info(
      {
        name: createResp.data.response?.name,
        startTime: createResp.data.response?.sleep?.interval?.startTime,
      },
      'Successfully patched Google Health sleep log',
    );
  }

  public async createSleepLogs(paramsArray: google.health_v4.Schema$Sleep[]): Promise<void> {
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    this.logger.info(
      { count: paramsArray.length },
      'Starting batch Google Health sleep log upload',
    );
    for (const params of paramsArray) {
      try {
        await this.createSleepLog(params);
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 409) {
          const existingLogName = (err as GoogleHealthAxiosError).response?.data?.error
            ?.details?.[0]?.metadata?.existing_resource_name;
          if (existingLogName && config.overwriteGoogleHealthRecords) {
            this.logger.warn('Sleep log already exists in Google Health, overwriting');
            await this.overwriteSleepLog(params, existingLogName);
          } else {
            this.logger.warn('Sleep log already exists in Google Health, skipping');
          }
        } else {
          this.logger.error({ err, params }, 'Error creating Google Health sleep log');
          throw err;
        }
      }
    }
    this.logger.info('Batch Google Health sleep log upload finished');
  }
}
