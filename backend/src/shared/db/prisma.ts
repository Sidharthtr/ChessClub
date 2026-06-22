/**
 * prisma.ts — Singleton PrismaClient instance.
 *
 * Prisma recommends a single shared client to avoid exhausting the connection
 * pool. The `globalForPrisma` trick prevents Next.js / ts-node hot-reload from
 * creating a new client on every file-save in development.
 *
 * In production the global assignment is skipped (PrismaClient is not stored
 * on globalThis) so each process gets exactly one client.
 *
 * HOW IT CONNECTS:
 *  - AuthService, HistoryService, SocketManager.handleInitGameAsync all import
 *    `prisma` from here for all database access
 *  - healthRouter imports `prisma` to run SELECT 1 in the deep health check
 *  - Vitest mocks this file: vi.mock('../../shared/db/prisma', () => ({ prisma: { ... } }))
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
