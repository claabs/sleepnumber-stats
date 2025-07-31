/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
import { TZDate } from '@date-fns/tz';
import { Point } from '@influxdata/influxdb-client';
import { addDays, addSeconds, differenceInDays, format, startOfMonth, subMonths } from 'date-fns';

import { config } from './config.ts';
import HealthConnectGateway from './health-connect-gateway.ts';
import { logger } from './logger.ts';
import {
  DeviceType,
  RecordingMethod,
  SleepStageType,
} from './models/sleep-session/sleep-session-record.ts';

import type { QueryApi } from '@influxdata/influxdb-client';

import type { SleepNumberAPI } from './api.ts';
import type { HealthConnectUser } from './config.ts';
import type { Bed } from './models/bed/bed.model.ts';
import type { SleepDataStructure } from './models/sessions/sleep-data.model.ts';
import type {
  SleepSessionRecord,
  SleepStage,
} from './models/sleep-session/sleep-session-record.ts';
import type { Sleeper } from './models/sleeper/sleeper.model.ts';

export interface SleeperScraperProps {
  api: SleepNumberAPI;
  beds: Bed[];
  sleeper: Sleeper;
  influxQueryApi: QueryApi;
  healthConnectUser?: HealthConnectUser;
}

export class SleeperScraper {
  private api: SleepNumberAPI;

  private sleeper: Sleeper;

  private timezone: string;

  private influxQueryApi: QueryApi;

  private healthConnectGateway?: HealthConnectGateway;

  constructor(props: SleeperScraperProps) {
    this.api = props.api;
    this.sleeper = props.sleeper;
    this.influxQueryApi = props.influxQueryApi;

    const bed = props.beds.find(
      (b) =>
        b.sleeperLeftId === this.sleeper.sleeperId || b.sleeperRightId === this.sleeper.sleeperId,
    );
    this.timezone = bed?.timezone ?? config.tz;

    if (!(props.healthConnectUser?.username && props.healthConnectUser?.password)) {
      logger.warn(
        { sleeperId: this.sleeper.sleeperId },
        'Health Connect credentials not configured, skipping Health Connect Gateway',
      );
    } else {
      this.healthConnectGateway = new HealthConnectGateway({
        username: props.healthConnectUser.username,
        password: props.healthConnectUser.password,
      });
    }

    logger.debug({ sleeperId: this.sleeper.sleeperId }, 'SleeperScraper initialized');
  }

  private createPoints(sleepDataStruct: SleepDataStructure): Point[] {
    logger.trace({ days: sleepDataStruct.sleepData.length }, 'Creating points from sleep data');
    return (
      sleepDataStruct.sleepData
        .map((sleepDataDay) => {
          const longestSession = sleepDataDay.sessions.find(
            (session) => session.longest && session.isFinalized,
          );
          if (longestSession) {
            const point = new Point('sleep_data')
              .timestamp(new TZDate(longestSession.endDate, this.timezone))
              .tag('sleeper_id', this.sleeper.sleeperId)
              .tag('sleeper_name', this.sleeper.firstName)
              .intField('heart_rate', longestSession.avgHeartRate)
              .intField('breath_rate', longestSession.avgRespirationRate)
              .intField('sleep_quotient', longestSession.sleepQuotient)
              .intField('hrv', longestSession.hrv)
              .intField('sleep_number', longestSession.sleepNumber)
              .intField('in_bed', longestSession.inBed)
              .intField('out_of_bed', longestSession.outOfBed)
              .intField('restful', longestSession.restful)
              .intField('restless', longestSession.restless)
              .intField('total_sleep_session_time', longestSession.totalSleepSessionTime)
              .intField('fall_asleep_period', longestSession.fallAsleepPeriod);

            return point;
          }
          return null;
        })
        .filter((point) => point !== null) ?? []
    );
  }

