/**
 * Game.ts — Core chess game entity.
 *
 * Each Game instance represents one live chess match between two WebSocket clients.
 * It owns:
 *  - a chess.js Chess board (move validation, FEN, game-over detection)
 *  - a server-authoritative ChessClock (never trusts the client for time)
 *  - references to both player sockets (player1 = white, player2 = black)
 *
 * LIFECYCLE:
 *  1. GameService.createGame() constructs a Game → constructor sends INIT_GAME to both players
 *  2. SocketManager routes all incoming WS messages here (makeMove, resign, draw, takeback, rematch)
 *  3. When the game ends, endGame() sends GAME_OVER to both players, saves history via HistoryService,
 *     and fires the onEnd callback so GameService removes it from its active list
 *  4. Reconnections: replaceSocket() swaps the socket reference; getResumePayload() sends current state
 *
 * HOW IT CONNECTS:
 *  - Constructed by GameService.createGame()
 *  - SocketManager.ts calls every public method (makeMove, resign, etc.)
 *  - ChessClock fires onTimeout → calls endGame() here
 *  - HistoryService.saveGame() called async from endGame() to persist result + update ratings
 *  - Prometheus counters: gamesFinishedTotal, movesProcessedTotal, moveProcessingLatency
 */

import { Chess } from 'chess.js';
import WebSocket from 'ws';
import { MessageType } from '../../shared/constants/messageTypes';
import type { MovePayload } from './types';
import { ChessClock } from './chess-clock';
import { generateGameId } from '../../shared/utils/generateGameId';
import { logger } from '../../shared/utils/logger';
import { DEFAULT_TIME_CONTROL } from '../../shared/constants/timeControls';
import { historyService } from '../history/HistoryService';
import { gamesFinishedTotal, movesProcessedTotal, moveProcessingLatency } from '../metrics/metrics';

type GameStatus = 'active' | 'over';

// How long after a game ends we keep its Game instance alive in GameService.
// During this window the rematch buttons work; after it the game is GC'd.
const REMATCH_WINDOW_MS = 60_000;

type GameOverReason =
  | 'checkmate'
  | 'stalemate'
  | 'draw_by_repetition'
  | 'draw_by_insufficient_material'
  | 'draw_by_50_move_rule'
  | 'draw_by_agreement'
  | 'resignation'
  | 'timeout';

export type RematchCallback = (
  white: WebSocket,
  black: WebSocket,
  whiteUserId: string | null,
  blackUserId: string | null,
  whiteUsername: string | null,
  blackUsername: string | null,
  incrementMs?: number,
) => void;

export class Game {
  public gameId: string;
  public player1: WebSocket; // white
  public player2: WebSocket; // black
  public whiteUserId: string | null;
  public blackUserId: string | null;
  private whiteUsername: string | null;
  private blackUsername: string | null;
  private board: Chess;
  private startTime: Date;
  private timeControlMs: number;
  private incrementMs: number;
  private moveCount = 0;
  private status: GameStatus = 'active';
  private clock: ChessClock;
  private pendingDrawFrom: WebSocket | null = null;
  private pendingTakebackFrom: WebSocket | null = null;
  private pendingRematchFrom: WebSocket | null = null;
  // Set when endGame() schedules cleanup. Cleared/cancelled if a rematch happens
  // (so the old game can be removed immediately) or if cleanup actually runs.
  // Keeps the game alive for REMATCH_WINDOW_MS so the rematch flow can still
  // find it via gameService.findGame(socket).
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onEnd?: () => void;
  private readonly onRematch?: RematchCallback;

  constructor(
    player1: WebSocket,
    player2: WebSocket,
    timeControlMs: number = DEFAULT_TIME_CONTROL.baseMs,
    incrementMs = 0,
    onEnd?: () => void,
    onRematch?: RematchCallback,
    whiteUserId: string | null = null,
    blackUserId: string | null = null,
    whiteUsername: string | null = null,
    blackUsername: string | null = null,
  ) {
    this.gameId = generateGameId();
    this.player1 = player1;
    this.player2 = player2;
    this.whiteUserId = whiteUserId;
    this.blackUserId = blackUserId;
    this.whiteUsername = whiteUsername;
    this.blackUsername = blackUsername;
    this.board = new Chess();
    this.startTime = new Date();
    this.timeControlMs = timeControlMs;
    this.incrementMs = incrementMs;
    this.onEnd = onEnd;
    this.onRematch = onRematch;

    this.clock = new ChessClock(
      timeControlMs,
      (loser) => {
        this.endGame(loser === 'white' ? 'black' : 'white', 'timeout');
      },
      incrementMs,
    );

    this.safeSend(
      this.player1,
      JSON.stringify({
        type: MessageType.INIT_GAME,
        payload: {
          color: 'white',
          gameId: this.gameId,
          timeMs: timeControlMs,
          incrementMs,
          opponentUsername: blackUsername,
        },
      }),
    );
    this.safeSend(
      this.player2,
      JSON.stringify({
        type: MessageType.INIT_GAME,
        payload: {
          color: 'black',
          gameId: this.gameId,
          timeMs: timeControlMs,
          incrementMs,
          opponentUsername: whiteUsername,
        },
      }),
    );

    this.clock.start();
    logger.info({ gameId: this.gameId, timeControlMs }, 'game_created');
  }

