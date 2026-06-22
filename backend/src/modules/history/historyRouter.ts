/**
 * historyRouter.ts — Express router for game history endpoints.
 *
 * Mounted in app.ts at /api.
 *
 * ENDPOINTS:
 *  GET /api/games/:id          — fetch a single game by UUID (authenticated)
 *  GET /api/users/:id/games    — fetch last 50 games for a user (authenticated)
 *
 * Both endpoints require a valid Bearer token (requireAuth middleware).
 * Phase 4 will add pagination and PGN download.
 *
 * HOW IT CONNECTS:
 *  - app.ts mounts this router at /api
 *  - authMiddleware.requireAuth guards all routes
 *  - HistoryService handles the actual DB queries
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import type { AuthRequest } from '../auth/authMiddleware';
import { requireAuth } from '../auth/authMiddleware';
import { historyService } from './HistoryService';

export const historyRouter = Router();

historyRouter.get('/games/:id', requireAuth, async (req: Request, res: Response) => {
  const game = await historyService.getGame(req.params['id'] as string);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(game);
});

historyRouter.get('/users/:id/games', requireAuth, async (req: AuthRequest, res: Response) => {
  const games = await historyService.getUserGames(req.params['id'] as string);
  res.json(games);
});
