import { pino, stdTimeFunctions } from 'pino';

import { config } from './config.ts';

export const logger = pino({
  level: config.logLevel,
  formatters: { level: (label) => ({ label }) },
  timestamp: stdTimeFunctions.isoTime,
  base: {},
});
