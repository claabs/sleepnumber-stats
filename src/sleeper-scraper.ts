/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
import { Point } from '@influxdata/influxdb-client';

import { logger } from './logger.ts';

import type { QueryApi } from '@influxdata/influxdb-client';

import type { SleepNumberAPI } from './api.ts';
import type { SleepDataStructure } from './models/sessions/sleep-data.model.ts';
import type { Sleeper } from './models/sleeper/sleeper.model.ts';

const toLocalDateString = (date: Date): string => {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

export class SleeperScraper {
  private api: SleepNumberAPI;

  private sleeper: Sleeper;

  private influxQueryApi: QueryApi;

  constructor(api: SleepNumberAPI, sleeper: Sleeper, influxQueryApi: QueryApi) {
    this.api = api;
    this.sleeper = sleeper;
    this.influxQueryApi = influxQueryApi;
    logger.debug({ sleeperId: this.sleeper.sleeperId }, 'SleeperScraper initialized');
  }

  private createPoints(sleepDataStruct: SleepDataStructure): Point[] {
    logger.trace({ days: sleepDataStruct.sleepData.length }, 'Creating points from sleep data');
    return (
      sleepDataStruct.sleepData
        .map((sleepDataDay) => {
          const longestSession = sleepDataDay.sessions.find((session) => session.longest);
          if (longestSession) {
            logger.debug(
              { endDate: longestSession.endDate, sleeperId: this.sleeper.sleeperId },
              'Creating point for session',
            );
            const point = new Point('sleep_data')
              .timestamp(new Date(longestSession.endDate))
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

  async getHistoricalData(): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId }, 'Fetching historical sleep data');
    const historicalPoints: Point[] = [];
    const currentDate = new Date();
    currentDate.setDate(1);
    currentDate.setHours(0, 0, 0, 1);

    while (true) {
      const dateString = toLocalDateString(currentDate);
      logger.trace({ date: dateString }, 'Requesting monthly sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'M1',
        this.sleeper.sleeperId,
        false,
      );
      const points = this.createPoints(sleepDataResp);
      if (!points.length) {
        logger.info('No more historical points found');
        break;
      }
      historicalPoints.push(...points);
      // Go to the last day of the previous month
      currentDate.setDate(0);
      // Go to the first day of the month
      currentDate.setDate(1);
    }
    logger.info({ count: historicalPoints.length }, 'Historical points fetched');
    return historicalPoints;
  }

  async getDailyData(startDate: Date): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId, startDate }, 'Fetching daily sleep data');
    const dailyPoints: Point[] = [];
    const today = new Date();
    const date = new Date(startDate);
    while (date <= today) {
      const dateString = toLocalDateString(date);
      logger.trace({ date: dateString }, 'Requesting daily sleep data');
      const sleepDataResp = await this.api.getSleepData(
        dateString,
        'D1',
        this.sleeper.sleeperId,
        false,
      );
      const points = this.createPoints(sleepDataResp);
      dailyPoints.push(...points);
      date.setDate(date.getDate() + 1);
    }
    logger.info({ count: dailyPoints.length }, 'Daily points fetched');
    return dailyPoints;
  }

  async scrapeSleeperData(): Promise<Point[]> {
    logger.info({ sleeperId: this.sleeper.sleeperId }, 'Scraping sleeper data');
    const bucket = process.env.INFLUXDB_BUCKET;
    const org = process.env.INFLUXDB_ORG;
    if (!bucket || !org) {
      logger.error('InfluxDB bucket or org not configured');
      throw new Error('InfluxDB bucket or org not configured');
    }
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
      const startDate = new Date(lastDate.getTime());
      startDate.setDate(startDate.getDate() + 1);
      logger.info({ startDate }, 'Fetching daily data since last date');
      return this.getDailyData(startDate);
    }
    logger.info('No previous data found, fetching historical data');
    return this.getHistoricalData();
  }
}
