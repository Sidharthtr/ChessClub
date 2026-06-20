import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { MessageType } from '../../shared/constants/messageTypes';
import { GameService } from '../game/GameService';
import { MatchmakingService } from '../matchmaking/MatchmakingService';
import { IncomingMessageSchema } from '../../shared/schemas/message.schema';
import { sendError, handleWsError } from '../../shared/errors/errorHandler';
import { authService } from '../auth/AuthService';
import { logger } from '../../shared/utils/logger';

export class SocketManager {
  private users: WebSocket[] = [];
  private socketMeta: WeakMap<WebSocket, { userId: string | null; username: string | null }> = new WeakMap();
  private gameService: GameService;
  private matchmakingService: MatchmakingService;

  constructor() {
    this.gameService = new GameService();
    this.matchmakingService = new MatchmakingService(this.gameService);
  }

  addUser(socket: WebSocket, req: IncomingMessage): void {
    const meta = this.extractMeta(req);
    this.socketMeta.set(socket, meta);
    this.users.push(socket);
    logger.info({ totalUsers: this.users.length, authenticated: !!meta.userId }, 'user_connected');
    this.handleMessages(socket);
  }

  removeUser(socket: WebSocket): void {
    this.users = this.users.filter(user => user !== socket);
    this.matchmakingService.removePendingUser(socket);

    const game = this.gameService.findGame(socket);
    if (game) game.resign(socket);

    logger.info({ totalUsers: this.users.length }, 'user_disconnected');
  }

  private extractMeta(req: IncomingMessage): { userId: string | null; username: string | null } {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) return { userId: null, username: null };
      const payload = authService.verifyToken(token);
      return { userId: payload.userId, username: payload.username };
    } catch {
      return { userId: null, username: null };
    }
  }

  private handleMessages(socket: WebSocket): void {
    socket.on('message', (data) => {
      let raw: unknown;

      try {
        raw = JSON.parse(data.toString());
      } catch {
        sendError(socket, 'Invalid JSON');
        return;
      }

      const result = IncomingMessageSchema.safeParse(raw);
      if (!result.success) {
        logger.warn({ errors: result.error.issues }, 'invalid_message_shape');
        sendError(socket, 'Invalid message format');
        return;
      }

      const message = result.data;
      logger.debug({ type: message.type }, 'message_received');

      try {
        switch (message.type) {
          case MessageType.INIT_GAME: {
            const meta = this.socketMeta.get(socket) ?? { userId: null, username: null };
            this.matchmakingService.handleInitGame(socket, message.timeControlMs, meta.userId, meta.username);
            break;
          }

          case MessageType.MOVE: {
            const game = this.gameService.findGame(socket);
            game ? game.makeMove(socket, message.move) : sendError(socket, 'No active game found');
            break;
          }

          case MessageType.RESIGN:
            this.gameService.findGame(socket)?.resign(socket);
            break;

          case MessageType.DRAW_REQUEST:
            this.gameService.findGame(socket)?.requestDraw(socket);
            break;

          case MessageType.DRAW_ACCEPT:
            this.gameService.findGame(socket)?.acceptDraw(socket);
            break;

          case MessageType.DRAW_REJECT:
            this.gameService.findGame(socket)?.rejectDraw(socket);
            break;

          case MessageType.TAKEBACK_REQUEST:
            this.gameService.findGame(socket)?.requestTakeback(socket);
            break;

          case MessageType.TAKEBACK_ACCEPT:
            this.gameService.findGame(socket)?.acceptTakeback(socket);
            break;

          case MessageType.TAKEBACK_REJECT:
            this.gameService.findGame(socket)?.rejectTakeback(socket);
            break;
        }
      } catch (error) {
        handleWsError(socket, error);
      }
    });
  }
}
