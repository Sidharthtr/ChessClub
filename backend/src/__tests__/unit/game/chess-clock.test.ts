import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChessClock } from '../../../modules/game/chess-clock';

describe('ChessClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ─── Before start ──────────────────────────────────────────────────────────

  it('getSnapshot before start returns initial times unchanged', () => {
    const clock = new ChessClock(60_000, vi.fn());
    expect(clock.getSnapshot()).toEqual({ white: 60_000, black: 60_000 });
  });

  // ─── start() ───────────────────────────────────────────────────────────────

  it('white time decreases after start', () => {
    const clock = new ChessClock(60_000, vi.fn());
    clock.start();
    vi.advanceTimersByTime(5_000);
    const { white, black } = clock.getSnapshot();
    expect(white).toBe(55_000);
    expect(black).toBe(60_000);
  });

  it('start() is idempotent — calling twice fires onTimeout only once', () => {
    const onTimeout = vi.fn();
    const clock = new ChessClock(5_000, onTimeout);
    clock.start();
    clock.start();
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  // ─── recordMove() ──────────────────────────────────────────────────────────

  it('deducts elapsed time from white and switches to black', () => {
    const clock = new ChessClock(60_000, vi.fn());
    clock.start();
    vi.advanceTimersByTime(3_000);
    clock.recordMove();
    expect(clock.getSnapshot().white).toBe(57_000);
  });

  it('applies increment to the player who just moved', () => {
    const clock = new ChessClock(60_000, vi.fn(), 5_000);
    clock.start();
    vi.advanceTimersByTime(3_000);
    clock.recordMove(); // white used 3s, gains 5s → net +2s
    expect(clock.getSnapshot().white).toBe(62_000);
  });

  it('remaining time is clamped to 0, never negative', () => {
    const clock = new ChessClock(2_000, vi.fn());
    clock.start();
    vi.advanceTimersByTime(5_000); // well past expiry
    expect(clock.getSnapshot().white).toBe(0);
  });

  it('alternates active player each call', () => {
    const clock = new ChessClock(60_000, vi.fn());
    clock.start();
    vi.advanceTimersByTime(1_000);
    clock.recordMove(); // white used 1s (59s), black's turn
    vi.advanceTimersByTime(2_000);
    clock.recordMove(); // black used 2s (58s), white's turn
    const snap = clock.getSnapshot();
    expect(snap.white).toBe(59_000);
    expect(snap.black).toBe(58_000);
  });

  // ─── onTimeout ─────────────────────────────────────────────────────────────

  it('fires with white when white time expires', () => {
    const onTimeout = vi.fn();
    const clock = new ChessClock(5_000, onTimeout);
    clock.start();
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledWith('white');
  });

  it('fires with black when black time expires', () => {
    const onTimeout = vi.fn();
    const clock = new ChessClock(5_000, onTimeout);
    clock.start();
    vi.advanceTimersByTime(1_000);
    clock.recordMove(); // black's turn
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledWith('black');
  });

  // ─── stop() ────────────────────────────────────────────────────────────────

  it('stop() cancels the scheduled timeout', () => {
    const onTimeout = vi.fn();
    const clock = new ChessClock(5_000, onTimeout);
    clock.start();
    vi.advanceTimersByTime(2_000);
    clock.stop();
    vi.advanceTimersByTime(10_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  // ─── undoMove() ────────────────────────────────────────────────────────────

  it('undoMove() switches active color back so the previous player loses time', () => {
    const clock = new ChessClock(60_000, vi.fn());
    clock.start();
    vi.advanceTimersByTime(1_000);
    clock.recordMove(); // white used 1s (59s left), black's turn
    clock.undoMove(); // back to white's turn
    vi.advanceTimersByTime(1_000);
    // white has been counting down again from ~59s for 1s → ~58s
    expect(clock.getSnapshot().white).toBeLessThan(59_000);
    expect(clock.getSnapshot().black).toBe(60_000);
  });
});
