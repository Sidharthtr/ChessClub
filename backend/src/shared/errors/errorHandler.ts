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
