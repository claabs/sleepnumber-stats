/* eslint-disable no-await-in-loop */

import { InfluxDB } from '@influxdata/influxdb-client';
import { DeleteAPI } from '@influxdata/influxdb-client-apis';
import 'dotenv/config';

import { SleepNumberAPI } from './api.ts';
import { config } from './config.ts';
import { logger } from './logger.ts';
import { SleeperScraper } from './sleeper-scraper.ts';

import type { HealthConnectUser } from './config.ts';

async function main() {
  const clientId = '2oa5825venq9kek1dnrhfp7rdh';

  try {
    logger.info('Starting SleepNumber stats ingestion');
    const influxDbClient = new InfluxDB({
      url: config.influxdbUrl,
      token: config.influxdbToken,
      timeout: 5 * 60 * 1000,
    });

    if (config.emptyBucket) {
      logger.info(
        { bucket: config.influxdbBucket },
        'emptyBucket is true, deleting all data from InfluxDB bucket',
      );
      const deleteApi = new DeleteAPI(influxDbClient);
      const start = '1970-01-01T00:00:00Z';
      // const start = subDays(new Date(), 1).toISOString();
      const stop = new Date().toISOString();
      await deleteApi.postDelete({
        org: config.influxdbOrg,
        bucket: config.influxdbBucket,
        body: {
          start,
          stop,
        },
      });
      logger.info({ bucket: config.influxdbBucket }, 'All data deleted from InfluxDB bucket');
    }
    const api = new SleepNumberAPI({
      clientId,
      email: config.sleepNumberEmail,
      password: config.sleepNumberPassword,
    });
    const sleeperResp = await api.getSleeper();
    logger.info({ sleeperCount: sleeperResp.sleepers.length }, 'Fetched sleepers');

    const queryApi = influxDbClient.getQueryApi(config.influxdbOrg);
    const writeApi = influxDbClient.getWriteApi(config.influxdbOrg, config.influxdbBucket, 's', {});
    const { beds } = await api.getBed();
    // eslint-disable-next-line no-restricted-syntax
    for (const sleeper of sleeperResp.sleepers) {
      logger.info({ sleeperId: sleeper.sleeperId, name: sleeper.firstName }, 'Processing sleeper');
      const healthConnectUser: HealthConnectUser | undefined =
        config.healthConnect?.[sleeper.sleeperId];
      const sleeperScraper = new SleeperScraper({
        api,
        sleeper,
        influxQueryApi: queryApi,
        beds,
        healthConnectUser,
      });

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