  makeMove(socket: WebSocket, move: MovePayload): void {
    if (this.status === 'over') return;

    if (this.moveCount % 2 === 0 && socket !== this.player1) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'not your turn' }),
      );
      return;
    }
    if (this.moveCount % 2 === 1 && socket !== this.player2) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'not your turn' }),
      );
      return;
    }

    // Start the latency timer AFTER turn validation — we only measure valid attempts
    const endLatencyTimer = moveProcessingLatency.startTimer();

    try {
      this.board.move(move);
    } catch (e) {
      endLatencyTimer(); // record even on invalid move so the histogram stays honest
      logger.warn({ gameId: this.gameId, move, error: e }, 'invalid_move');
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'invalid move' }),
      );
      return;
    }

    this.clock.recordMove();
    this.moveCount++;

    const clockSnapshot = this.clock.getSnapshot();
    const movePayload = JSON.stringify({
      type: MessageType.MOVE,
      payload: { move, clock: clockSnapshot },
    });
    this.safeSend(this.player1, movePayload);
    this.safeSend(this.player2, movePayload);

    endLatencyTimer(); // stop timer after both sends complete
    movesProcessedTotal.inc();

    logger.info({ gameId: this.gameId, move, moveCount: this.moveCount }, 'move_made');

    if (this.board.isGameOver()) {
      const reason = this.getGameOverReason();
      const winner =
        reason === 'checkmate' ? (this.board.turn() === 'w' ? 'black' : 'white') : null;
      this.endGame(winner, reason);
    }
  }

  resign(socket: WebSocket): void {
    if (this.status === 'over') return;
    const winner = socket === this.player1 ? 'black' : 'white';
    logger.info({ gameId: this.gameId, winner }, 'player_resigned');
    this.endGame(winner, 'resignation');
  }

  requestDraw(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingDrawFrom === opponent) {
      this.pendingDrawFrom = null;
      this.endGame(null, 'draw_by_agreement');
      return;
    }
    this.pendingDrawFrom = socket;
    this.safeSend(opponent, JSON.stringify({ type: MessageType.DRAW_REQUEST }));
    logger.info({ gameId: this.gameId }, 'draw_requested');
  }

  acceptDraw(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingDrawFrom !== opponent) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'no pending draw request' }),
      );
      return;
    }
    this.pendingDrawFrom = null;
    this.endGame(null, 'draw_by_agreement');
  }

  rejectDraw(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingDrawFrom !== opponent) return;
    this.pendingDrawFrom = null;
    this.safeSend(socket, JSON.stringify({ type: MessageType.DRAW_REJECT }));
    this.safeSend(opponent, JSON.stringify({ type: MessageType.DRAW_REJECT }));
    logger.info({ gameId: this.gameId }, 'draw_rejected');
  }

  requestTakeback(socket: WebSocket): void {
    if (this.status === 'over' || this.moveCount === 0) return;
    const lastMover = this.moveCount % 2 === 1 ? this.player1 : this.player2;
    if (socket !== lastMover) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'you did not make the last move' }),
      );
      return;
    }
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    this.pendingTakebackFrom = socket;
    this.safeSend(opponent, JSON.stringify({ type: MessageType.TAKEBACK_REQUEST }));
    logger.info({ gameId: this.gameId }, 'takeback_requested');
  }

  acceptTakeback(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingTakebackFrom !== opponent) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'no pending takeback request' }),
      );
      return;
    }
    this.board.undo();
    this.moveCount--;
    this.clock.undoMove();
    this.pendingTakebackFrom = null;
    const payload = JSON.stringify({
      type: MessageType.TAKEBACK_ACCEPT,
      payload: { fen: this.board.fen(), moveCount: this.moveCount },
    });
    this.safeSend(this.player1, payload);
    this.safeSend(this.player2, payload);
    logger.info({ gameId: this.gameId, moveCount: this.moveCount }, 'takeback_accepted');
  }

  rejectTakeback(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingTakebackFrom !== opponent) return;
    this.pendingTakebackFrom = null;
    this.safeSend(socket, JSON.stringify({ type: MessageType.TAKEBACK_REJECT }));
    this.safeSend(opponent, JSON.stringify({ type: MessageType.TAKEBACK_REJECT }));
    logger.info({ gameId: this.gameId }, 'takeback_rejected');
  }

  // ─── Rematch ────────────────────────────────────────────────────────────────

  requestRematch(socket: WebSocket): void {
    if (this.status !== 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingRematchFrom === socket) return;
    if (this.pendingRematchFrom === opponent) {
      this.triggerRematch();
      return;
    }
    this.pendingRematchFrom = socket;
    this.safeSend(opponent, JSON.stringify({ type: MessageType.REMATCH_REQUEST }));
    logger.info({ gameId: this.gameId }, 'rematch_requested');
  }

  acceptRematch(socket: WebSocket): void {
    if (this.status !== 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingRematchFrom !== opponent) {
      this.safeSend(
        socket,
        JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'no pending rematch request' }),
      );
      return;
    }
    this.triggerRematch();
  }

  rejectRematch(socket: WebSocket): void {
    if (this.status !== 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingRematchFrom !== opponent) return;
    this.pendingRematchFrom = null;
    this.safeSend(opponent, JSON.stringify({ type: MessageType.REMATCH_REJECT }));
    logger.info({ gameId: this.gameId }, 'rematch_rejected');
  }

  private triggerRematch(): void {
    this.pendingRematchFrom = null;
    // The new game replaces this one — cancel the pending cleanup timer and
    // remove the old game from GameService immediately.
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // Swap colors so players alternate sides each rematch
    this.onRematch?.(
      this.player2,
      this.player1,
      this.blackUserId,
      this.whiteUserId,
      this.blackUsername,
      this.whiteUsername,
      this.incrementMs,
    );
    this.onEnd?.();
  }

  // ─── Reconnection ────────────────────────────────────────────────────────────

  replaceSocket(userId: string, newSocket: WebSocket): void {
    if (this.whiteUserId === userId) {
      this.player1 = newSocket;
    } else if (this.blackUserId === userId) {
      this.player2 = newSocket;
    }
  }

  getResumePayload(userId: string): string {
    const color = this.whiteUserId === userId ? 'white' : 'black';
    return JSON.stringify({
      type: MessageType.GAME_RESUME,
      payload: {
        gameId: this.gameId,
        fen: this.board.fen(),
        color,
        clock: this.clock.getSnapshot(),
        incrementMs: this.incrementMs,
        opponentUsername: color === 'white' ? this.blackUsername : this.whiteUsername,
        moveCount: this.moveCount,
      },
    });
  }

  getFen(): string {
    return this.board.fen();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private safeSend(socket: WebSocket, data: string): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  }

  private endGame(winner: 'white' | 'black' | null, reason: GameOverReason): void {
    if (this.status === 'over') return;
    this.status = 'over';
    this.clock.stop();

    const gameOverPayload = JSON.stringify({
      type: MessageType.GAME_OVER,
      payload: { winner, reason },
    });
    this.safeSend(this.player1, gameOverPayload);
    this.safeSend(this.player2, gameOverPayload);
    logger.info({ gameId: this.gameId, winner, reason }, 'game_ended');

    // Track every game completion by reason (checkmate, timeout, resignation, draw, etc.)
    gamesFinishedTotal.inc({ reason });

    if (this.whiteUserId || this.blackUserId) {
      historyService
        .saveGame({
          gameId: this.gameId,
          whiteUserId: this.whiteUserId,
          blackUserId: this.blackUserId,
          winner,
          reason,
          pgn: this.board.pgn(),
          finalFen: this.board.fen(),
          timeControlMs: this.timeControlMs,
          startedAt: this.startTime,
        })
        .then((result) => {
          if (!result) return;
          const { whiteNewRating, blackNewRating, whiteChange, blackChange } = result.ratingUpdates;
          this.safeSend(
            this.player1,
            JSON.stringify({
              type: MessageType.RATING_UPDATE,
              payload: { newRating: whiteNewRating, change: whiteChange },
            }),
          );
          this.safeSend(
            this.player2,
            JSON.stringify({
              type: MessageType.RATING_UPDATE,
              payload: { newRating: blackNewRating, change: blackChange },
            }),
          );
        });
    }

    // Defer cleanup so the rematch UI has a window to act. Without this, the
    // game is removed from GameService immediately and findGame(socket) returns
    // undefined when the player clicks Rematch.
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null;
      this.onEnd?.();
    }, REMATCH_WINDOW_MS);
  }

  private getGameOverReason(): GameOverReason {
    if (this.board.isCheckmate()) return 'checkmate';
    if (this.board.isStalemate()) return 'stalemate';
    if (this.board.isThreefoldRepetition()) return 'draw_by_repetition';
    if (this.board.isInsufficientMaterial()) return 'draw_by_insufficient_material';
    return 'draw_by_50_move_rule';
  }
}
