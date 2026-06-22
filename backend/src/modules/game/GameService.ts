/**
 * GameService.ts — In-memory registry of all active chess games.
 *
 * Acts as the authoritative list of live Game instances. Every time two players
 * are matched (by MatchmakingService) a Game is created here; every time a game
 * ends the Game fires its onEnd callback which removes it from this list.
 *
 * HOW IT CONNECTS:
 *  - MatchmakingService calls createGame() when two players are paired
 *  - SocketManager calls findGame(socket) / findGameByUserId(userId) on every
 *    incoming WS message to route it to the correct Game instance
 *  - SocketManager.getStats() calls getActiveCount() for the health endpoint
 *  - Prometheus: activeGames gauge tracks current count; gamesStartedTotal
 *    increments on every new game
 *
 * NOTE: All state is in-memory. After a server restart all active games are lost.
 * Phase 6 will add Redis-backed game state for zero-downtime deploys.
 */

import type { WebSocket } from 'ws';
import type { RematchCallback } from './Game';
import { Game } from './Game';
import { DEFAULT_TIME_CONTROL } from '../../shared/constants/timeControls';
import { logger } from '../../shared/utils/logger';
import { activeGames, gamesStartedTotal } from '../metrics/metrics';

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
}
