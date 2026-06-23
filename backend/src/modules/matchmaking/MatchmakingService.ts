/**
 * MatchmakingService.ts — Pairs waiting players into chess games.
 *
 * Players are sorted into per-time-control queues (e.g., "600_0" for Rapid 10+0).
 * When a player joins, the service immediately tries to find an opponent within
 * the initial ±100-point rating window. If no match is found, an interval expands
 * the window by 50 points every 10 seconds (up to ±500) until a match is made or
 * the player disconnects.
 *
 * HOW IT CONNECTS:
 *  - SocketManager.handleInitGameAsync() calls handleInitGame() with the player's rating
 *  - SocketManager.removeUser() calls removePendingUser() when a socket closes
 *  - SocketManager.getStats() calls getQueuedPlayerCount() for the health endpoint
 *  - GameService.createGame() is called when two players are matched
 *  - Prometheus: matchmakingQueueSize gauge tracks the live queue depth
 *
 * TIME CONTROL KEY:
 *  Queues are keyed by tcKey(baseMs, incrementMs) so "10 min + 0s" and "10 min + 5s"
 *  never cross-match against each other.
 */

import { WebSocket } from 'ws';
import type { GameService } from '../game/GameService';
import { DEFAULT_TIME_CONTROL, tcKey } from '../../shared/constants/timeControls';
import { MessageType } from '../../shared/constants/messageTypes';
import { sendError } from '../../shared/errors/errorHandler';
import { logger } from '../../shared/utils/logger';
import { matchmakingQueueSize } from '../metrics/metrics';

interface QueueEntry {
  socket: WebSocket;
  userId: string | null;
  username: string | null;
  rating: number;
  enqueuedAt: number;
  timerId: ReturnType<typeof setInterval>;
  searchTimeoutId: ReturnType<typeof setTimeout> | null;
  baseTimeMs: number;
  incrementMs: number;
}

const INITIAL_WINDOW = 100;
const WINDOW_EXPANSION = 50;
const EXPANSION_INTERVAL_MS = 10_000;
const MAX_WINDOW = 500;
const SEARCH_TIMEOUT_MS = 60_000;

export class MatchmakingService {
  // Queue key = tcKey(baseMs, incrementMs) so Rapid 10+0 and Rapid 10+5 never cross-match
  private queues: Map<string, QueueEntry[]> = new Map();

  constructor(private gameService: GameService) {}

  handleInitGame(
    socket: WebSocket,
    baseTimeMs: number = DEFAULT_TIME_CONTROL.baseMs,
    incrementMs = 0,
    userId: string | null = null,
    username: string | null = null,
    rating = 1200,
  ): void {
    if (this.findEntryBySocket(socket)) {
      sendError(socket, 'Already in queue. Close the other tab first.');
      return;
    }

    const key = tcKey(baseTimeMs, incrementMs);
    const entry: QueueEntry = {
      socket,
      userId,
      username,
      rating,
      enqueuedAt: Date.now(),
      timerId: null!,
      searchTimeoutId: null,
      baseTimeMs,
      incrementMs,
    };

    if (this.tryMatch(entry, key)) return;

    const timerId = setInterval(() => {
      if (!this.getQueue(key).includes(entry)) {
        clearInterval(timerId);
        return;
      }
      this.tryMatch(entry, key);
    }, EXPANSION_INTERVAL_MS);

    entry.timerId = timerId;

    entry.searchTimeoutId = setTimeout(() => {
      if (!this.findEntryBySocket(socket)) return; // already matched
      this.dequeue(entry);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: MessageType.SEARCH_TIMEOUT }));
      }
      logger.info({ userId, baseTimeMs, incrementMs }, 'search_timed_out');
    }, SEARCH_TIMEOUT_MS);

    this.getQueue(key).push(entry);
    matchmakingQueueSize.inc();
    logger.info({ baseTimeMs, incrementMs, rating, userId }, 'player_queued');
  }

  removePendingUser(socket: WebSocket): void {
    const entry = this.findEntryBySocket(socket);
    if (entry) {
      this.dequeue(entry);
      logger.info({ userId: entry.userId }, 'pending_user_removed_on_disconnect');
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private tryMatch(entry: QueueEntry, key: string): boolean {
    const pool = this.getQueue(key);
    const waitMs = Date.now() - entry.enqueuedAt;
    const window = Math.min(
      INITIAL_WINDOW + Math.floor(waitMs / EXPANSION_INTERVAL_MS) * WINDOW_EXPANSION,
      MAX_WINDOW,
    );

    const opponent = pool.find(
      (e) =>
        e !== entry &&
        !(entry.userId !== null && e.userId !== null && e.userId === entry.userId) &&
        Math.abs(e.rating - entry.rating) <= window,
    );

    if (!opponent) return false;

    this.dequeue(entry);
    this.dequeue(opponent);

    const [white, black] = Math.random() < 0.5 ? [entry, opponent] : [opponent, entry];

    this.gameService.createGame(
      white.socket,
      black.socket,
      entry.baseTimeMs,
      entry.incrementMs,
      white.userId,
      black.userId,
      white.username,
      black.username,
    );

    logger.info(
      {
        baseTimeMs: entry.baseTimeMs,
        incrementMs: entry.incrementMs,
        ratingDiff: Math.abs(entry.rating - opponent.rating),
        window,
      },
      'matchmaking_success',
    );
    return true;
  }

  getQueuedPlayerCount(): number {
    let total = 0;
    for (const pool of this.queues.values()) total += pool.length;
    return total;
  }

  private getQueue(key: string): QueueEntry[] {
    if (!this.queues.has(key)) this.queues.set(key, []);
    return this.queues.get(key)!;
  }

  private dequeue(entry: QueueEntry): void {
    clearInterval(entry.timerId);
    if (entry.searchTimeoutId) clearTimeout(entry.searchTimeoutId);
    for (const pool of this.queues.values()) {
      const idx = pool.indexOf(entry);
      if (idx !== -1) {
        pool.splice(idx, 1);
        matchmakingQueueSize.dec();
        return;
      }
    }
  }

  private findEntryBySocket(socket: WebSocket): QueueEntry | undefined {
    for (const pool of this.queues.values()) {
      const e = pool.find((e) => e.socket === socket);
      if (e) return e;
    }
    return undefined;
  }
}
