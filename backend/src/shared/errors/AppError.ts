export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
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
