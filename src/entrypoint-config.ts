import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { config } from './config.ts';

const entryConfig = JSON.stringify({
  RUN_ON_STARTUP: config.runOnStartup,
  RUN_ONCE: config.runOnce,
  CRON_SCHEDULE: config.schedule,
});

await writeFile(path.join(os.homedir(), 'entry-config.json'), entryConfig, 'utf-8');
