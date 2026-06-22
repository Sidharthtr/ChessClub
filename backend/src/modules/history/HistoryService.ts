import { prisma } from '../../shared/db/prisma';
import { logger } from '../../shared/utils/logger';
import type { RatingResult } from '../rating/EloService';
import { calculateElo } from '../rating/EloService';

export interface SaveGameData {
  gameId: string;
  whiteUserId: string | null;
  blackUserId: string | null;
  winner: 'white' | 'black' | null;
  reason: string;
  pgn: string;
  finalFen: string;
  timeControlMs: number;
  startedAt: Date;
}

export interface SaveGameResult {
  ratingUpdates: RatingResult;
}

export class HistoryService {
  async saveGame(data: SaveGameData): Promise<SaveGameResult | null> {
    try {
      await prisma.game.create({
        data: {
          id: data.gameId,
          whitePlayerId: data.whiteUserId,
          blackPlayerId: data.blackUserId,
          winner: data.winner,
          reason: data.reason,
          pgn: data.pgn,
          finalFen: data.finalFen,
          timeControlMs: data.timeControlMs,
          startedAt: data.startedAt,
        },
      });
      logger.info({ gameId: data.gameId }, 'game_saved');

      if (data.whiteUserId && data.blackUserId) {
        const [white, black] = await Promise.all([
          prisma.user.findUnique({
            where: { id: data.whiteUserId },
            select: { rating: true, gamesCount: true },
          }),
          prisma.user.findUnique({
            where: { id: data.blackUserId },
            select: { rating: true, gamesCount: true },
          }),
        ]);

        if (white && black) {
          const result = calculateElo(
            white.rating,
            black.rating,
            white.gamesCount,
            black.gamesCount,
            data.winner,
          );

          await Promise.all([
            prisma.user.update({
              where: { id: data.whiteUserId },
              data: { rating: result.whiteNewRating, gamesCount: { increment: 1 } },
            }),
            prisma.user.update({
              where: { id: data.blackUserId },
              data: { rating: result.blackNewRating, gamesCount: { increment: 1 } },
            }),
          ]);

          logger.info(
            {
              gameId: data.gameId,
              whiteChange: result.whiteChange,
              blackChange: result.blackChange,
            },
            'ratings_updated',
          );
          return { ratingUpdates: result };
        }
      }

      return null;
    } catch (err) {
      logger.error({ err, gameId: data.gameId }, 'game_save_failed');
      return null;
    }
  }

  async getGame(gameId: string) {
    return prisma.game.findUnique({
      where: { id: gameId },
      include: {
        whitePlayer: { select: { id: true, username: true, rating: true } },
        blackPlayer: { select: { id: true, username: true, rating: true } },
      },
    });
  }

  async getUserGames(userId: string) {
    return prisma.game.findMany({
      where: { OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }] },
      include: {
        whitePlayer: { select: { id: true, username: true, rating: true } },
        blackPlayer: { select: { id: true, username: true, rating: true } },
      },
      orderBy: { endedAt: 'desc' },
      take: 50,
    });
  }
}

export const historyService = new HistoryService();
