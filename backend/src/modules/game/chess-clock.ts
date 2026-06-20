export type ClockColor = 'white' | 'black';

export class ChessClock {
  private timeWhiteMs: number;
  private timeBlackMs: number;
  private activeColor: ClockColor = 'white';
  private lastMoveTime: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly onTimeout: (loser: ClockColor) => void;
  private started = false;

  constructor(initialTimeMs: number, onTimeout: (loser: ClockColor) => void) {
    this.timeWhiteMs = initialTimeMs;
    this.timeBlackMs = initialTimeMs;
    this.onTimeout = onTimeout;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.lastMoveTime = Date.now();
    this.scheduleTimeout();
  }

  recordMove(): void {
    if (!this.started || this.lastMoveTime === null) return;
    const elapsed = Date.now() - this.lastMoveTime;
    if (this.activeColor === 'white') {
      this.timeWhiteMs = Math.max(0, this.timeWhiteMs - elapsed);
    } else {
      this.timeBlackMs = Math.max(0, this.timeBlackMs - elapsed);
    }
    this.activeColor = this.activeColor === 'white' ? 'black' : 'white';
    this.lastMoveTime = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.scheduleTimeout();
  }

  undoMove(): void {
    if (!this.started) return;
    this.activeColor = this.activeColor === 'white' ? 'black' : 'white';
    this.lastMoveTime = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.scheduleTimeout();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.started = false;
    this.lastMoveTime = null;
  }

  getSnapshot(): { white: number; black: number } {
    if (!this.started || this.lastMoveTime === null) {
      return { white: this.timeWhiteMs, black: this.timeBlackMs };
    }
    const elapsed = Date.now() - this.lastMoveTime;
    return {
      white: this.activeColor === 'white'
        ? Math.max(0, this.timeWhiteMs - elapsed)
        : this.timeWhiteMs,
      black: this.activeColor === 'black'
        ? Math.max(0, this.timeBlackMs - elapsed)
        : this.timeBlackMs,
    };
  }

  private scheduleTimeout(): void {
    const remaining = this.activeColor === 'white' ? this.timeWhiteMs : this.timeBlackMs;
    this.timer = setTimeout(() => this.onTimeout(this.activeColor), remaining);
  }
}
