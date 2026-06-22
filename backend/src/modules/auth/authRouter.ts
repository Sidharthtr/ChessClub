import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authService } from './AuthService';
import type { AuthRequest } from './authMiddleware';
import { requireAuth } from './authMiddleware';
import { historyService } from '../history/HistoryService';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';

export const authRouter = Router();

const RegisterSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const result = RegisterSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    return;
  }

  try {
    const { username, email, password } = result.data;
    const data = await authService.register(username, email, password);
    logger.info({ userId: data.user.id, username }, 'user_registered');
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      logger.error(err, 'register_error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  try {
    const { email, password } = result.data;
    const data = await authService.login(email, password);
    logger.info({ userId: data.user.id }, 'user_logged_in');
    res.json(data);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      logger.error(err, 'login_error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await authService.getMe(req.userId!);
    res.json(user);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Convenience endpoint — get MY games without knowing userId
authRouter.get('/games', requireAuth, async (req: AuthRequest, res: Response) => {
  const games = await historyService.getUserGames(req.userId!);
  res.json(games);
});
