/**
 * logger.ts — Application-wide Pino logger instance.
 *
 * In development (NODE_ENV !== 'production') logs are pretty-printed with
 * colour and a short timestamp (HH:MM:ss) via pino-pretty.
 * In production logs are plain JSON so they can be ingested by log aggregators
 * (Datadog, Grafana Loki, CloudWatch, etc.).
 *
 * LOG LEVEL:
 *  - production → 'info' (debug/trace suppressed to reduce noise + cost)
 *  - development → 'debug' (all messages including WS message traces)
 *
 * USAGE CONVENTION (see CLAUDE.md):
 *  logger.info({ gameId, event }, 'event_name')  ← context object FIRST, then message string
 *  Always attach structured context so logs are filterable/queryable in production.
 *
 * HOW IT CONNECTS:
 *  - Imported by almost every module; this is the single shared instance
 */

import pino from 'pino';
import { config } from '../../config/env';

export const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  ...(config.nodeEnv !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    },
  }),
});
