import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/db/prisma';
import { config } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';

export interface JwtPayload {
  userId: string;
  username: string;
}

export class AuthService {
  async register(username: string, email: string, password: string) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      throw new AppError(existing.email === email ? 'Email already in use' : 'Username already taken', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, passwordHash },
      select: { id: true, username: true, email: true, rating: true, createdAt: true },
    });

    const token = this.signToken({ userId: user.id, username: user.username });
    return { user, token };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Invalid email or password', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Invalid email or password', 401);

    const token = this.signToken({ userId: user.id, username: user.username });
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, rating: true, createdAt: true },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
  }
}

export const authService = new AuthService();
