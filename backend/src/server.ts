/**
 * server.ts — Process entry point. Boots the HTTP + WebSocket server.
 *
 * This file does three things and nothing else:
 *  1. Wraps the Express `app` in a raw http.Server so the WebSocketServer can
 *     share the same port (WebSocket upgrade requests go to /ws; HTTP requests
 *     go to Express routers)
 *  2. Constructs SocketManager (which owns GameService + MatchmakingService)
 *     and registers /health AFTER construction so it can pass SocketManager
 *     as the HealthStatsProvider
 *  3. Calls httpServer.listen() to start accepting connections
 *
 * WHY SEPARATE FROM app.ts:
 *  app.ts only creates the Express app — no listen() call. This lets integration
 *  tests import `app` and pass it to supertest without binding any port.
 *
 * HOW IT CONNECTS:
 *  - app.ts: provides the Express app (REST routers + middleware)
 *  - SocketManager: handles all WS connections and routes messages to games
 *  - healthRouter: mounted here (not app.ts) because it needs SocketManager stats
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config/env';
import { logger } from './shared/utils/logger';
import { SocketManager } from './modules/websocket/SocketManager';
import { createHealthRouter } from './modules/health/healthRouter';
import { app } from './app';

const httpServer = http.createServer(app);
// path: '/ws' means the server only accepts WS upgrades at ws://host/ws
// This lets nginx proxy /ws cleanly without conflicting with static file serving.
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const socketManager = new SocketManager();
app.use('/health', createHealthRouter(socketManager));

wss.on('connection', (ws, req) => {
  socketManager.addUser(ws, req);
  ws.on('close', () => socketManager.removeUser(ws));
});

httpServer.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'server_started');
});
