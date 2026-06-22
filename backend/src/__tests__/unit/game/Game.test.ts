import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type WebSocket from 'ws';
import { MessageType } from '../../../shared/constants/messageTypes';

vi.mock('../../../modules/history/HistoryService', () => ({
  historyService: { saveGame: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../../../shared/utils/generateGameId', () => ({
  generateGameId: vi.fn().mockReturnValue('test-game-id'),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Game } from '../../../modules/game/Game';
import type { RematchCallback } from '../../../modules/game/Game';

function mockSocket() {
  return { readyState: 1, send: vi.fn() } as unknown as WebSocket & {
    send: ReturnType<typeof vi.fn>;
  };
}

function lastMsg(socket: { send: ReturnType<typeof vi.fn> }) {
  const calls = socket.send.mock.calls;
  if (!calls.length) return null;
  return JSON.parse(calls[calls.length - 1][0] as string);
}

describe('Game', () => {
  let p1: ReturnType<typeof mockSocket>;
  let p2: ReturnType<typeof mockSocket>;
  let onRematch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    p1 = mockSocket();
    p2 = mockSocket();
    onRematch = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  function makeGame(opts: { wId?: string; bId?: string } = {}) {
    return new Game(
      p1 as unknown as WebSocket,
      p2 as unknown as WebSocket,
      600_000,
      0,
      vi.fn(),
      onRematch as unknown as RematchCallback,
      opts.wId ?? null,
      opts.bId ?? null,
    );
  }

  // ─── Constructor ───────────────────────────────────────────────────────────

  it('sends INIT_GAME to both players with correct colors', () => {
    makeGame();
    const msg1 = lastMsg(p1);
    const msg2 = lastMsg(p2);
    expect(msg1.type).toBe(MessageType.INIT_GAME);
    expect(msg1.payload.color).toBe('white');
    expect(msg2.type).toBe(MessageType.INIT_GAME);
    expect(msg2.payload.color).toBe('black');
  });

  it('sends correct gameId to both players', () => {
    makeGame();
    expect(lastMsg(p1).payload.gameId).toBe('test-game-id');
    expect(lastMsg(p2).payload.gameId).toBe('test-game-id');
  });

  // ─── makeMove() ────────────────────────────────────────────────────────────

  it('valid move is broadcast to both players', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    expect(lastMsg(p1).type).toBe(MessageType.MOVE);
    expect(lastMsg(p2).type).toBe(MessageType.MOVE);
  });

  it('move payload contains the move and clock snapshot', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    const msg = lastMsg(p1);
    expect(msg.payload.move).toMatchObject({ from: 'e2', to: 'e4' });
    expect(msg.payload.clock).toHaveProperty('white');
    expect(msg.payload.clock).toHaveProperty('black');
  });

  it('player2 trying to move on white turn receives GAME_ALERT', () => {
    const game = makeGame();
    game.makeMove(p2 as unknown as WebSocket, { from: 'e7', to: 'e5' });
    expect(lastMsg(p2).type).toBe(MessageType.GAME_ALERT);
    expect(lastMsg(p2).payload).toMatch(/not your turn/i);
  });

  it('player1 trying to move twice in a row receives GAME_ALERT', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    p1.send.mockClear();
    game.makeMove(p1 as unknown as WebSocket, { from: 'd2', to: 'd4' });
    expect(lastMsg(p1).type).toBe(MessageType.GAME_ALERT);
  });

  it('invalid move receives GAME_ALERT', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e6' }); // illegal
    expect(lastMsg(p1).type).toBe(MessageType.GAME_ALERT);
    expect(lastMsg(p1).payload).toMatch(/invalid move/i);
  });

  it('makeMove after game is over is a no-op', () => {
    const game = makeGame();
    game.resign(p1 as unknown as WebSocket);
    p1.send.mockClear();
    p2.send.mockClear();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    expect(p1.send).not.toHaveBeenCalled();
    expect(p2.send).not.toHaveBeenCalled();
  });

  it("scholar's mate sends GAME_OVER checkmate with white as winner", () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    game.makeMove(p2 as unknown as WebSocket, { from: 'e7', to: 'e5' });
    game.makeMove(p1 as unknown as WebSocket, { from: 'f1', to: 'c4' });
    game.makeMove(p2 as unknown as WebSocket, { from: 'b8', to: 'c6' });
    game.makeMove(p1 as unknown as WebSocket, { from: 'd1', to: 'h5' });
    game.makeMove(p2 as unknown as WebSocket, { from: 'g8', to: 'f6' });
    game.makeMove(p1 as unknown as WebSocket, { from: 'h5', to: 'f7' }); // Qxf7#
    const msg1 = lastMsg(p1);
    const msg2 = lastMsg(p2);
    expect(msg1.type).toBe(MessageType.GAME_OVER);
    expect(msg1.payload.winner).toBe('white');
    expect(msg1.payload.reason).toBe('checkmate');
    expect(msg2.type).toBe(MessageType.GAME_OVER);
  });

  // ─── resign() ──────────────────────────────────────────────────────────────

  it('player1 resigns — both players receive GAME_OVER with winner black', () => {
    const game = makeGame();
    game.resign(p1 as unknown as WebSocket);
    const msg = lastMsg(p1);
    expect(msg.type).toBe(MessageType.GAME_OVER);
    expect(msg.payload.winner).toBe('black');
    expect(msg.payload.reason).toBe('resignation');
    expect(lastMsg(p2).payload.winner).toBe('black');
  });

  it('player2 resigns — winner is white', () => {
    const game = makeGame();
    game.resign(p2 as unknown as WebSocket);
    expect(lastMsg(p1).payload.winner).toBe('white');
  });

  // ─── draw flow ─────────────────────────────────────────────────────────────

  it('requestDraw forwards DRAW_REQUEST to opponent', () => {
    const game = makeGame();
    game.requestDraw(p1 as unknown as WebSocket);
    expect(lastMsg(p2).type).toBe(MessageType.DRAW_REQUEST);
  });

  it('acceptDraw ends game as a draw', () => {
    const game = makeGame();
    game.requestDraw(p1 as unknown as WebSocket);
    game.acceptDraw(p2 as unknown as WebSocket);
    const msg = lastMsg(p1);
    expect(msg.type).toBe(MessageType.GAME_OVER);
    expect(msg.payload.winner).toBeNull();
    expect(msg.payload.reason).toBe('draw_by_agreement');
  });

  it('acceptDraw with no pending request sends GAME_ALERT', () => {
    const game = makeGame();
    game.acceptDraw(p2 as unknown as WebSocket); // no pending draw
    expect(lastMsg(p2).type).toBe(MessageType.GAME_ALERT);
  });

  it('rejectDraw sends DRAW_REJECT to both players', () => {
    const game = makeGame();
    game.requestDraw(p1 as unknown as WebSocket);
    game.rejectDraw(p2 as unknown as WebSocket);
    expect(lastMsg(p1).type).toBe(MessageType.DRAW_REJECT);
    expect(lastMsg(p2).type).toBe(MessageType.DRAW_REJECT);
  });

  // ─── takeback flow ─────────────────────────────────────────────────────────

  it('requestTakeback from a player who did not make the last move sends GAME_ALERT', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' }); // moveCount=1
    // p2 did not make the last move — only p1 (white) can request takeback
    game.requestTakeback(p2 as unknown as WebSocket);
    expect(lastMsg(p2).type).toBe(MessageType.GAME_ALERT);
  });

  it('requestTakeback forwards TAKEBACK_REQUEST to opponent', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' }); // moveCount=1, p1 last moved
    game.requestTakeback(p1 as unknown as WebSocket);
    expect(lastMsg(p2).type).toBe(MessageType.TAKEBACK_REQUEST);
  });

  it('acceptTakeback sends TAKEBACK_ACCEPT to both with decremented moveCount', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    game.requestTakeback(p1 as unknown as WebSocket);
    game.acceptTakeback(p2 as unknown as WebSocket);
    const msg = lastMsg(p1);
    expect(msg.type).toBe(MessageType.TAKEBACK_ACCEPT);
    expect(msg.payload.moveCount).toBe(0);
    expect(msg.payload.fen).toBeDefined();
  });

  it('rejectTakeback sends TAKEBACK_REJECT to both players', () => {
    const game = makeGame();
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    game.requestTakeback(p1 as unknown as WebSocket);
    game.rejectTakeback(p2 as unknown as WebSocket);
    expect(lastMsg(p1).type).toBe(MessageType.TAKEBACK_REJECT);
    expect(lastMsg(p2).type).toBe(MessageType.TAKEBACK_REJECT);
  });

  // ─── rematch flow ───────────────────────────────────────────────────────────

  it('requestRematch by one player forwards REMATCH_REQUEST to opponent', () => {
    const game = makeGame();
    game.resign(p1 as unknown as WebSocket); // end the game
    p2.send.mockClear();
    game.requestRematch(p1 as unknown as WebSocket);
    expect(lastMsg(p2).type).toBe(MessageType.REMATCH_REQUEST);
  });

  it('both players request rematch — onRematch fires with swapped colors', () => {
    const game = makeGame({ wId: 'w-user', bId: 'b-user' });
    game.resign(p1 as unknown as WebSocket);
    game.requestRematch(p1 as unknown as WebSocket);
    game.acceptRematch(p2 as unknown as WebSocket);
    // colors are swapped: p2 (was black) becomes white
    expect(onRematch).toHaveBeenCalledOnce();
    const [newWhiteSocket] = onRematch.mock.calls[0];
    expect(newWhiteSocket).toBe(p2);
  });

  it('requestRematch before game is over is a no-op', () => {
    const game = makeGame();
    p2.send.mockClear();
    game.requestRematch(p1 as unknown as WebSocket);
    expect(p2.send).not.toHaveBeenCalled();
    expect(onRematch).not.toHaveBeenCalled();
  });

  // ─── reconnection ──────────────────────────────────────────────────────────

  it('getResumePayload returns correct FEN, color, and gameId', () => {
    const game = makeGame({ wId: 'w-user', bId: 'b-user' });
    game.makeMove(p1 as unknown as WebSocket, { from: 'e2', to: 'e4' });
    const payload = JSON.parse(game.getResumePayload('w-user'));
    expect(payload.type).toBe(MessageType.GAME_RESUME);
    expect(payload.payload.color).toBe('white');
    expect(payload.payload.gameId).toBe('test-game-id');
    expect(payload.payload.fen).toBeDefined();
    expect(payload.payload.moveCount).toBe(1);
  });
});
