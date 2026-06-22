import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from './config/env';
import { logger } from './shared/utils/logger';
import { SocketManager } from './modules/websocket/SocketManager';
import { authRouter } from './modules/auth/authRouter';
import { historyRouter } from './modules/history/historyRouter';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', historyRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = http.createServer(app);
// path: '/ws' means the server only accepts WS upgrades at ws://host/ws
// This lets nginx proxy /ws cleanly without conflicting with static file serving.
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const socketManager = new SocketManager();

wss.on('connection', (ws, req) => {
  socketManager.addUser(ws, req);
  ws.on('close', () => socketManager.removeUser(ws));
});

httpServer.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'server_started');
});
