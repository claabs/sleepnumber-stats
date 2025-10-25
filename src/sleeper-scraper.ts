/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
import { TZDate } from '@date-fns/tz';
import { addDays, differenceInDays, format, startOfMonth, subMonths, subYears } from 'date-fns';
import { pushTimeseries } from 'prometheus-remote-write';

import { config } from './config.ts';
import { Fitbit } from './fitbit.ts';
import { getFitbitRefreshToken } from './token-store.ts';

import type { Logger } from 'pino';
import type { PrometheusDriver, RangeVector } from 'prometheus-query';
import type { Options, Timeseries } from 'prometheus-remote-write';

import type { SleepLogParams } from './fitbit.ts';
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
  fitbitSleepLogs: SleepLogParams[];
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

  private fitbitApi?: Fitbit;

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
    const historicalTimeseries: Timeseries[] = [];
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
      const points = this.createTimeseries(sleepDataResp);
      if (!points.length) {
        this.logger.info('No more historical points found');
        break;
      }
      historicalTimeseries.push(...points);
      currentDate = subMonths(currentDate, 1);
    }
    this.logger.info({ count: historicalTimeseries.length }, 'Historical points fetched');

    return { metricsData: historicalTimeseries, fitbitSleepLogs: sleepLogParams };
  }

  async getDailyData(startDate: Date): Promise<ScrapedSessions> {
    this.logger.info({ startDate }, 'Fetching daily sleep data');
    const dailyTimeseries: Timeseries[] = [];
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
      const timeseries = this.createTimeseries(sleepDataResp);
      sleepLogParams.push(...this.createSleepParams(sleepDataResp));
      dailyTimeseries.push(...timeseries);
      date = addDays(date, 1);
    }
    this.logger.info({ count: dailyTimeseries.length }, 'Daily points fetched');
    return { metricsData: dailyTimeseries, fitbitSleepLogs: sleepLogParams };
  }

  async scrapeSleeperData(): Promise<void> {
    this.logger.info('Scraping sleeper data');

    const fitbitRefreshToken = await getFitbitRefreshToken(this.sleeper.sleeperId);
    if (config.fitbitClientId && config.fitbitClientSecret && fitbitRefreshToken) {
      this.fitbitApi = new Fitbit({ sleeperId: this.sleeper.sleeperId, logger: this.logger });
    } else {
      this.logger.info('Missing Fitbit configuration, skipping Fitbit reporting for this sleeper');
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

    await this.publishSleepSessions(scrapedSessions.fitbitSleepLogs);
  }
}
