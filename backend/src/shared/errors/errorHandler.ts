/**
 * errorHandler.ts — WebSocket error response helpers.
 *
 * sendError() is the canonical way to send an error back to a client over
 * WebSocket. It guards readyState before sending so it never throws on
 * an already-closed socket.
 *
 * handleWsError() is used in the try/catch wrapper inside SocketManager's
 * message switch — it logs the error with Pino and calls sendError(), keeping
 * the socket alive for future messages.
 *
 * HOW IT CONNECTS:
 *  - SocketManager.handleMessages() calls handleWsError in the catch block
 *  - SocketManager calls sendError directly for validation failures
 *  - MatchmakingService calls sendError for queue-rejection messages
 */

import WebSocket from 'ws';
import { MessageType } from '../constants/messageTypes';
import { logger } from '../utils/logger';

export const sendError = (socket: WebSocket, message: string): void => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: MessageType.ERROR, payload: { message } }));
  }
};

export const handleWsError = (socket: WebSocket, error: unknown): void => {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.error({ error }, message);
  sendError(socket, message);
};
