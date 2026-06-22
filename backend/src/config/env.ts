/**
 * env.ts — Centralised environment variable configuration.
 *
 * All process.env reads happen here and nowhere else. Every other file imports
 * `config` from this module so that:
 *  - Defaults are applied in one place
 *  - Tests can stub `config` instead of mocking process.env
 *  - Missing-variable bugs surface immediately on startup
 *
 * VARIABLES:
 *  PORT          — TCP port the HTTP/WS server listens on (default 8080)
 *  NODE_ENV      — 'development' | 'production' | 'test'
 *  JWT_SECRET    — HMAC key for signing JWTs (MUST be overridden in production)
 *  DATABASE_URL  — Prisma connection string (default: SQLite dev.db)
 *  CORS_ORIGIN   — Allowed origin for CORS (default: Vite dev server)
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  // Allowed CORS origin. In Docker, nginx sits in front so this is the nginx origin.
  // In local dev it is the Vite dev server.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
} as const;
