import google from '@googleapis/health';

import { config } from './config.ts';
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
    oAuth2Client.setCredentials({ refresh_token: refreshToken });

    this.healthClient = new google.health_v4.Health({ auth: oAuth2Client });

    return this.healthClient;
  }

  /**
   * Just soft deletes the logs. Doesn't solve 409s immediately.
   */
  private async purgeAllSleepLogs(): Promise<void> {
    this.logger.info('Purging all existing Google Health sleep logs');
    const healthClient = await this.ensureHealthClient();

    let nextPageToken: string | undefined;
    const sleepLogNames: string[] = [];
    do {
      this.logger.debug({ nextPageToken }, 'Listing Google Health sleep logs for deletion');
      // eslint-disable-next-line no-await-in-loop
      const listResp = await healthClient.users.dataTypes.dataPoints.list({
        parent: `users/me/dataTypes/sleep`,
        pageSize: 25, // Max page size for sleep
        pageToken: nextPageToken,
      });
      nextPageToken = listResp.data.nextPageToken ?? undefined;
      sleepLogNames.push(
        ...(listResp.data.dataPoints
          ?.map((dp) => dp.name)
          .filter((name): name is string => !!name) ?? []),
      );
    } while (nextPageToken);
    if (!sleepLogNames.length) {
      this.logger.info('No existing Google Health sleep logs found to delete');
      return;
    }
    this.logger.debug('Deleting Google Health sleep logs');
    try {
      const deleteResp = await healthClient.users.dataTypes.dataPoints.batchDelete({
        parent: `users/me/dataTypes/sleep`,
        requestBody: {
          names: sleepLogNames,
        },
      });
      this.logger.debug(
        { count: sleepLogNames.length, done: deleteResp.data.done },
        'Successfully deleted Google Health sleep logs',
      );
    } catch (err) {
      this.logger.error({ err }, 'Error deleting Google Health sleep logs');
      throw err;
    }
  }

  /**
   * Create a sleep log entry for the user.
   * @param params Sleep log parameters (see Google Health API docs)
   * @returns The created sleep log response
   */
  public async createSleepLog(params: google.health_v4.Schema$Sleep): Promise<void> {
    this.logger.info({ params }, 'Creating Google Health sleep log');
    const healthClient = await this.ensureHealthClient();

    this.logger.debug({ params }, 'Google Health sleep log request');
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

  public async createSleepLogs(paramsArray: google.health_v4.Schema$Sleep[]): Promise<void> {
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    if (config.deleteGoogleHealthRecords) {
      await this.purgeAllSleepLogs();
    }
    this.logger.info(
      { count: paramsArray.length },
      'Starting batch Google Health sleep log upload',
    );
    for (const params of paramsArray) {
      try {
        await this.createSleepLog(params);
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 409) {
          this.logger.warn('Sleep log already exists in Google Health, skipping');
        } else {
          this.logger.error({ err, params }, 'Error creating Google Health sleep log');
          throw err;
        }
      }
    }
    this.logger.info('Batch Google Health sleep log upload finished');
  }
}
