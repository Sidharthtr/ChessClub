import { WebSocket } from 'ws';
import { GameService } from '../game/GameService';
import { TIME_CONTROLS } from '../../shared/constants/timeControls';
import { logger } from '../../shared/utils/logger';

interface PendingEntry {
  socket: WebSocket;
  userId: string | null;
  username: string | null;
}

export class MatchmakingService {
  // One pending slot per time control — players only match within the same time control
  private pendingByTimeControl: Map<number, PendingEntry> = new Map();

  constructor(private gameService: GameService) {}

  handleInitGame(socket: WebSocket, timeControlMs: number = TIME_CONTROLS.RAPID, userId: string | null = null, username: string | null = null): void {
    const pending = this.pendingByTimeControl.get(timeControlMs);
    const isSameUser = userId !== null && pending?.userId === userId;
    const isDifferentSocket = pending && pending.socket !== socket;

    if (isDifferentSocket && !isSameUser) {
      const game = this.gameService.createGame(
        pending.socket,
        socket,
        timeControlMs,
        pending.userId,
        userId,
        pending.username,
        username,
      );
      this.pendingByTimeControl.delete(timeControlMs);
      logger.info({ gameId: game.gameId, timeControlMs }, 'matchmaking_success');
    } else if (isSameUser) {
      // Prevent same account from playing itself across tabs
      const { sendError } = require('../../shared/errors/errorHandler');
      sendError(socket, 'You are already in the matchmaking queue. Close the other tab first.');
      logger.warn({ userId, timeControlMs }, 'self_match_attempted');
    } else {
      this.pendingByTimeControl.set(timeControlMs, { socket, userId, username });
      logger.info({ timeControlMs }, 'waiting_for_opponent');
    }
  }

  removePendingUser(socket: WebSocket): void {
    for (const [tc, entry] of this.pendingByTimeControl.entries()) {
      if (entry.socket === socket) {
        this.pendingByTimeControl.delete(tc);
        logger.info({ timeControlMs: tc }, 'pending_user_removed_on_disconnect');
        break;
      }
    }
  }
}