  private createSleepSessions(sleepData: SleepDataStructure): SleepSessionRecord[] {
    logger.trace({ days: sleepData.sleepData.length }, 'Creating sleep sessions from sleep data');
    return sleepData.sleepData
      .map((sleepDataDay) => {
        const longestSession = sleepDataDay.sessions.find(
          (session) => session.longest && session.isFinalized,
        );
        if (!longestSession) return null;
        const sessionStartDate = new TZDate(longestSession.startDate, this.timezone);
        const sessionEndDate = new TZDate(longestSession.endDate, this.timezone);
        // Only include sessions within the last 30 days
        if (differenceInDays(new Date(), sessionEndDate) > 30) return null;

        logger.debug(
          { endDate: longestSession.endDate, sleeperId: this.sleeper.sleeperId },
          'Creating sleep session record',
        );
        const stageFields: { value: number; stage: SleepStageType }[] = [
          {
            value: longestSession.outOfBed,
            stage: SleepStageType.SLEEP_STAGE_TYPE_OUT_OF_BED,
          },
          {
            value: longestSession.fallAsleepPeriod,
            stage: SleepStageType.STAGE_TYPE_AWAKE_IN_BED,
          },
          {
            value: longestSession.restless,
            stage: SleepStageType.SLEEP_STAGE_TYPE_LIGHT,
          },
          {
            value: longestSession.restful,
            stage: SleepStageType.SLEEP_STAGE_TYPE_DEEP,
          },
        ];
        let stageTime = new TZDate(longestSession.startDate, this.timezone);
        const stages: SleepStage[] = stageFields
          .filter((field) => field.value > 0)
          .map((field) => {
            const endTime = addSeconds(new TZDate(stageTime, this.timezone), field.value);
            const stage: SleepStage = {
              stage: field.stage,
              startTime: new TZDate(stageTime, 'UTC').toISOString(),
              endTime: new TZDate(endTime, 'UTC').toISOString(),
            };
            stageTime = endTime;
            return stage;
          });
        const sleepSession: SleepSessionRecord = {
          startTime: new TZDate(sessionStartDate, 'UTC').toISOString(),
          endTime: new TZDate(sessionEndDate, 'UTC').toISOString(),
          stages,
          metadata: {
            clientRecordVersion: 1,
            clientRecordId: longestSession.startDate,
            recordingMethod: RecordingMethod.RECORDING_METHOD_AUTOMATICALLY_RECORDED,
            dataOrigin: 'com.sleepnumber.stats',
            device: {
              type: DeviceType.TYPE_UNKNOWN,
              manufacturer: 'Sleep Number',
              model: 'SleepIQ',
            },
          },
        };
        return sleepSession;
      })
      .filter((session) => session !== null);
  }

  private async publishSleepSessions(sleepSessions: SleepSessionRecord[]): Promise<void> {
    if (!this.healthConnectGateway) return;
    if (!sleepSessions.length) return;

    logger.debug({ count: sleepSessions.length }, 'Publishing sleep sessions');
    await this.healthConnectGateway.push('sleepSession', {
      data: sleepSessions,
    });
    logger.info(
      { count: sleepSessions.length },
      'Successfully published HealthConnect session batch',
    );
  }

  async getHistoricalData(): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId }, 'Fetching historical sleep data');
    const historicalPoints: Point[] = [];
    let currentDate = startOfMonth(new TZDate(new Date(), this.timezone));

    while (true) {
      const dateString = format(currentDate, 'yyyy-MM-dd');
      logger.trace({ date: dateString }, 'Requesting monthly sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'M1',
        this.sleeper.sleeperId,
        false,
      );
      const points = this.createPoints(sleepDataResp);
      await this.publishSleepSessions(this.createSleepSessions(sleepDataResp));
      if (!points.length) {
        logger.info('No more historical points found');
        break;
      }
      historicalPoints.push(...points);
      currentDate = subMonths(currentDate, 1);
    }
    logger.info({ count: historicalPoints.length }, 'Historical points fetched');
    return historicalPoints;
  }

  async getDailyData(startDate: Date): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId, startDate }, 'Fetching daily sleep data');
    const dailyPoints: Point[] = [];
    const today = new TZDate(new Date(), this.timezone);
    let date = new TZDate(startDate, this.timezone);
    while (date <= today) {
      const dateString = format(date, 'yyyy-MM-dd');
      logger.trace({ date: dateString }, 'Requesting daily sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'D1',
        this.sleeper.sleeperId,
        false,
      );
      const points = this.createPoints(sleepDataResp);
      await this.publishSleepSessions(this.createSleepSessions(sleepDataResp));
      dailyPoints.push(...points);
      date = addDays(date, 1);
    }
    logger.info({ count: dailyPoints.length }, 'Daily points fetched');
    return dailyPoints;
  }

  async scrapeSleeperData(): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId }, 'Scraping sleeper data');
    const bucket = config.influxdbBucket;
    const query = `from(bucket: "${bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "sleep_data" and r.sleeper_id == "${this.sleeper.sleeperId}") |> sort(columns: ["_time"], desc: true) |> limit(n: 1)`;

    let lastDate: Date | undefined;
    await new Promise<void>((resolve, reject) => {
      this.influxQueryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const o = tableMeta.toObject(row);
          if (o._time) {
            lastDate = new Date(o._time);
            logger.debug({ lastDate }, 'Found last date in InfluxDB');
          }
        },
        error: (error: Error) => {
          logger.error({ error }, 'Error querying InfluxDB');
          reject(error);
        },
        complete: () => {
          resolve();
        },
      });
    });

    if (lastDate) {
      const startDate = addDays(new TZDate(lastDate, this.timezone), 1);
      logger.info({ startDate }, 'Fetching daily data since last date');
      return this.getDailyData(startDate);
    }
    logger.info('No previous data found, fetching historical data');
    return this.getHistoricalData();
  }
}
