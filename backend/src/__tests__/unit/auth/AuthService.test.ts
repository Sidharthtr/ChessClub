import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/db/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock.jwt.token'),
    verify: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../shared/db/prisma';
import { AuthService } from '../../../modules/auth/AuthService';
import { AppError } from '../../../shared/errors/AppError';

const MOCK_USER = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@test.com',
  passwordHash: '$2b$10$hashed',
  rating: 1200,
  gamesCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let svc: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AuthService();
  });

  // ─── register() ────────────────────────────────────────────────────────────

  it('register success — returns user (no passwordHash) and a token', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      email: 'alice@test.com',
      rating: 1200,
      createdAt: new Date(),
    } as never);

    const result = await svc.register('alice', 'alice@test.com', 'password123');

    expect(result.token).toBe('mock.jwt.token');
    expect(result.user).toHaveProperty('id');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('register with duplicate email throws AppError 409', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      ...MOCK_USER,
      email: 'alice@test.com',
    } as never);

    await expect(svc.register('alice', 'alice@test.com', 'pass')).rejects.toThrow(AppError);
    await expect(svc.register('alice', 'alice@test.com', 'pass')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('register with duplicate username throws AppError 409', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      ...MOCK_USER,
      email: 'other@test.com', // different email, same username match
    } as never);

    await expect(svc.register('alice', 'new@test.com', 'pass')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ─── login() ───────────────────────────────────────────────────────────────

  it('login success — returns user (no passwordHash) and a token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await svc.login('alice@test.com', 'password123');

    expect(result.token).toBe('mock.jwt.token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).toHaveProperty('username', 'alice');
  });

  it('login with non-existent email throws AppError 401', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(svc.login('ghost@test.com', 'pass')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('login with wrong password throws AppError 401', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(svc.login('alice@test.com', 'wrong')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ─── getMe() ───────────────────────────────────────────────────────────────

  it('getMe returns user profile for a valid userId', async () => {
    const profile = {
      id: 'user-1',
      username: 'alice',
      email: 'alice@test.com',
      rating: 1200,
      createdAt: new Date(),
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(profile as never);

    const result = await svc.getMe('user-1');
    expect(result).toEqual(profile);
  });

  it('getMe with unknown userId throws AppError 404', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(svc.getMe('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });

  // ─── verifyToken() ─────────────────────────────────────────────────────────

  it('verifyToken with a valid token returns the decoded payload', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1', username: 'alice' } as never);

    const payload = svc.verifyToken('valid.jwt.token');
    expect(payload).toMatchObject({ userId: 'user-1', username: 'alice' });
  });

  it('verifyToken with an invalid token throws', () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature');
    });

    expect(() => svc.verifyToken('garbage')).toThrow();
  });
});
