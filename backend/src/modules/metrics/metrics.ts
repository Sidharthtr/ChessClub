/**
 * metrics.ts — Prometheus metric definitions for ChessClub.
 *
 * All metrics are registered on a single custom Registry (not the global default)
 * so tests can import this file without polluting the global Prometheus state.
 *
 * HOW IT CONNECTS:
 *  - metricsRouter.ts  → reads registry.metrics() and serves it at GET /metrics
 *  - GameService.ts    → increments activeGames / gamesStartedTotal
 *  - Game.ts           → increments gamesFinishedTotal / movesProcessedTotal / moveProcessingLatency
 *  - SocketManager.ts  → increments activeConnections / reconnectsTotal
 *  - MatchmakingService.ts → increments matchmakingQueueSize
 *
 * Prometheus scrapes GET /metrics every ~15 s.
 * Grafana queries Prometheus to build dashboards.
 *
 * NAMING CONVENTION:
 *  All metric names are prefixed with "chessclub_" and follow the
 *  Prometheus naming convention: snake_case, units in the suffix (_total, _seconds).
 */

import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

// Isolated registry — never shares state with other modules in tests
export const registry = new Registry();

registry.setDefaultLabels({ app: 'chessclub' });

// Built-in Node.js metrics: heap, RSS, event-loop lag, GC durations, etc.
collectDefaultMetrics({ register: registry });

// ─── Gauges (current value that can go up and down) ────────────────────────────

/** How many chess games are currently in progress. */
export const activeGames = new Gauge({
  name: 'chessclub_active_games',
  help: 'Number of chess games currently in progress',
  registers: [registry],
});

/** How many WebSocket clients are currently connected. */
export const activeConnections = new Gauge({
  name: 'chessclub_active_connections',
  help: 'Number of WebSocket clients currently connected',
  registers: [registry],
});

/** How many players are sitting in the matchmaking queue right now. */
export const matchmakingQueueSize = new Gauge({
  name: 'chessclub_matchmaking_queue_size',
  help: 'Number of players currently waiting in the matchmaking queue',
  registers: [registry],
});

// ─── Counters (monotonically increasing totals) ────────────────────────────────

/** Total games created since server start. */
export const gamesStartedTotal = new Counter({
  name: 'chessclub_games_started_total',
  help: 'Total number of chess games started since server start',
  registers: [registry],
});

/**
 * Total games that have ended, labelled by reason.
 * Label values: checkmate | stalemate | resignation | timeout |
 *               draw_by_agreement | draw_by_repetition |
 *               draw_by_insufficient_material | draw_by_50_move_rule
 */
export const gamesFinishedTotal = new Counter({
  name: 'chessclub_games_finished_total',
  help: 'Total number of chess games finished, partitioned by end reason',
  labelNames: ['reason'],
  registers: [registry],
});

/** Total times a player reconnected to an in-progress game within the grace period. */
export const reconnectsTotal = new Counter({
  name: 'chessclub_reconnects_total',
  help: 'Total number of successful player reconnections to in-progress games',
  registers: [registry],
});

/** Total valid chess moves processed and broadcast to both players. */
export const movesProcessedTotal = new Counter({
  name: 'chessclub_moves_processed_total',
  help: 'Total number of valid chess moves processed since server start',
  registers: [registry],
});

// ─── Histograms (distributions) ───────────────────────────────────────────────

/**
 * Time (in seconds) from receiving a MOVE message to broadcasting it to both players.
 * Covers chess.js validation + clock update + JSON serialization + two socket.send() calls.
 * Buckets tuned for sub-10 ms expected p99.
 */
export const moveProcessingLatency = new Histogram({
  name: 'chessclub_move_processing_latency_seconds',
  help: 'Latency of processing a chess move (validation + broadcast) in seconds',
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [registry],
});
