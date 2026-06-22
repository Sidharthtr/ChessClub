/**
 * message.schema.ts — Zod validation schemas for all client → server WS messages.
 *
 * Every message arriving from a WebSocket client is parsed through
 * IncomingMessageSchema.safeParse() in SocketManager.handleMessages() BEFORE
 * any game logic runs. An invalid shape results in a MessageType.ERROR sent back
 * to the client — the server never crashes on bad input.
 *
 * DESIGN:
 *  - Uses z.discriminatedUnion('type', [...]) so Zod narrows the TypeScript type
 *    based on the `type` field, giving full type safety in the switch statement
 *  - MovePayloadSchema validates from/to squares (always 2-char) and optional
 *    promotion piece (q/r/b/n)
 *  - Messages the server sends back to clients (INIT_GAME, MOVE, GAME_OVER, etc.)
 *    are NOT in this schema — they are typed inline at the send sites
 *
 * HOW IT CONNECTS:
 *  - SocketManager.handleMessages() calls IncomingMessageSchema.safeParse(raw)
 *  - MessageType enum (messageTypes.ts) supplies the literal discriminant values
 */

import { z } from 'zod';
import { MessageType } from '../constants/messageTypes';

const MovePayloadSchema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});

export const IncomingMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(MessageType.INIT_GAME),
    timeControlMs: z.number().int().positive().optional(),
    incrementMs: z.number().int().min(0).optional(),
  }),
  z.object({ type: z.literal(MessageType.MOVE), move: MovePayloadSchema }),
  z.object({ type: z.literal(MessageType.RESIGN) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_REQUEST) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_ACCEPT) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_REJECT) }),
  z.object({ type: z.literal(MessageType.DRAW_REQUEST) }),
  z.object({ type: z.literal(MessageType.DRAW_ACCEPT) }),
  z.object({ type: z.literal(MessageType.DRAW_REJECT) }),
  z.object({ type: z.literal(MessageType.REMATCH_REQUEST) }),
  z.object({ type: z.literal(MessageType.REMATCH_ACCEPT) }),
  z.object({ type: z.literal(MessageType.REMATCH_REJECT) }),
]);

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type MoveMessage = Extract<IncomingMessage, { type: typeof MessageType.MOVE }>;
