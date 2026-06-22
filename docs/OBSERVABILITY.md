# Observability

Three pillars: structured logs, Prometheus metrics, and HTTP health checks.

---

## Logs

Pino is the only logger. JSON in production, pretty-printed in development.

```ts
import { logger } from './shared/utils/logger';

logger.info({ gameId, event: 'move_made' }, 'move_processed');
// Always: structured context FIRST, message SECOND.
```

### Levels

- `error` — caught exceptions, failed DB writes
- `warn` — invalid client input, suspicious activity
- `info` — game lifecycle, user actions
- `debug` — message-level traces (suppressed in prod)

### Production output

```json
{
  "level": 30,
  "time": 1718956800000,
  "app": "chessclub",
  "gameId": "abc-123",
  "event": "move_made",
  "moveCount": 42,
  "msg": "move_processed"
}
```

Pipe stdout into your aggregator (Datadog, Loki, CloudWatch). Each event is one JSON line — perfect for jq/grep filtering.

---

## Health Checks

Two endpoints. They serve different purposes — do not point load balancers at the deep one.

### `GET /health` — shallow

Always returns `200 { status: "ok" }`. No I/O. Sub-millisecond response.

**Use for**: load balancer health checks, Docker `HEALTHCHECK`, Kubernetes liveness probe.

### `GET /health/deep` — full subsystem check

Checks every dependency in parallel:

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latencyMs": 3 },
    "websocket": { "status": "ok", "connectedClients": 12, "activeGames": 4 },
    "matchmaking": { "status": "ok", "queuedPlayers": 1 }
  }
}
```

Returns **503 with `status: "degraded"`** if any check fails. The DB check has a 2-second timeout so a hung Postgres can't hang the whole response.

**Use for**: alerting, on-call paging, manual debugging.

```bash
# In an alert rule
curl -fsS http://backend:8080/health/deep > /dev/null || page-oncall
```

---

## Metrics

Prometheus scrape endpoint: `GET /metrics`. Plain-text exposition format. All metric names are prefixed `chessclub_`.

Defined in [`metrics.ts`](../backend/src/modules/metrics/metrics.ts) on an isolated `Registry` (not the global one — keeps tests clean).

### Gauges (current value, can go up and down)

| Metric                             | Meaning                         |
| ---------------------------------- | ------------------------------- |
| `chessclub_active_games`           | Live games right now            |
| `chessclub_active_connections`     | Connected WebSocket clients     |
| `chessclub_matchmaking_queue_size` | Players waiting for an opponent |

### Counters (monotonically increasing)

| Metric                                   | Meaning                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `chessclub_games_started_total`          | Games created since boot                                                         |
| `chessclub_games_finished_total{reason}` | Games ended, labelled by reason (checkmate, timeout, resignation, draw variants) |
| `chessclub_moves_processed_total`        | Valid moves processed                                                            |
| `chessclub_reconnects_total`             | Players who reconnected within grace period                                      |

### Histograms

| Metric                                      | Meaning                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `chessclub_move_processing_latency_seconds` | Time from receiving MOVE to broadcasting it. Buckets tuned for sub-10 ms p99. |

### Plus default Node.js metrics

`collectDefaultMetrics()` gives you `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds`, GC durations, file descriptors, etc.

---

## Prometheus Setup

```yaml
# prometheus.yml
scrape_configs:
  - job_name: chessclub
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:8080']
```

In production, restrict `/metrics` to your Prometheus server IP — it exposes internal state.

---

## Grafana Dashboard

Eight panels cover everything you need to know:

### 1. Active Games (Stat)

```promql
chessclub_active_games
```

Single big number. Alert if it exceeds your capacity model.

### 2. Connected Clients (Time-series)

```promql
chessclub_active_connections
```

Should track roughly `2 × active_games + queued_players`. Big gap → orphaned connections.

### 3. Matchmaking Queue Depth (Time-series)

```promql
chessclub_matchmaking_queue_size
```

Sustained spikes mean rating distribution is sparse — consider widening the initial window.

### 4. Games Started vs Finished Rate (Time-series, 2 lines)

```promql
rate(chessclub_games_started_total[5m])
rate(chessclub_games_finished_total[5m])
```

Lines should converge. Persistent gap = games that never end (potential bug).

### 5. Game Outcomes (Stacked bar)

```promql
sum by (reason) (rate(chessclub_games_finished_total[1h]))
```

Watch for `reason="timeout"` spiking — clock bug suspect.

### 6. Move Processing Latency (Time-series)

```promql
histogram_quantile(0.50, rate(chessclub_move_processing_latency_seconds_bucket[5m]))
histogram_quantile(0.95, rate(chessclub_move_processing_latency_seconds_bucket[5m]))
histogram_quantile(0.99, rate(chessclub_move_processing_latency_seconds_bucket[5m]))
```

p50/p95/p99 lines. Healthy: well under 5 ms. p99 above 50 ms = event loop blocked.

### 7. Reconnection Rate (Time-series)

```promql
rate(chessclub_reconnects_total[5m])
```

Low and stable is healthy. Spikes correlate with network incidents.

### 8. Node Heap (Time-series)

```promql
nodejs_heap_size_used_bytes
nodejs_heap_size_total_bytes
```

Watch for monotonic growth — memory leak signature. Alert when used > 80% of container limit.

---

## Alerting

A starter rule set:

| Alert                    | Condition                                         | Severity |
| ------------------------ | ------------------------------------------------- | -------- |
| BackendDown              | `up{job="chessclub"} == 0` for 1 min              | critical |
| DatabaseDegraded         | `/health/deep` returns 503 for 2 min              | critical |
| MoveLatencyHigh          | p99 latency > 100 ms for 5 min                    | warning  |
| GameStartFinishImbalance | `started_rate - finished_rate > 0.1/s` for 10 min | warning  |
| EventLoopLagged          | `nodejs_eventloop_lag_seconds > 0.1` for 5 min    | warning  |
| QueueStuck               | `matchmaking_queue_size > 10` for 10 min          | info     |
