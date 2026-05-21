/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addSeconds,
  differenceInDays,
  format,
  startOfMonth,
  subMonths,
  subYears,
} from 'date-fns';
import { pushTimeseries } from 'prometheus-remote-write';

import { config } from './config.ts';
import { GoogleHealth } from './google-health.js';
import { getGoogleRefreshToken } from './token-store.ts';

import type google from '@googleapis/health';
import type { Logger } from 'pino';
import type { PrometheusDriver, RangeVector } from 'prometheus-query';
import type { Options, Timeseries } from 'prometheus-remote-write';

import type { GoogleHealthSleepStageType } from './google-health.js';
import type { Bed } from './models/bed/bed.model.ts';
import type { SleepDataStructure } from './models/sessions/sleep-data.model.ts';
import type { Sleeper } from './models/sleeper/sleeper.model.ts';
import type { SleepNumberAPI } from './sleepnumber-api.ts';

export interface SleeperScraperProps {
  api: SleepNumberAPI;
  beds: Bed[];
  sleeper: Sleeper;
  queryApi: PrometheusDriver;
  logger: Logger;
}

interface ScrapedSessions {
  metricsData: Timeseries[];
  googleSleepLogs: google.health_v4.Schema$Sleep[];
}

type MetricName =
  | 'sleepnumber_stats_breath_rate'
  | 'sleepnumber_stats_fall_asleep_period'
  | 'sleepnumber_stats_heart_rate'
  | 'sleepnumber_stats_hrv'
  | 'sleepnumber_stats_in_bed'
  | 'sleepnumber_stats_out_of_bed'
  | 'sleepnumber_stats_restful'
  | 'sleepnumber_stats_restless'
  | 'sleepnumber_stats_sleep_number'
  | 'sleepnumber_stats_sleep_quotient'
  | 'sleepnumber_stats_total_sleep_session_time';

export const METRIC_NAMES: MetricName[] = [
  'sleepnumber_stats_breath_rate',
  'sleepnumber_stats_fall_asleep_period',
  'sleepnumber_stats_heart_rate',
  'sleepnumber_stats_hrv',
  'sleepnumber_stats_in_bed',
  'sleepnumber_stats_out_of_bed',
  'sleepnumber_stats_restful',
  'sleepnumber_stats_restless',
  'sleepnumber_stats_sleep_number',
  'sleepnumber_stats_sleep_quotient',
  'sleepnumber_stats_total_sleep_session_time',
];

export class SleeperScraper {
  private logger: Logger;

  private api: SleepNumberAPI;

  private sleeper: Sleeper;

  private timezone: string;

  private queryApi: PrometheusDriver;

  private googleHealthApi?: GoogleHealth;

  constructor(props: SleeperScraperProps) {
    this.logger = props.logger;
    this.api = props.api;
    this.sleeper = props.sleeper;
    this.queryApi = props.queryApi;

    const bed = props.beds.find(
      (b) =>
        b.sleeperLeftId === this.sleeper.sleeperId || b.sleeperRightId === this.sleeper.sleeperId,
    );
    this.timezone = bed?.timezone ?? config.tz;

    this.logger.debug('SleeperScraper initialized');
  }

