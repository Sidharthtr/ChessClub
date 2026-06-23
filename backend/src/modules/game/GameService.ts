/**
 * GameService.ts — In-memory registry of all active chess games.
 *
 * Acts as the authoritative list of live Game instances. Every time two players
 * are matched (by MatchmakingService) a Game is created here; every time a game
 * ends the Game fires its onEnd callback which removes it from this list.
 *
 * CRASH RECOVERY:
 *  restoreFromDb() is called once at server startup. It loads all ActiveGame rows
 *  from the DB and calls recoverGame() for each, reconstructing Game objects with
 *  dummy closed sockets. When players reconnect, SocketManager.addUser() finds
 *  their game via findGameByUserId(), calls replaceSocket(), and sends GAME_RESUME
 *  — the same path as a normal mid-session reconnect.
 *
 * HOW IT CONNECTS:
 *  - MatchmakingService calls createGame() when two players are paired
 *  - SocketManager calls findGame(socket) / findGameByUserId(userId) on every
 *    incoming WS message to route it to the correct Game instance
 *  - SocketManager.getStats() calls getActiveCount() for the health endpoint
 *  - Prometheus: activeGames gauge tracks current count; gamesStartedTotal
 *    increments on every new game
 */

import { WebSocket } from 'ws';
import type { RematchCallback } from './Game';
import { Game } from './Game';
import { gameStateService, type ActiveGameSnapshot } from './GameStateService';
import { DEFAULT_TIME_CONTROL } from '../../shared/constants/timeControls';
import { logger } from '../../shared/utils/logger';
import { activeGames, gamesStartedTotal } from '../metrics/metrics';

// If neither player reconnects within this window, the recovered game is
// silently cleaned up (no GAME_OVER sent — both players are already gone).
const RECOVERY_ABANDON_MS = 10 * 60_000;

export class GameService {
  private games: Game[] = [];

  createGame(
    player1: WebSocket,
    player2: WebSocket,
    timeControlMs: number = DEFAULT_TIME_CONTROL.baseMs,
    incrementMs = 0,
    whiteUserId: string | null = null,
    blackUserId: string | null = null,
    whiteUsername: string | null = null,
    blackUsername: string | null = null,
  ): Game {
    const onRematch: RematchCallback = (white, black, wId, bId, wName, bName, inc) => {
      this.createGame(white, black, timeControlMs, inc ?? incrementMs, wId, bId, wName, bName);
    };

    // onEnd captures `game` by closure — safe because onEnd is only called after construction
    const game = new Game(
      player1,
      player2,
      timeControlMs,
      incrementMs,
      () => {
        this.removeGame(game);
        logger.info({ gameId: game.gameId }, 'game_cleaned_up');
      },
      onRematch,
      whiteUserId,
      blackUserId,
      whiteUsername,
      blackUsername,
    );
    this.games.push(game);

    gamesStartedTotal.inc();
    activeGames.inc();

    return game;
  }

  findGame(socket: WebSocket): Game | undefined {
    return this.games.find((g) => g.player1 === socket || g.player2 === socket);
  }

  findGameById(gameId: string): Game | undefined {
    return this.games.find((g) => g.gameId === gameId);
  }

  findGameByUserId(userId: string): Game | undefined {
    return this.games.find((g) => g.whiteUserId === userId || g.blackUserId === userId);
  }

  removeGame(game: Game): void {
    this.games = this.games.filter((g) => g !== game);
    activeGames.dec();
  }

  getActiveCount(): number {
    return this.games.length;
  }

  // ─── Crash recovery ───────────────────────────────────────────────────────────

  async restoreFromDb(): Promise<void> {
    const snapshots = await gameStateService.loadAll();
    // Only games with at least one authenticated player can be resumed —
    // anonymous players have no reconnect identity.
    const recoverable = snapshots.filter((s) => s.whiteUserId !== null || s.blackUserId !== null);

    for (const snapshot of recoverable) {
      this.recoverGame(snapshot);
    }

    if (recoverable.length > 0) {
      logger.info({ count: recoverable.length }, 'games_recovered_on_startup');
    }
  }

  private recoverGame(snapshot: ActiveGameSnapshot): void {
    // Dummy WebSocket — always CLOSED so safeSend() silently drops messages
    // until a real socket is slotted in via replaceSocket().
    const dummy = { readyState: WebSocket.CLOSED, send: () => {} } as unknown as WebSocket;

    const onRematch: RematchCallback = (white, black, wId, bId, wName, bName, inc) => {
      this.createGame(
        white,
        black,
        snapshot.timeControlMs,
        inc ?? snapshot.incrementMs,
        wId,
        bId,
        wName,
        bName,
      );
    };

    const game = new Game(
      dummy,
      dummy,
      snapshot.timeControlMs,
      snapshot.incrementMs,
      () => {
        this.removeGame(game);
        logger.info({ gameId: game.gameId }, 'game_cleaned_up');
      },
      onRematch,
      snapshot.whiteUserId,
      snapshot.blackUserId,
      snapshot.whiteUsername,
      snapshot.blackUsername,
      snapshot, // triggers recovery path in constructor
    );

    this.games.push(game);
    activeGames.inc();

    // Auto-cleanup: if no player reconnects within RECOVERY_ABANDON_MS,
    // remove the game silently (it can't be played — no sockets).
    setTimeout(() => {
      if (!this.games.includes(game)) return; // already ended normally
      logger.warn({ gameId: game.gameId }, 'recovered_game_abandoned_no_reconnect');
      this.removeGame(game);
      gameStateService.remove(game.gameId).catch(() => {});
    }, RECOVERY_ABANDON_MS);
  }
}
