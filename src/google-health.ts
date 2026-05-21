import google from '@googleapis/health';

import { getGoogleRefreshToken } from './token-store.ts';

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

export class GoogleHealth {
  private logger: Logger;

  private sleeperId: string;

  private oAuth2Client;

  constructor(props: GoogleHealthProps) {
    this.logger = props.logger;
    this.sleeperId = props.sleeperId;
    this.oAuth2Client = new google.auth.OAuth2({
      clientId: props.clientId,
      clientSecret: props.clientSecret,
    });
  }

  /**
   * Ensure access token is set and valid, fetch using refresh token if needed
   */
  private async ensureValidToken(): Promise<void> {
    this.logger.trace('Ensuring Google Health token');

    if (this.oAuth2Client.credentials.refresh_token) {
      this.logger.trace('OAuth2 client already has refresh token');
      return;
    }

    const refreshToken = await getGoogleRefreshToken(this.sleeperId);
    if (!refreshToken) {
      this.logger.error('No Google Health refresh token found');
      throw new Error(
        `No Google Health refresh token found for sleeperId ${this.sleeperId}. Follow the setup instructions for Google Health.`,
      );
    }
    this.logger.trace('Setting Google Health refresh token on OAuth2 client');
    this.oAuth2Client.setCredentials({ refresh_token: refreshToken });
    const { token: accessToken } = await this.oAuth2Client.getAccessToken();

    if (!accessToken) throw new Error('Failed to obtain access token from Google Health API');
  }

  /**
   * Create a sleep log entry for the user.
   * @param params Sleep log parameters (see Google Health API docs)
   * @returns The created sleep log response
   */
  public async createSleepLog(params: google.health_v4.Schema$Sleep): Promise<void> {
    this.logger.info({ params }, 'Creating Google Health sleep log');
    await this.ensureValidToken();
    const health = new google.health_v4.Health({ auth: this.oAuth2Client });
    this.logger.debug({ params }, 'Google Health sleep log request');
    await health.users.dataTypes.dataPoints.create({
      requestBody: {
        dataSource: {
          recordingMethod: 'PASSIVELY_MEASURED',
        },
        sleep: {
          ...params,
        },
      },
    });
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
        this.logger.error({ err, params }, 'Error creating Google Health sleep log');
        throw err;
      }
    }
    this.logger.info('Batch Google Health sleep log upload finished');
  }
}