  private createTimeseries(sleepDataStruct: SleepDataStructure): Timeseries[] {
    this.logger.trace(
      { days: sleepDataStruct.sleepData.length },
      'Creating points from sleep data',
    );

    const metricSamples: Record<MetricName, { value: number; timestamp: number }[]> = {
      sleepnumber_stats_breath_rate: [],
      sleepnumber_stats_fall_asleep_period: [],
      sleepnumber_stats_heart_rate: [],
      sleepnumber_stats_hrv: [],
      sleepnumber_stats_in_bed: [],
      sleepnumber_stats_out_of_bed: [],
      sleepnumber_stats_restful: [],
      sleepnumber_stats_restless: [],
      sleepnumber_stats_sleep_number: [],
      sleepnumber_stats_sleep_quotient: [],
      sleepnumber_stats_total_sleep_session_time: [],
    };

    sleepDataStruct.sleepData.forEach((sleepDataDay) => {
      const longestSession = sleepDataDay.sessions.find(
        (session) => session.longest && session.isFinalized,
      );
      if (!longestSession) return;

      const tsDate = new TZDate(longestSession.endDate, this.timezone);
      const timestamp = tsDate.getTime();

      metricSamples.sleepnumber_stats_breath_rate.push({
        timestamp,
        value: longestSession.avgRespirationRate,
      });
      metricSamples.sleepnumber_stats_fall_asleep_period.push({
        timestamp,
        value: longestSession.fallAsleepPeriod,
      });
      metricSamples.sleepnumber_stats_heart_rate.push({
        timestamp,
        value: longestSession.avgHeartRate,
      });
      metricSamples.sleepnumber_stats_hrv.push({
        timestamp,
        value: longestSession.hrv,
      });
      metricSamples.sleepnumber_stats_in_bed.push({
        timestamp,
        value: longestSession.inBed,
      });
      metricSamples.sleepnumber_stats_out_of_bed.push({
        timestamp,
        value: longestSession.outOfBed,
      });
      metricSamples.sleepnumber_stats_restful.push({
        timestamp,
        value: longestSession.restful,
      });
      metricSamples.sleepnumber_stats_restless.push({
        timestamp,
        value: longestSession.restless,
      });
      metricSamples.sleepnumber_stats_sleep_number.push({
        timestamp,
        value: longestSession.sleepNumber,
      });
      metricSamples.sleepnumber_stats_sleep_quotient.push({
        timestamp,
        value: longestSession.sleepQuotient,
      });
      metricSamples.sleepnumber_stats_total_sleep_session_time.push({
        timestamp,
        value: longestSession.totalSleepSessionTime,
      });
    });

    const series: Timeseries[] = Object.entries(metricSamples)
      .map(([metricName, samples]) => ({
        labels: {
          __name__: metricName,
          sleeper_id: String(this.sleeper.sleeperId),
          sleeper_name: String(this.sleeper.firstName),
        },
        samples: samples.sort((a, b) => a.timestamp - b.timestamp),
      }))
      .filter((ts) => ts.samples.length > 0);

    return series;
  }

