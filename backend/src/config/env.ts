import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
} as const;
