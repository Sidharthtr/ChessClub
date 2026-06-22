/**
 * messageTypes.ts — Single source of truth for all WebSocket message type strings.
 *
 * Both the backend (TypeScript enum) and the frontend (mirrored `as const` object
 * in src/shared/constants/messageTypes.ts) must use these exact string values.
 * Changing a value here breaks the protocol — update the frontend mirror too.
 *
 * DIRECTION GUIDE:
 *  C→S (client to server): INIT_GAME, MOVE, RESIGN, DRAW_REQUEST, DRAW_ACCEPT,
 *       DRAW_REJECT, TAKEBACK_REQUEST, TAKEBACK_ACCEPT, TAKEBACK_REJECT,
 *       REMATCH_REQUEST, REMATCH_ACCEPT, REMATCH_REJECT
 *  S→C (server to client): INIT_GAME, MOVE, GAME_OVER, GAME_ALERT, ERROR,
 *       GAME_RESUME, RATING_UPDATE  (+ forwarded requests/accepts/rejects)
 *
 * All incoming messages are validated by IncomingMessageSchema (message.schema.ts)
 * before any processing — the MessageType enum is the discriminant.
 */

export enum MessageType {
  INIT_GAME = 'init_game',
  MOVE = 'move',
  GAME_OVER = 'game_over',
  GAME_ALERT = 'game_alert',
  ERROR = 'error',
  TAKEBACK_REQUEST = 'takeback_request',
  TAKEBACK_ACCEPT = 'takeback_accept',
  TAKEBACK_REJECT = 'takeback_reject',
  DRAW_REQUEST = 'draw_request',
  DRAW_ACCEPT = 'draw_accept',
  DRAW_REJECT = 'draw_reject',
  RESIGN = 'resign',
  // Phase 4
  GAME_RESUME = 'game_resume',
  REMATCH_REQUEST = 'rematch_request',
  REMATCH_ACCEPT = 'rematch_accept',
  REMATCH_REJECT = 'rematch_reject',
  RATING_UPDATE = 'rating_update',
}
