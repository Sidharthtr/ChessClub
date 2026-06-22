/**
 * authMiddleware.ts — Express middleware that enforces JWT authentication.
 *
 * requireAuth extracts the Bearer token from the Authorization header,
 * verifies it via AuthService.verifyToken(), and attaches userId + username
 * to the request object (AuthRequest interface).
 *
 * If the header is missing, malformed, or the token is invalid/expired,
 * it responds with 401 immediately — the route handler is never called.
 *
 * HOW IT CONNECTS:
 *  - authRouter applies requireAuth to GET /me and GET /games
 *  - historyRouter applies requireAuth to all endpoints
 *  - AuthRequest extends Express.Request with userId? and username?
 *    so downstream handlers have typed access to the authenticated user
 */

import type { Request, Response, NextFunction } from 'express';
import { authService } from './AuthService';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = authService.verifyToken(token);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
