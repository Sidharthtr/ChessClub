import { describe, it, expect } from 'vitest';
import { calculateElo } from '../../../modules/rating/EloService';

describe('calculateElo', () => {
  // ─── Equal ratings (1200 vs 1200) ──────────────────────────────────────────

  it('white wins: whiteChange is positive, blackChange is negative, symmetric', () => {
    const r = calculateElo(1200, 1200, 0, 0, 'white');
    expect(r.whiteChange).toBeGreaterThan(0);
    expect(r.blackChange).toBeLessThan(0);
    expect(r.whiteChange).toBe(-r.blackChange);
  });

  it('black wins: blackChange is positive, whiteChange is negative, symmetric', () => {
    const r = calculateElo(1200, 1200, 0, 0, 'black');
    expect(r.blackChange).toBeGreaterThan(0);
    expect(r.whiteChange).toBeLessThan(0);
    expect(r.blackChange).toBe(-r.whiteChange);
  });

  it('draw at equal ratings: both changes are 0', () => {
    const r = calculateElo(1200, 1200, 0, 0, null);
    expect(r.whiteChange).toBe(0);
    expect(r.blackChange).toBe(0);
    expect(r.whiteNewRating).toBe(1200);
    expect(r.blackNewRating).toBe(1200);
  });

  // ─── Rating gap ─────────────────────────────────────────────────────────────

  it('favourite (1600) beats underdog (1200): favourite gains little, underdog loses little', () => {
    const r = calculateElo(1600, 1200, 100, 100, 'white');
    // White is heavy favourite — expected score close to 1 — so gain is small
    expect(r.whiteChange).toBeGreaterThan(0);
    expect(r.whiteChange).toBeLessThan(5);
    expect(r.blackChange).toBeLessThan(0);
  });

  it('underdog (1200) beats favourite (1600): underdog gains a lot, favourite loses a lot', () => {
    const r = calculateElo(1200, 1600, 0, 0, 'white');
    // K=40 for both (0 games played) and white is big underdog — huge upset
    expect(r.whiteChange).toBeGreaterThan(30);
    expect(r.blackChange).toBeLessThan(-30);
  });

  // ─── K-factor thresholds ────────────────────────────────────────────────────

  it('fewer than 30 games: K=40, max possible change ≤ 40', () => {
    // Max change = K * (1 - 0) when expected ≈ 0
    const r = calculateElo(1200, 1200, 0, 0, 'white');
    expect(Math.abs(r.whiteChange)).toBeLessThanOrEqual(40);
    expect(Math.abs(r.blackChange)).toBeLessThanOrEqual(40);
  });

  it('30–99 games: K=20, max possible change ≤ 20', () => {
    const r = calculateElo(1200, 1200, 30, 30, 'white');
    expect(Math.abs(r.whiteChange)).toBeLessThanOrEqual(20);
  });

  it('100+ games: K=10, max possible change ≤ 10', () => {
    const r = calculateElo(1200, 1200, 100, 100, 'white');
    expect(Math.abs(r.whiteChange)).toBeLessThanOrEqual(10);
  });

  // ─── Different K-factors per player ─────────────────────────────────────────

  it('each player uses their own K-factor independently', () => {
    // White: 5 games (K=40), Black: 200 games (K=10)
    const r = calculateElo(1200, 1200, 5, 200, 'white');
    // White's change should be larger in magnitude than black's
    expect(Math.abs(r.whiteChange)).toBeGreaterThan(Math.abs(r.blackChange));
  });

  // ─── Rating floor ────────────────────────────────────────────────────────────

  it('loser cannot drop below the minimum rating of 100', () => {
    // White starts at 105, loses badly to a much stronger player
    const r = calculateElo(105, 2000, 0, 0, 'black');
    expect(r.whiteNewRating).toBeGreaterThanOrEqual(100);
  });

  // ─── Return shape ────────────────────────────────────────────────────────────

  it('newRating = oldRating + change (respecting floor)', () => {
    const r = calculateElo(1400, 1300, 50, 50, 'white');
    expect(r.whiteNewRating).toBe(Math.max(100, 1400 + r.whiteChange));
    expect(r.blackNewRating).toBe(Math.max(100, 1300 + r.blackChange));
  });
});
