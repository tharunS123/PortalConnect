import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logs in production (machine-parseable for log aggregators),
 * human-readable output in development.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'portalconnect-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport: env.isProduction || env.isTest ? undefined : { target: 'pino-pretty' },
});
