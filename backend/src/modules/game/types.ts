import type { WebSocket } from 'ws';

export interface Player {
  id: string;
  socket: WebSocket;
  username?: string;
}

export type Color = 'white' | 'black';

export interface MovePayload {
  from: string;
  to: string;
  promotion?: string;
}

export interface GameState {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  fen: string;
  moves: string[];
}
