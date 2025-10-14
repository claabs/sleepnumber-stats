import { writeFile } from 'node:fs/promises';

import { stringify } from 'envfile';

import { config } from './config.ts';

const envString = stringify({
  RUN_ON_STARTUP: config.runOnStartup,
  RUN_ONCE: config.runOnce,
  CRON_SCHEDULE: config.schedule,
});

await writeFile('/app/.sleepnumber_env', envString, 'utf-8');
