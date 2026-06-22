/**
 * types.ts — Shared type definitions for the game module.
 *
 * MovePayload is the core move data: from square, to square, optional promotion
 * piece. It is validated at the boundary by MovePayloadSchema (message.schema.ts)
 * and then passed directly to chess.js's board.move() method.
 *
 * Player and GameState are convenience interfaces used for documentation and
 * future extensions. The live game state lives in Game.ts instances, not here.
 *
 * HOW IT CONNECTS:
 *  - MovePayload is used in Game.makeMove() and inferred from the Zod schema
 *  - Color is used in chess-clock.ts (ClockColor) and Game.ts
 */

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
