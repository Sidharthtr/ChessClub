# WebSocket Protocol

All messages are JSON, sent on the WebSocket connection at `/ws?token=<JWT>`.

```js
ws.send(JSON.stringify({ type: 'move', move: { from: 'e2', to: 'e4' } }));
```

Every incoming message is validated against [`message.schema.ts`](../backend/src/shared/schemas/message.schema.ts) before processing. Invalid shape → `{ type: 'error', payload: { message: 'Invalid message format' } }` reply, connection stays open.

---

## Message Types

The enum is in [`shared/constants/messageTypes.ts`](../backend/src/shared/constants/messageTypes.ts). Both sides mirror identical string values.

### Game lifecycle

| Type         | Direction | Payload                                                                          |
| ------------ | --------- | -------------------------------------------------------------------------------- |
| `init_game`  | C→S       | `{ timeControlMs?: number, incrementMs?: number }`                               |
| `init_game`  | S→C       | `{ color: 'white'\|'black', gameId, timeMs, incrementMs, opponentUsername }`     |
| `move`       | C→S       | `{ move: { from, to, promotion? } }`                                             |
| `move`       | S→C       | `{ payload: { move, clock: { white: ms, black: ms } } }`                         |
| `game_over`  | S→C       | `{ payload: { winner: 'white'\|'black'\|null, reason } }`                        |
| `game_alert` | S→C       | `{ payload: string }` — non-fatal info ("not your turn", "opponent reconnected") |
| `error`      | S→C       | `{ payload: { message: string } }`                                               |

### Game actions

| Type               | Direction | Payload                                                       |
| ------------------ | --------- | ------------------------------------------------------------- |
| `resign`           | C→S       | _(none)_                                                      |
| `draw_request`     | C→S       | _(none)_                                                      |
| `draw_request`     | S→C       | _(forwarded to opponent)_                                     |
| `draw_accept`      | C→S       | _(none — server triggers game_over reason=draw_by_agreement)_ |
| `draw_reject`      | C→S       | _(none)_                                                      |
| `draw_reject`      | S→C       | _(forwarded to both)_                                         |
| `takeback_request` | C→S       | _(none — must be the last mover)_                             |
| `takeback_request` | S→C       | _(forwarded to opponent)_                                     |
| `takeback_accept`  | C→S       | _(none)_                                                      |
| `takeback_accept`  | S→C       | `{ payload: { fen, moveCount } }`                             |
| `takeback_reject`  | C→S / S→C | _(none)_                                                      |

### Reconnection

| Type          | Direction | Payload                                                                                |
| ------------- | --------- | -------------------------------------------------------------------------------------- |
| `game_resume` | S→C       | `{ payload: { gameId, fen, color, clock, incrementMs, opponentUsername, moveCount } }` |

Sent automatically when an authenticated user reconnects within the 30-second grace period. No client-side request needed — `SocketManager.addUser()` detects the in-progress game and sends this on connect.

### Rematch

| Type              | Direction | Payload                         |
| ----------------- | --------- | ------------------------------- |
| `rematch_request` | C→S       | _(only valid after game_over)_  |
| `rematch_request` | S→C       | _(forwarded to opponent)_       |
| `rematch_accept`  | C→S       | _(triggers new INIT_GAME pair)_ |
| `rematch_reject`  | C→S / S→C | _(forwarded)_                   |

Colors swap on rematch — last game's black plays white in the next.

### Rating

| Type            | Direction | Payload                              |
| --------------- | --------- | ------------------------------------ |
| `rating_update` | S→C       | `{ payload: { newRating, change } }` |

Sent to each player after `game_over` if both were authenticated. See [`EloService.ts`](../backend/src/modules/rating/EloService.ts) for the formula.

---

## Game-Over Reasons

The `reason` field in `game_over` payloads is one of:

| Reason                          | Meaning                                      |
| ------------------------------- | -------------------------------------------- |
| `checkmate`                     | Winner delivered mate                        |
| `stalemate`                     | Side to move has no legal move, not in check |
| `draw_by_repetition`            | Threefold repetition                         |
| `draw_by_insufficient_material` | Neither side can mate (K vs K, etc.)         |
| `draw_by_50_move_rule`          | 50 moves with no pawn move or capture        |
| `draw_by_agreement`             | Both players accepted a draw offer           |
| `resignation`                   | A player resigned                            |
| `timeout`                       | A player's clock hit zero                    |

The `winner` field is `'white' | 'black' | null` (null for any draw).

---

## Authentication

The WebSocket URL accepts a JWT in the query string:

```
ws://localhost:8080/ws?token=eyJhbGciOiJIUzI1Ni...
```

The token is verified once at connect time by `SocketManager.extractMeta()`. If invalid or absent, the connection still works — the player is treated as a **guest** (anonymous). Guests cannot:

- Rejoin a game after disconnect (no 30-second grace)
- Have a rating
- Have their games saved to history

---

## Server Authority

Everything below is computed on the server and the client only renders what it's told:

- **Move legality** — `chess.js` validation
- **Game-over detection** — `chess.js` `isGameOver()` / `isCheckmate()` etc.
- **Clock state** — `ChessClock` using `Date.now()` deltas, snapshot in every `move` broadcast
- **Color assignment** — `MatchmakingService` randomizes
- **Game ID** — `crypto.randomUUID()` on the server

The client never sends time, never claims wins, never decides whose turn it is. If the UI and the server disagree, the server is right by construction.