  private createGoogleSleepLogs(sleepData: SleepDataStructure): google.health_v4.Schema$Sleep[] {
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

        this.logger.debug(
          { endDate: longestSession.endDate, sleeperId: this.sleeper.sleeperId },
          'Creating sleep session record',
        );
        const stageFields: { value: number; type: GoogleHealthSleepStageType }[] = [
          {
            value: longestSession.outOfBed,
            type: 'AWAKE',
          },
          {
            value: longestSession.fallAsleepPeriod,
            type: 'AWAKE',
          },
          {
            value: longestSession.restless,
            type: 'RESTLESS',
          },
          {
            value: longestSession.restful,
            type: 'ASLEEP',
          },
        ];
        let stageTime = new TZDate(longestSession.startDate, this.timezone);
        const stages: google.health_v4.Schema$SleepStage[] = stageFields
          .filter((field) => field.value > 0)
          .map((field) => {
            const endTime = addSeconds(new TZDate(stageTime, this.timezone), field.value);
            const stage: google.health_v4.Schema$SleepStage = {
              type: field.type,
              startTime: new TZDate(stageTime, 'UTC').toISOString(),
              endTime: new TZDate(endTime, 'UTC').toISOString(),
            };
            stageTime = endTime;
            return stage;
          });
        const sleepSession: google.health_v4.Schema$Sleep = {
          interval: {
            startTime: new TZDate(sessionStartDate, 'UTC').toISOString(),
            endTime: new TZDate(sessionEndDate, 'UTC').toISOString(),
          },
          stages,
          /**
           * https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#sleep.sleeptype
           */
          type: 'CLASSIC', // Classic sleep is a sleep with 3 stages types: AWAKE, RESTLESS and ASLEEP.
        };
        return sleepSession;
      })
      .filter((session) => session !== null);
  }

  private async publishSleepSessions(sleepLogs: google.health_v4.Schema$Sleep[]): Promise<void> {
    if (!this.googleHealthApi) return;
    if (!sleepLogs.length) return;

    this.logger.debug({ count: sleepLogs.length }, 'Publishing sleep sessions to Google Health');
    await this.googleHealthApi.createSleepLogs(sleepLogs);
    this.logger.info(
      { count: sleepLogs.length },
      'Successfully published Google Health sleep log batch',
    );
  }

  async getHistoricalData(): Promise<ScrapedSessions> {
    this.logger.info('Fetching historical sleep data');
    const historicalTimeseries: Timeseries[] = [];
    const googleSleepLogs: google.health_v4.Schema$Sleep[] = [];
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
      googleSleepLogs.push(...this.createGoogleSleepLogs(sleepDataResp));
      const points = this.createTimeseries(sleepDataResp);
      if (!points.length) {
        this.logger.info('No more historical points found');
        break;
      }
      historicalTimeseries.push(...points);
      currentDate = subMonths(currentDate, 1);
    }
    this.logger.info({ count: historicalTimeseries.length }, 'Historical points fetched');

    return { metricsData: historicalTimeseries, googleSleepLogs };
  }

  async getDailyData(startDate: Date): Promise<ScrapedSessions> {
    this.logger.info({ startDate }, 'Fetching daily sleep data');
    const dailyTimeseries: Timeseries[] = [];
    const googleSleepLogs: google.health_v4.Schema$Sleep[] = [];
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
      const timeseries = this.createTimeseries(sleepDataResp);
      googleSleepLogs.push(...this.createGoogleSleepLogs(sleepDataResp));
      dailyTimeseries.push(...timeseries);
      date = addDays(date, 1);
    }
    this.logger.info({ count: dailyTimeseries.length }, 'Daily points fetched');
    return { metricsData: dailyTimeseries, googleSleepLogs };
  }

  async scrapeSleeperData(): Promise<void> {
    this.logger.info('Scraping sleeper data');

    const googleRefreshToken = await getGoogleRefreshToken(this.sleeper.sleeperId);
    if (config.googleClientId && config.googleClientSecret && googleRefreshToken) {
      this.googleHealthApi = new GoogleHealth({
        sleeperId: this.sleeper.sleeperId,
        logger: this.logger,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      });
    } else {
      this.logger.info(
        'Missing Google Health configuration, skipping Google Health reporting for this sleeper',
      );
    }

    let lastDate: Date | undefined;

    try {
      const now = new Date();
      const resp = await this.queryApi.rangeQuery(
        `timestamp(sleepnumber_stats_total_sleep_session_time{sleeper_id="${this.sleeper.sleeperId}"})`,
        subYears(now, 1),
        now,
        6 * 60 * 60, // 1 point every 6 hours
      );
      const rangeVector = resp.result[0] as RangeVector | undefined;
      const rangeValues = (rangeVector?.values ?? []) as { time: Date; value: number }[];
      const timestamps = rangeValues.map((row) => row.value);

      if (timestamps.length > 0) {
        lastDate = new Date(Math.max(...timestamps) * 1000);
        this.logger.debug({ lastDate }, 'Found last date in Prometheus');
      }
    } catch (error) {
      this.logger.warn({ error }, 'Error querying Prometheus for last metric timestamp');
    }

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
      { count: scrapedSessions.metricsData.length },
      'Points scraped. Writing to metrics database...',
    );
    const remoteWriteConfig: Options = {
      url: new URL('/api/v1/write', config.victoriaMetricsUrl).toString(),
      auth: config.victoriaMetricsAuth,
    };
    // eslint-disable-next-line no-restricted-syntax
    for (const timeseries of scrapedSessions.metricsData) {
      this.logger.trace(
        { metric: timeseries.labels.__name__, count: timeseries.samples.length },
        'Writing timeseries to Prometheus',
      );
      await pushTimeseries(timeseries, remoteWriteConfig);
    }

    await this.publishSleepSessions(scrapedSessions.googleSleepLogs);
  }
}
