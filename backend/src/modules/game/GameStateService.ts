/**
 * GameStateService.ts — Crash-recovery persistence for live games.
 *
 * After every move, Game.ts upserts a snapshot into the ActiveGame table.
 * On server start, GameService.restoreFromDb() calls loadAll() here to
 * reconstruct every in-flight game from the database so authenticated
 * players can reconnect and continue without losing their game.
 *
 * LIFECYCLE:
 *  persist(snapshot) — called after every successful move (fire-and-forget)
 *  remove(gameId)    — called when a game ends (endGame) or is abandoned
 *  loadAll()         — called once at server startup before accepting connections
 *
 * ONLY games with at least one authenticated player are persisted: anonymous
 * games have no reconnect identity and would linger in the table indefinitely.
 */

import { prisma } from '../../shared/db/prisma';
import { logger } from '../../shared/utils/logger';

export interface ActiveGameSnapshot {
  id: string;
  fen: string;
  pgn: string;
  clockWhiteMs: number;
  clockBlackMs: number;
  /** chess.js turn() convention: 'w' | 'b' */
  turnColor: 'w' | 'b';
  moveNumber: number;
  whiteUserId: string | null;
  blackUserId: string | null;
  whiteUsername: string | null;
  blackUsername: string | null;
  timeControlMs: number;
  incrementMs: number;
  startedAt: Date;
}

export class GameStateService {
  async persist(snapshot: ActiveGameSnapshot): Promise<void> {
    try {
      await prisma.activeGame.upsert({
        where: { id: snapshot.id },
        update: {
          fen: snapshot.fen,
          pgn: snapshot.pgn,
          clockWhiteMs: snapshot.clockWhiteMs,
          clockBlackMs: snapshot.clockBlackMs,
          turnColor: snapshot.turnColor,
          moveNumber: snapshot.moveNumber,
        },
        create: {
          id: snapshot.id,
          fen: snapshot.fen,
          pgn: snapshot.pgn,
          clockWhiteMs: snapshot.clockWhiteMs,
          clockBlackMs: snapshot.clockBlackMs,
          turnColor: snapshot.turnColor,
          moveNumber: snapshot.moveNumber,
          whiteUserId: snapshot.whiteUserId,
          blackUserId: snapshot.blackUserId,
          whiteUsername: snapshot.whiteUsername,
          blackUsername: snapshot.blackUsername,
          timeControlMs: snapshot.timeControlMs,
          incrementMs: snapshot.incrementMs,
          startedAt: snapshot.startedAt,
        },
      });
    } catch (err) {
      logger.error({ err, gameId: snapshot.id }, 'active_game_persist_failed');
    }
  }

  async remove(gameId: string): Promise<void> {
    try {
      await prisma.activeGame.delete({ where: { id: gameId } });
    } catch {
      // Row may already be gone — safe to ignore
    }
  }

  async loadAll(): Promise<ActiveGameSnapshot[]> {
    const rows = await prisma.activeGame.findMany();
    return rows.map((r) => ({
      id: r.id,
      fen: r.fen,
      pgn: r.pgn,
      clockWhiteMs: r.clockWhiteMs,
      clockBlackMs: r.clockBlackMs,
      turnColor: r.turnColor as 'w' | 'b',
      moveNumber: r.moveNumber,
      whiteUserId: r.whiteUserId,
      blackUserId: r.blackUserId,
      whiteUsername: r.whiteUsername,
      blackUsername: r.blackUsername,
      timeControlMs: r.timeControlMs,
      incrementMs: r.incrementMs,
      startedAt: r.startedAt,
    }));
  }
}

export const gameStateService = new GameStateService();
