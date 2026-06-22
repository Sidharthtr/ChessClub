import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type WebSocket from 'ws';
import type { GameService } from '../../../modules/game/GameService';

vi.mock('../../../shared/errors/errorHandler', () => ({
  sendError: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { MatchmakingService } from '../../../modules/matchmaking/MatchmakingService';
import { sendError } from '../../../shared/errors/errorHandler';

function mockSocket(): WebSocket {
  return { readyState: 1, send: vi.fn() } as unknown as WebSocket;
}

function mockGameService(): GameService {
  return { createGame: vi.fn() } as unknown as GameService;
}

describe('MatchmakingService', () => {
  let gs: GameService;
  let svc: MatchmakingService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    gs = mockGameService();
    svc = new MatchmakingService(gs);
  });

  afterEach(() => vi.useRealTimers());

  // ─── Basic queuing ─────────────────────────────────────────────────────────

  it('single player queued — no game created', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  it('two equal-rated players are matched immediately', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    expect(gs.createGame).toHaveBeenCalledOnce();
  });

  it('queues are empty after a successful match', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    // third player queues — no immediate match since queue is empty
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    expect(gs.createGame).toHaveBeenCalledOnce(); // only the first pair
  });

  // ─── Duplicate detection ───────────────────────────────────────────────────

  it('socket already in queue receives an error, not queued again', () => {
    const s = mockSocket();
    svc.handleInitGame(s, 600_000, 0, null, null, 1200);
    svc.handleInitGame(s, 600_000, 0, null, null, 1200);
    expect(sendError).toHaveBeenCalledOnce();
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  it('same userId on two different sockets cannot self-match', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, 'user-1', null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, 'user-1', null, 1200);
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  // ─── Rating window expansion ───────────────────────────────────────────────

  it('players outside initial window (±100) are not matched immediately', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1350); // diff = 150 > 100
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  it('window expands to 150 after 10s — players with diff=150 are then matched', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1350);
    vi.advanceTimersByTime(10_000);
    expect(gs.createGame).toHaveBeenCalledOnce();
  });

  it('window does not exceed 500 regardless of wait time', () => {
    // Two players 600 apart — should never match even after many intervals
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1800);
    vi.advanceTimersByTime(200_000); // far beyond MAX_WINDOW
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  // ─── Time-control isolation ────────────────────────────────────────────────

  it('players with different time controls are not matched', () => {
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200); // 10+0
    svc.handleInitGame(mockSocket(), 600_000, 5_000, null, null, 1200); // 10+5
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  // ─── removePendingUser ─────────────────────────────────────────────────────

  it('removePendingUser removes the player before a match is found', () => {
    const s1 = mockSocket();
    svc.handleInitGame(s1, 600_000, 0, null, null, 1200);
    svc.removePendingUser(s1);
    svc.handleInitGame(mockSocket(), 600_000, 0, null, null, 1200);
    // s1 was removed, so the second player has no opponent
    expect(gs.createGame).not.toHaveBeenCalled();
  });

  it('removePendingUser on a socket not in queue is a no-op', () => {
    expect(() => svc.removePendingUser(mockSocket())).not.toThrow();
  });

  // ─── Color assignment ──────────────────────────────────────────────────────

  it('createGame is called with the two matched sockets (any order)', () => {
    const s1 = mockSocket();
    const s2 = mockSocket();
    svc.handleInitGame(s1, 600_000, 0, null, null, 1200);
    svc.handleInitGame(s2, 600_000, 0, null, null, 1200);
    const [arg1, arg2] = (gs.createGame as ReturnType<typeof vi.fn>).mock.calls[0];
    expect([s1, s2]).toContain(arg1);
    expect([s1, s2]).toContain(arg2);
    expect(arg1).not.toBe(arg2);
  });
});
