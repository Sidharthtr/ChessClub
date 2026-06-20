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
  }),
  z.object({ type: z.literal(MessageType.MOVE), move: MovePayloadSchema }),
  z.object({ type: z.literal(MessageType.RESIGN) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_REQUEST) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_ACCEPT) }),
  z.object({ type: z.literal(MessageType.TAKEBACK_REJECT) }),
  z.object({ type: z.literal(MessageType.DRAW_REQUEST) }),
  z.object({ type: z.literal(MessageType.DRAW_ACCEPT) }),
  z.object({ type: z.literal(MessageType.DRAW_REJECT) }),
]);

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type MoveMessage = Extract<IncomingMessage, { type: typeof MessageType.MOVE }>;
