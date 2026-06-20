import { WebSocket } from 'ws';
import { Game } from './Game';
import { TIME_CONTROLS } from '../../shared/constants/timeControls';
import { logger } from '../../shared/utils/logger';

export class GameService {
  private games: Game[] = [];

  createGame(
    player1: WebSocket,
    player2: WebSocket,
    timeControlMs: number = TIME_CONTROLS.RAPID,
    whiteUserId: string | null = null,
    blackUserId: string | null = null,
    whiteUsername: string | null = null,
    blackUsername: string | null = null,
  ): Game {
    let game!: Game;
    game = new Game(player1, player2, timeControlMs, () => {
      this.removeGame(game);
      logger.info({ gameId: game.gameId }, 'game_cleaned_up');
    }, whiteUserId, blackUserId, whiteUsername, blackUsername);
    this.games.push(game);
    return game;
  }

  findGame(socket: WebSocket): Game | undefined {
    return this.games.find(game => game.player1 === socket || game.player2 === socket);
  }

  findGameById(gameId: string): Game | undefined {
    return this.games.find(game => game.gameId === gameId);
  }

  removeGame(game: Game): void {
    this.games = this.games.filter(g => g !== game);
  }

  getActiveCount(): number {
    return this.games.length;
  }
}
