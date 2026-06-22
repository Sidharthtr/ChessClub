import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { URL } from 'url';
import { MessageType } from '../../shared/constants/messageTypes';
import { GameService } from '../game/GameService';
import { MatchmakingService } from '../matchmaking/MatchmakingService';
import { IncomingMessageSchema } from '../../shared/schemas/message.schema';
import { sendError, handleWsError } from '../../shared/errors/errorHandler';
import { authService } from '../auth/AuthService';
import { prisma } from '../../shared/db/prisma';
import { logger } from '../../shared/utils/logger';

const GRACE_PERIOD_MS = 30_000;

export class SocketManager {
  private users: WebSocket[] = [];
  private socketMeta: WeakMap<WebSocket, { userId: string | null; username: string | null }> =
    new WeakMap();
  private gracePeriods: Map<string, ReturnType<typeof setTimeout>> = new Map();
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

    if (meta.userId) {
      // Cancel grace period if this is a reconnection
      const grace = this.gracePeriods.get(meta.userId);
      if (grace) {
        clearTimeout(grace);
        this.gracePeriods.delete(meta.userId);
        logger.info({ userId: meta.userId }, 'grace_period_cancelled_reconnected');
      }

      // Resume an in-progress game if one exists for this user
      const activeGame = this.gameService.findGameByUserId(meta.userId);
      if (activeGame) {
        activeGame.replaceSocket(meta.userId, socket);
        socket.send(activeGame.getResumePayload(meta.userId));
        const opponent = activeGame.player1 === socket ? activeGame.player2 : activeGame.player1;
        if (opponent.readyState === WebSocket.OPEN) {
          opponent.send(
            JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'Opponent reconnected.' }),
          );
        }
        logger.info({ gameId: activeGame.gameId, userId: meta.userId }, 'game_resumed');
      }
    }

    logger.info({ totalUsers: this.users.length, authenticated: !!meta.userId }, 'user_connected');
    this.handleMessages(socket);
  }

  removeUser(socket: WebSocket): void {
    this.users = this.users.filter((u) => u !== socket);
    this.matchmakingService.removePendingUser(socket);

    const meta = this.socketMeta.get(socket);
    const game = this.gameService.findGame(socket);

    if (game) {
      if (meta?.userId) {
        const userId = meta.userId;
        // Give authenticated players 30 s to reconnect before resigning
        const timer = setTimeout(() => {
          this.gracePeriods.delete(userId);
          const stillActive = this.gameService.findGameByUserId(userId);
          if (stillActive) {
            const playerSocket =
              stillActive.whiteUserId === userId ? stillActive.player1 : stillActive.player2;
            logger.info({ gameId: stillActive.gameId, userId }, 'grace_period_expired_resigning');
            stillActive.resign(playerSocket);
          }
        }, GRACE_PERIOD_MS);
        this.gracePeriods.set(userId, timer);

        const opponent = game.player1 === socket ? game.player2 : game.player1;
        if (opponent.readyState === WebSocket.OPEN) {
          opponent.send(
            JSON.stringify({
              type: MessageType.GAME_ALERT,
              payload: 'Opponent disconnected. Waiting 30 seconds for reconnection…',
            }),
          );
        }
        logger.info({ gameId: game.gameId, userId }, 'grace_period_started');
      } else {
        game.resign(socket);
      }
    }

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
            this.handleInitGameAsync(
              socket,
              message.timeControlMs,
              message.incrementMs,
              meta,
            ).catch((err) => {
              logger.error({ err }, 'init_game_error');
              sendError(socket, 'Failed to join matchmaking');
            });
            break;
          }

          case MessageType.MOVE:
            this.gameService.findGame(socket)?.makeMove(socket, message.move) ??
              sendError(socket, 'No active game found');
            break;

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

          case MessageType.REMATCH_REQUEST:
            this.gameService.findGame(socket)?.requestRematch(socket);
            break;

          case MessageType.REMATCH_ACCEPT:
            this.gameService.findGame(socket)?.acceptRematch(socket);
            break;

          case MessageType.REMATCH_REJECT:
            this.gameService.findGame(socket)?.rejectRematch(socket);
            break;
        }
      } catch (error) {
        handleWsError(socket, error);
      }
    });
  }

  private async handleInitGameAsync(
    socket: WebSocket,
    timeControlMs: number | undefined,
    incrementMs: number | undefined,
    meta: { userId: string | null; username: string | null },
  ): Promise<void> {
    let rating = 1200;
    if (meta.userId) {
      const user = await prisma.user.findUnique({
        where: { id: meta.userId },
        select: { rating: true },
      });
      if (user) rating = user.rating;
    }
    this.matchmakingService.handleInitGame(
      socket,
      timeControlMs,
      incrementMs ?? 0,
      meta.userId,
      meta.username,
      rating,
    );
  }
}
