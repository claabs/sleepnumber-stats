import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import z from 'zod';

export const SleepConfig = z.object({
  sleepNumberEmail: z.email(),
  sleepNumberPassword: z.string().min(1),
  influxdbUrl: z.url(),
  influxdbToken: z.string().min(1),
  influxdbOrg: z.string().min(1),
  influxdbBucket: z.string().min(1),
  emptyBucket: z.boolean().default(false),
  tz: z.string().default(process.env.TZ ?? 'UTC'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  fitbitRedirectUri: z.url().optional(),
  fitbitClientId: z.string().optional(),
  fitbitClientSecret: z.string().optional(),
  port: z.number().min(1).max(65535).default(3000),
  runOnStartup: z.boolean().default(false),
  runOnce: z.boolean().default(false),
  schedule: z.string().default('15 10 * * *'),
});

export type SleepConfig = z.infer<typeof SleepConfig>;

export const configPath = path.resolve(process.env.CONFIG_PATH ?? './config');

export const config = SleepConfig.parse(
  JSON.parse(await fsPromises.readFile(path.join(configPath, 'config.json'), 'utf-8')),
);
