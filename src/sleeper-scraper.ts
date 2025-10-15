/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
import { TZDate } from '@date-fns/tz';
import { Point } from '@influxdata/influxdb-client';
import { addDays, differenceInDays, format, startOfMonth, subMonths } from 'date-fns';

import { config } from './config.ts';
import { Fitbit } from './fitbit.ts';
import { getFitbitRefreshToken } from './token-store.ts';

import type { QueryApi, WriteApi } from '@influxdata/influxdb-client';
import type { Logger } from 'pino';

import type { SleepLogParams } from './fitbit.ts';
import type { Bed } from './models/bed/bed.model.ts';
import type { SleepDataStructure } from './models/sessions/sleep-data.model.ts';
import type { Sleeper } from './models/sleeper/sleeper.model.ts';
import type { SleepNumberAPI } from './sleepnumber-api.ts';

export interface SleeperScraperProps {
  api: SleepNumberAPI;
  beds: Bed[];
  sleeper: Sleeper;
  influxQueryApi: QueryApi;
  influxWriteApi: WriteApi;
  logger: Logger;
}

interface ScrapedSessions {
  influxPoints: Point[];
  fitbitSleepLogs: SleepLogParams[];
}

export class SleeperScraper {
  private logger: Logger;

  private api: SleepNumberAPI;

  private sleeper: Sleeper;

  private timezone: string;

  private influxQueryApi: QueryApi;

  private influxWriteApi: WriteApi;

  private fitbitApi?: Fitbit;

  constructor(props: SleeperScraperProps) {
    this.logger = props.logger;
    this.api = props.api;
    this.sleeper = props.sleeper;
    this.influxQueryApi = props.influxQueryApi;
    this.influxWriteApi = props.influxWriteApi;

    const bed = props.beds.find(
      (b) =>
        b.sleeperLeftId === this.sleeper.sleeperId || b.sleeperRightId === this.sleeper.sleeperId,
    );
    this.timezone = bed?.timezone ?? config.tz;

    this.logger.debug('SleeperScraper initialized');
  }

  private createPoints(sleepDataStruct: SleepDataStructure): Point[] {
    this.logger.trace(
      { days: sleepDataStruct.sleepData.length },
      'Creating points from sleep data',
    );
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

  private createSleepParams(sleepData: SleepDataStructure): SleepLogParams[] {
    this.logger.trace(
      { days: sleepData.sleepData.length },
      'Creating sleep sessions from sleep data',
    );
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

        const asleepDurationSec = longestSession.restless + longestSession.restful;

        this.logger.debug({ endDate: longestSession.endDate }, 'Creating sleep log record');
        const sleepLog: SleepLogParams = {
          startTime: format(sessionStartDate, 'HH:mm'),
          date: format(sessionStartDate, 'yyyy-MM-dd'),
          duration: asleepDurationSec * 1000,
        };
        return sleepLog;
      })
      .filter((session) => session !== null);
  }

  private async publishSleepSessions(sleepLogs: SleepLogParams[]): Promise<void> {
    if (!this.fitbitApi) return;
    if (!sleepLogs.length) return;

    this.logger.debug({ count: sleepLogs.length }, 'Publishing sleep sessions to Fitbit');
    await this.fitbitApi.createSleepLogs(sleepLogs);
    this.logger.info({ count: sleepLogs.length }, 'Successfully published Fitbit sleep log batch');
  }

  async getHistoricalData(): Promise<ScrapedSessions> {
    this.logger.info('Fetching historical sleep data');
    const historicalPoints: Point[] = [];
    const sleepLogParams: SleepLogParams[] = [];
    let currentDate = startOfMonth(new TZDate(new Date(), this.timezone));

    while (true) {
      const dateString = format(currentDate, 'yyyy-MM-dd');
      this.logger.trace({ date: dateString }, 'Requesting monthly sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'M1',
        this.sleeper.sleeperId,
        false,
      );
      sleepLogParams.push(...this.createSleepParams(sleepDataResp));
      const points = this.createPoints(sleepDataResp);
      if (!points.length) {
        this.logger.info('No more historical points found');
        break;
      }
      historicalPoints.push(...points);
      currentDate = subMonths(currentDate, 1);
    }
    this.logger.info({ count: historicalPoints.length }, 'Historical points fetched');

    return { influxPoints: historicalPoints, fitbitSleepLogs: sleepLogParams };
  }

  async getDailyData(startDate: Date): Promise<ScrapedSessions> {
    this.logger.info({ startDate }, 'Fetching daily sleep data');
    const dailyPoints: Point[] = [];
    const sleepLogParams: SleepLogParams[] = [];
    const today = new TZDate(new Date(), this.timezone);
    let date = new TZDate(startDate, this.timezone);
    while (date <= today) {
      const dateString = format(date, 'yyyy-MM-dd');
      this.logger.trace({ date: dateString }, 'Requesting daily sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'D1',
        this.sleeper.sleeperId,
        false,
      );
      const points = this.createPoints(sleepDataResp);
      sleepLogParams.push(...this.createSleepParams(sleepDataResp));
      dailyPoints.push(...points);
      date = addDays(date, 1);
    }
    this.logger.info({ count: dailyPoints.length }, 'Daily points fetched');
    return { influxPoints: dailyPoints, fitbitSleepLogs: sleepLogParams };
  }

  async scrapeSleeperData(): Promise<void> {
    this.logger.info('Scraping sleeper data');

    const fitbitRefreshToken = await getFitbitRefreshToken(this.sleeper.sleeperId);
    if (config.fitbitClientId && config.fitbitClientSecret && fitbitRefreshToken) {
      this.fitbitApi = new Fitbit({ sleeperId: this.sleeper.sleeperId, logger: this.logger });
    } else {
      this.logger.info('Missing Fitbit configuration, skipping Fitbit reporting for this sleeper');
    }

    const bucket = config.influxdbBucket;
    const query = `from(bucket: "${bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "sleep_data" and r.sleeper_id == "${this.sleeper.sleeperId}") |> sort(columns: ["_time"], desc: true) |> limit(n: 1)`;

    let lastDate: Date | undefined;
    await new Promise<void>((resolve, reject) => {
      this.influxQueryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const o = tableMeta.toObject(row);
          if (o._time) {
            lastDate = new Date(o._time);
            this.logger.debug({ lastDate }, 'Found last date in InfluxDB');
          }
        },
        error: (error: Error) => {
          this.logger.error({ error }, 'Error querying InfluxDB');
          reject(error);
        },
        complete: () => {
          resolve();
        },
      });
    });

    let scrapedSessions: ScrapedSessions;
    if (lastDate) {
      const startDate = addDays(new TZDate(lastDate, this.timezone), 1);
      this.logger.info({ startDate }, 'Fetching daily data since last date');
      scrapedSessions = await this.getDailyData(startDate);
    } else {
      this.logger.info('No previous data found, fetching historical data');
      scrapedSessions = await this.getHistoricalData();
    }

    this.logger.info(
      { count: scrapedSessions.influxPoints.length },
      'Points scraped. Writing to InfluxDB...',
    );
    this.influxWriteApi.writePoints(scrapedSessions.influxPoints);
    await this.publishSleepSessions(scrapedSessions.fitbitSleepLogs);
  }
}
