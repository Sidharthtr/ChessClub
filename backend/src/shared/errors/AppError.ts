/**
 * AppError.ts — Structured error classes for the application.
 *
 * AppError is the base for all intentional errors: it carries an HTTP status
 * code so HTTP route handlers can call res.status(err.statusCode).json(...)
 * without a separate mapping step.
 *
 * HIERARCHY:
 *  AppError         — generic: statusCode defaults to 500
 *  └── ValidationError  — 400 Bad Request (Zod rejections, missing fields)
 *  └── GameError        — 400 Bad Request (illegal chess moves, wrong turn, etc.)
 *
 * HOW IT CONNECTS:
 *  - AuthService, HistoryService throw AppError for domain errors (409 duplicate, 401 wrong password)
 *  - authRouter / historyRouter catch AppError and forward err.statusCode to res.status()
 *  - handleWsError in errorHandler.ts catches AppError over WebSocket (sends ERROR message)
 *  - Tests use `instanceof AppError` to verify correct error classification
 */

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class GameError extends AppError {
  constructor(message: string) {
    super(message, 400, 'GAME_ERROR');
    this.name = 'GameError';
  }
}
