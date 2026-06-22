import type { WebSocket } from 'ws';
import type { RematchCallback } from './Game';
import { Game } from './Game';
import { DEFAULT_TIME_CONTROL } from '../../shared/constants/timeControls';
import { logger } from '../../shared/utils/logger';

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
  }

  getActiveCount(): number {
    return this.games.length;
  }
}
