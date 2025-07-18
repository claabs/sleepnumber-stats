/* eslint-disable no-await-in-loop */

import { InfluxDB } from '@influxdata/influxdb-client';
import { DeleteAPI } from '@influxdata/influxdb-client-apis';
import 'dotenv/config';

import { SleepNumberAPI } from './api.ts';
import { logger } from './logger.ts';
import { SleeperScraper } from './sleeper-scraper.ts';

async function main() {
  const clientId = '2oa5825venq9kek1dnrhfp7rdh';
  const email = process.env.SLEEP_NUMBER_EMAIL;
  const password = process.env.SLEEP_NUMBER_PASSWORD;
  const token = process.env.INFLUXDB_TOKEN;
  const url = process.env.INFLUXDB_URL;
  const bucket = process.env.INFLUXDB_BUCKET;
  const org = process.env.INFLUXDB_ORG;

  try {
    if (!email || !password) {
      throw new Error(
        'SLEEP_NUMBER_EMAIL and SLEEP_NUMBER_PASSWORD must be set in the environment variables',
      );
    }

    if (!token || !url || !bucket || !org) {
      throw new Error(
        'INFLUXDB_TOKEN, INFLUXDB_URL, INFLUXDB_BUCKET, and INFLUXDB_ORG must be set in the environment variables',
      );
    }
    logger.info('Starting SleepNumber stats ingestion');
    const influxDbClient = new InfluxDB({ url, token, timeout: 5 * 60 * 1000 });

    if (process.env.EMPTY_BUCKET === 'true') {
      logger.info({ bucket }, 'EMPTY_BUCKET is true, deleting all data from InfluxDB bucket');
      const deleteApi = new DeleteAPI(influxDbClient);
      const start = '1970-01-01T00:00:00Z';
      const stop = new Date().toISOString();
      await deleteApi.postDelete({
        org,
        bucket,
        body: {
          start,
          stop,
        },
      });
      logger.info({ bucket }, 'All data deleted from InfluxDB bucket');
    }
    const api = new SleepNumberAPI({ clientId, email, password });
    const sleeperResp = await api.getSleeper();
    logger.info({ sleeperCount: sleeperResp.sleepers.length }, 'Fetched sleepers');

    const queryApi = influxDbClient.getQueryApi(org);
    const writeApi = influxDbClient.getWriteApi(org, bucket, 's', {});
    // eslint-disable-next-line no-restricted-syntax
    for (const sleeper of sleeperResp.sleepers) {
      logger.info({ sleeperId: sleeper.sleeperId, name: sleeper.firstName }, 'Processing sleeper');
      const sleeperScraper = new SleeperScraper(api, sleeper, queryApi);

      const points = await sleeperScraper.scrapeSleeperData();
      logger.info({ count: points.length, sleeperId: sleeper.sleeperId }, 'Points scraped');
      // Write points to InfluxDB

      writeApi.writePoints(points);
    }
    await writeApi.close();
    logger.info('All points written to InfluxDB');
  } catch (err) {
    logger.error(err);
  }
}

await main();
