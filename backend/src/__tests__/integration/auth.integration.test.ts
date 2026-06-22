import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { AppError } from '../../shared/errors/AppError';

// Mock services and logger before the app is imported so all routers pick up the mocks
vi.mock('../../modules/auth/AuthService', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    getMe: vi.fn(),
    verifyToken: vi.fn(),
  },
}));

vi.mock('../../modules/history/HistoryService', () => ({
  historyService: {
    saveGame: vi.fn(),
    getGame: vi.fn(),
    getUserGames: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { app } from '../../app';
import { authService } from '../../modules/auth/AuthService';

const request = supertest(app);

const MOCK_USER = {
  id: 'user-1',
  username: 'alice',
  email: 'alice@test.com',
  rating: 1200,
  createdAt: new Date().toISOString(),
};
const MOCK_TOKEN = 'mock.jwt.token';

describe('Auth routes — integration', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── POST /api/auth/register ────────────────────────────────────────────────

  it('valid payload → 201 with user and token', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: MOCK_USER as never,
      token: MOCK_TOKEN,
    });

    const res = await request
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token', MOCK_TOKEN);
    expect(res.body.user).toHaveProperty('username', 'alice');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('missing username → 400 (Zod validation)', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('username too short → 400', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('invalid email format → 400', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('password shorter than 6 chars → 400', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@test.com', password: '123' });

    expect(res.status).toBe(400);
  });

  it('duplicate email/username → 409', async () => {
    vi.mocked(authService.register).mockRejectedValue(new AppError('Email already in use', 409));

    const res = await request
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Email already in use');
  });

  // ─── POST /api/auth/login ───────────────────────────────────────────────────

  it('valid credentials → 200 with user and token', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: MOCK_USER as never, token: MOCK_TOKEN });

    const res = await request
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('id', 'user-1');
  });

  it('missing email → 400', async () => {
    const res = await request.post('/api/auth/login').send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('wrong password → 401', async () => {
    vi.mocked(authService.login).mockRejectedValue(new AppError('Invalid email or password', 401));

    const res = await request
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  // ─── GET /api/auth/me ───────────────────────────────────────────────────────

  it('valid Bearer token → 200 with user profile', async () => {
    vi.mocked(authService.verifyToken).mockReturnValue({ userId: 'user-1', username: 'alice' });
    vi.mocked(authService.getMe).mockResolvedValue(MOCK_USER as never);

    const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${MOCK_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'alice');
  });

  it('no Authorization header → 401', async () => {
    const res = await request.get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('malformed token (not Bearer prefix) → 401', async () => {
    const res = await request.get('/api/auth/me').set('Authorization', 'Token abc123');

    expect(res.status).toBe(401);
  });

  it('expired / invalid token → 401', async () => {
    vi.mocked(authService.verifyToken).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer expired.token');

    expect(res.status).toBe(401);
  });

  it('valid token but user not found → 404', async () => {
    vi.mocked(authService.verifyToken).mockReturnValue({ userId: 'ghost', username: 'ghost' });
    vi.mocked(authService.getMe).mockRejectedValue(new AppError('User not found', 404));

    const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${MOCK_TOKEN}`);

    expect(res.status).toBe(404);
  });

  // ─── GET /api/auth/games ────────────────────────────────────────────────────

  it('authenticated → 200 with games array', async () => {
    vi.mocked(authService.verifyToken).mockReturnValue({ userId: 'user-1', username: 'alice' });

    const res = await request.get('/api/auth/games').set('Authorization', `Bearer ${MOCK_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated → 401', async () => {
    const res = await request.get('/api/auth/games');
    expect(res.status).toBe(401);
  });
});
