export const MessageType = {
  INIT_GAME: 'init_game',
  MOVE: 'move',
  GAME_OVER: 'game_over',
  GAME_ALERT: 'game_alert',
  ERROR: 'error',
  RESIGN: 'resign',
  DRAW_REQUEST: 'draw_request',
  DRAW_ACCEPT: 'draw_accept',
  DRAW_REJECT: 'draw_reject',
  TAKEBACK_REQUEST: 'takeback_request',
  TAKEBACK_ACCEPT: 'takeback_accept',
  TAKEBACK_REJECT: 'takeback_reject',
  // Phase 4
  GAME_RESUME: 'game_resume',
  REMATCH_REQUEST: 'rematch_request',
  REMATCH_ACCEPT: 'rematch_accept',
  REMATCH_REJECT: 'rematch_reject',
  RATING_UPDATE: 'rating_update',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];
