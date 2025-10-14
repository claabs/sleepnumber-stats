import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { stringify } from 'envfile';

import { config } from './config.ts';

const envString = stringify({
  RUN_ON_STARTUP: config.runOnStartup,
  RUN_ONCE: config.runOnce,
  CRON_SCHEDULE: config.schedule,
});

await writeFile(path.join(os.homedir(), '.sleepnumber_env'), envString, 'utf-8');
