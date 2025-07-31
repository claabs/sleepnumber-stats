import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import z from 'zod';

export const HealthConnectUser = z.object({
  username: z.string(),
  password: z.string().min(1),
});

export type HealthConnectUser = z.infer<typeof HealthConnectUser>;

export const SleepConfig = z.object({
  sleepNumberEmail: z.email(),
  sleepNumberPassword: z.string().min(1),
  influxdbUrl: z.url(),
  influxdbToken: z.string().min(1),
  influxdbOrg: z.string().min(1),
  influxdbBucket: z.string().min(1),
  emptyBucket: z.boolean().default(false),
  tz: z.string().default(process.env.TZ ?? 'UTC'),
  healthConnect: z.record(z.string().min(1), HealthConnectUser).optional(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type SleepConfig = z.infer<typeof SleepConfig>;

export const configPath = path.resolve(process.env.CONFIG_PATH ?? './config');

export const config = SleepConfig.parse(
  JSON.parse(await fsPromises.readFile(path.join(configPath, 'config.json'), 'utf-8')),
);
