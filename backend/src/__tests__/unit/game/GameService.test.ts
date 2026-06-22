import { describe, it, expect, vi, beforeEach } from 'vitest';
import type WebSocket from 'ws';
import type { Game } from '../../../modules/game/Game';

vi.mock('../../../modules/game/Game', () => ({
  // Arrow functions cannot be constructors — use a regular function so `new Game()` works
  Game: vi.fn(function (
    this: Record<string, unknown>,
    p1: WebSocket,
    p2: WebSocket,
    _t: number,
    _i: number,
    _onEnd: () => void,
    _onRematch: unknown,
    wId: string | null,
    bId: string | null,
  ) {
    this.gameId = Math.random().toString(36).slice(2);
    this.player1 = p1;
    this.player2 = p2;
    this.whiteUserId = wId ?? null;
    this.blackUserId = bId ?? null;
  }),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GameService } from '../../../modules/game/GameService';

function mockSocket(): WebSocket {
  return { readyState: 1, send: vi.fn() } as unknown as WebSocket;
}

describe('GameService', () => {
  let svc: GameService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new GameService();
  });

  it('createGame adds the game and returns it', () => {
    const s1 = mockSocket();
    const s2 = mockSocket();
    const game = svc.createGame(s1, s2);
    expect(svc.getActiveCount()).toBe(1);
    expect(game).toBeDefined();
  });

  it('findGame by player1 socket returns the game', () => {
    const s1 = mockSocket();
    const s2 = mockSocket();
    const game = svc.createGame(s1, s2);
    expect(svc.findGame(s1)).toBe(game);
  });

  it('findGame by player2 socket returns the game', () => {
    const s1 = mockSocket();
    const s2 = mockSocket();
    const game = svc.createGame(s1, s2);
    expect(svc.findGame(s2)).toBe(game);
  });

  it('findGame with unknown socket returns undefined', () => {
    svc.createGame(mockSocket(), mockSocket());
    expect(svc.findGame(mockSocket())).toBeUndefined();
  });

  it('findGameById returns the correct game', () => {
    const game = svc.createGame(mockSocket(), mockSocket());
    expect(svc.findGameById(game.gameId)).toBe(game);
  });

  it('findGameById with unknown id returns undefined', () => {
    svc.createGame(mockSocket(), mockSocket());
    expect(svc.findGameById('nonexistent')).toBeUndefined();
  });

  it('findGameByUserId returns game where user is white or black', () => {
    const game = svc.createGame(mockSocket(), mockSocket(), 600_000, 0, 'user-w', 'user-b');
    expect(svc.findGameByUserId('user-w')).toBe(game);
    expect(svc.findGameByUserId('user-b')).toBe(game);
    expect(svc.findGameByUserId('user-x')).toBeUndefined();
  });

  it('removeGame drops the game from the list', () => {
    const game = svc.createGame(mockSocket(), mockSocket());
    expect(svc.getActiveCount()).toBe(1);
    svc.removeGame(game as unknown as Game);
    expect(svc.getActiveCount()).toBe(0);
  });

  it('getActiveCount tracks multiple concurrent games', () => {
    svc.createGame(mockSocket(), mockSocket());
    svc.createGame(mockSocket(), mockSocket());
    expect(svc.getActiveCount()).toBe(2);
  });

  it('findGame returns the right game among multiple', () => {
    const s1 = mockSocket();
    const s2 = mockSocket();
    const s3 = mockSocket();
    const s4 = mockSocket();
    const gameA = svc.createGame(s1, s2);
    const gameB = svc.createGame(s3, s4);
    expect(svc.findGame(s1)).toBe(gameA);
    expect(svc.findGame(s3)).toBe(gameB);
  });
});
