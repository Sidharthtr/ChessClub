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
