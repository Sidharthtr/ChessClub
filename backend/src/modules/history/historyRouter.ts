import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../auth/authMiddleware';
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
