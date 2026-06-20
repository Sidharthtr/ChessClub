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
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];
