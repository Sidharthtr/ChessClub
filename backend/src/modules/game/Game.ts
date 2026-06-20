import { Chess } from 'chess.js';
import WebSocket from 'ws';
import { MessageType } from '../../shared/constants/messageTypes';
import { MovePayload } from './types';
import { ChessClock } from './chess-clock';
import { generateGameId } from '../../shared/utils/generateGameId';
import { logger } from '../../shared/utils/logger';
import { TIME_CONTROLS } from '../../shared/constants/timeControls';
import { historyService } from '../history/HistoryService';

type GameStatus = 'active' | 'over';

type GameOverReason =
  | 'checkmate'
  | 'stalemate'
  | 'draw_by_repetition'
  | 'draw_by_insufficient_material'
  | 'draw_by_50_move_rule'
  | 'draw_by_agreement'
  | 'resignation'
  | 'timeout';

export class Game {
  public gameId: string;
  public player1: WebSocket; // white
  public player2: WebSocket; // black
  public whiteUserId: string | null;
  public blackUserId: string | null;
  private whiteUsername: string | null;
  private blackUsername: string | null;
  private board: Chess;
  private moves: string[];
  private startTime: Date;
  private timeControlMs: number;
  private moveCount = 0;
  private status: GameStatus = 'active';
  private clock: ChessClock;
  private pendingDrawFrom: WebSocket | null = null;
  private pendingTakebackFrom: WebSocket | null = null;
  private readonly onEnd?: () => void;

  constructor(
    player1: WebSocket,
    player2: WebSocket,
    timeControlMs: number = TIME_CONTROLS.RAPID,
    onEnd?: () => void,
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
    this.moves = [];
    this.startTime = new Date();
    this.timeControlMs = timeControlMs;
    this.onEnd = onEnd;

    this.clock = new ChessClock(timeControlMs, (loser) => {
      this.endGame(loser === 'white' ? 'black' : 'white', 'timeout');
    });

    this.player1.send(
      JSON.stringify({
        type: MessageType.INIT_GAME,
        payload: { color: 'white', gameId: this.gameId, timeMs: timeControlMs, opponentUsername: blackUsername },
      })
    );
    this.player2.send(
      JSON.stringify({
        type: MessageType.INIT_GAME,
        payload: { color: 'black', gameId: this.gameId, timeMs: timeControlMs, opponentUsername: whiteUsername },
      })
    );

    this.clock.start();
    logger.info({ gameId: this.gameId, timeControlMs }, 'game_created');
  }

  makeMove(socket: WebSocket, move: MovePayload): void {
    if (this.status === 'over') return;

    if (this.moveCount % 2 === 0 && socket !== this.player1) {
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'not your turn' }));
      return;
    }
    if (this.moveCount % 2 === 1 && socket !== this.player2) {
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'not your turn' }));
      return;
    }

    try {
      this.board.move(move);
    } catch (e) {
      logger.warn({ gameId: this.gameId, move, error: e }, 'invalid_move');
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'invalid move' }));
      return;
    }

    this.clock.recordMove();
    this.moveCount++;

    const clockSnapshot = this.clock.getSnapshot();
    const movePayload = JSON.stringify({
      type: MessageType.MOVE,
      payload: { move, clock: clockSnapshot },
    });
    this.player1.send(movePayload);
    this.player2.send(movePayload);

    logger.info({ gameId: this.gameId, move, moveCount: this.moveCount }, 'move_made');

    if (this.board.isGameOver()) {
      const reason = this.getGameOverReason();
      const winner = reason === 'checkmate'
        ? (this.board.turn() === 'w' ? 'black' : 'white')
        : null;
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
    opponent.send(JSON.stringify({ type: MessageType.DRAW_REQUEST }));
    logger.info({ gameId: this.gameId }, 'draw_requested');
  }

  acceptDraw(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingDrawFrom !== opponent) {
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'no pending draw request' }));
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
    socket.send(JSON.stringify({ type: MessageType.DRAW_REJECT }));
    opponent.send(JSON.stringify({ type: MessageType.DRAW_REJECT }));
    logger.info({ gameId: this.gameId }, 'draw_rejected');
  }

  requestTakeback(socket: WebSocket): void {
    if (this.status === 'over' || this.moveCount === 0) return;
    const lastMover = this.moveCount % 2 === 1 ? this.player1 : this.player2;
    if (socket !== lastMover) {
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'you did not make the last move' }));
      return;
    }
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    this.pendingTakebackFrom = socket;
    opponent.send(JSON.stringify({ type: MessageType.TAKEBACK_REQUEST }));
    logger.info({ gameId: this.gameId }, 'takeback_requested');
  }

  acceptTakeback(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingTakebackFrom !== opponent) {
      socket.send(JSON.stringify({ type: MessageType.GAME_ALERT, payload: 'no pending takeback request' }));
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
    this.player1.send(payload);
    this.player2.send(payload);
    logger.info({ gameId: this.gameId, moveCount: this.moveCount }, 'takeback_accepted');
  }

  rejectTakeback(socket: WebSocket): void {
    if (this.status === 'over') return;
    const opponent = socket === this.player1 ? this.player2 : this.player1;
    if (this.pendingTakebackFrom !== opponent) return;
    this.pendingTakebackFrom = null;
    socket.send(JSON.stringify({ type: MessageType.TAKEBACK_REJECT }));
    opponent.send(JSON.stringify({ type: MessageType.TAKEBACK_REJECT }));
    logger.info({ gameId: this.gameId }, 'takeback_rejected');
  }

  getFen(): string {
    return this.board.fen();
  }

  private endGame(winner: 'white' | 'black' | null, reason: GameOverReason): void {
    if (this.status === 'over') return;
    this.status = 'over';
    this.clock.stop();

    const payload = JSON.stringify({
      type: MessageType.GAME_OVER,
      payload: { winner, reason },
    });
    this.player1.send(payload);
    this.player2.send(payload);
    logger.info({ gameId: this.gameId, winner, reason }, 'game_ended');

    // Persist to DB if at least one player is authenticated
    if (this.whiteUserId || this.blackUserId) {
      historyService.saveGame({
        gameId: this.gameId,
        whiteUserId: this.whiteUserId,
        blackUserId: this.blackUserId,
        winner,
        reason,
        pgn: this.board.pgn(),
        finalFen: this.board.fen(),
        timeControlMs: this.timeControlMs,
        startedAt: this.startTime,
      });
    }

    this.onEnd?.();
  }

  private getGameOverReason(): GameOverReason {
    if (this.board.isCheckmate()) return 'checkmate';
    if (this.board.isStalemate()) return 'stalemate';
    if (this.board.isThreefoldRepetition()) return 'draw_by_repetition';
    if (this.board.isInsufficientMaterial()) return 'draw_by_insufficient_material';
    return 'draw_by_50_move_rule';
  }
}
