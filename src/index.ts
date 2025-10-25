/* eslint-disable no-await-in-loop */

import 'dotenv/config';
import ky from 'ky';
import { PrometheusDriver } from 'prometheus-query';

import { config } from './config.ts';
import { logger } from './logger.ts';
import { METRIC_NAMES, SleeperScraper } from './sleeper-scraper.ts';
import { SleepNumberAPI } from './sleepnumber-api.ts';

async function main() {
  try {
    logger.info('Starting SleepNumber stats ingestion');

    const promQueryApi = new PrometheusDriver({
      endpoint: config.victoriaMetricsUrl,
      auth: config.victoriaMetricsAuth,
    });

    if (config.deleteMetrics) {
      logger.info('deleteMetrics is true, deleting all data from metrics database');
      const searchParams = new URLSearchParams();
      METRIC_NAMES.forEach((name) => {
        searchParams.append('match[]', name);
      });
      const authHeader = config.victoriaMetricsAuth
        ? `Basic ${Buffer.from(
            `${config.victoriaMetricsAuth.username}:${config.victoriaMetricsAuth.password}`,
          ).toString('base64')}`
        : undefined;
      await ky.get(new URL('/api/v1/admin/tsdb/delete_series', config.victoriaMetricsUrl), {
        headers: {
          Authorization: authHeader,
        },
        searchParams,
      });
      logger.info('All data deleted from metrics database');
    }
    const api = new SleepNumberAPI({
      email: config.sleepNumberEmail,
      password: config.sleepNumberPassword,
      logger,
    });
    const sleeperResp = await api.getSleeper();
    logger.info({ sleeperCount: sleeperResp.sleepers.length }, 'Fetched sleepers');

    const { beds } = await api.getBed();
    // eslint-disable-next-line no-restricted-syntax
    for (const sleeper of sleeperResp.sleepers) {
      const sleeperLogger = logger.child({ sleeper: sleeper.firstName });
      sleeperLogger.info({ sleeperId: sleeper.sleeperId }, 'Processing sleeper');

      const sleeperScraper = new SleeperScraper({
        api,
        sleeper,
        queryApi: promQueryApi,
        beds,
        logger: sleeperLogger,
      });
      await sleeperScraper.scrapeSleeperData();
      sleeperLogger.info('Scrape complete');
    }
    logger.info('All points written to metrics database');
  } catch (err) {
    logger.error(err);
  }
}

await main();
