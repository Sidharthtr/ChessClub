import { prisma } from '../../shared/db/prisma';
import { logger } from '../../shared/utils/logger';

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

export class HistoryService {
  async saveGame(data: SaveGameData): Promise<void> {
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
    } catch (err) {
      logger.error({ err, gameId: data.gameId }, 'game_save_failed');
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
