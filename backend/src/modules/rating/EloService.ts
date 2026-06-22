/**
 * EloService.ts — FIDE-style Elo rating calculation (pure functions, no I/O).
 *
 * calculateElo() takes the current ratings and game counts of both players,
 * the game outcome, and returns the new ratings + point changes for each player.
 *
 * K-FACTOR (determines how much a single result shifts the rating):
 *  K=40 for the first 30 games  — ratings move fast while establishing rank
 *  K=20 for games 30–100        — moderate adjustment period
 *  K=10 for 100+ games          — stable, established rating
 *
 * FLOOR: Ratings never drop below 100.
 *
 * HOW IT CONNECTS:
 *  - HistoryService.saveGame() calls calculateElo() after persisting the game
 *    and uses the returned RatingResult to update both users in the DB
 *  - Game.ts receives the RatingResult from HistoryService and sends
 *    RATING_UPDATE messages to both players
 *  - Unit tests in EloService.test.ts cover edge cases (win/lose/draw, K-factor
 *    transitions, rating floor)
 */

export interface RatingResult {
  whiteNewRating: number;
  blackNewRating: number;
  whiteChange: number;
  blackChange: number;
}

// K=40 for first 30 games, K=20 up to 100, K=10 thereafter (FIDE-style)
function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 30) return 40;
  if (gamesPlayed < 100) return 20;
  return 10;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

const MIN_RATING = 100;

export function calculateElo(
  whiteRating: number,
  blackRating: number,
  whiteGamesPlayed: number,
  blackGamesPlayed: number,
  winner: 'white' | 'black' | null,
): RatingResult {
  const whiteScore = winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const eWhite = expectedScore(whiteRating, blackRating);
  const eBlack = expectedScore(blackRating, whiteRating);

  const kWhite = kFactor(whiteGamesPlayed);
  const kBlack = kFactor(blackGamesPlayed);

  const whiteChange = Math.round(kWhite * (whiteScore - eWhite));
  const blackChange = Math.round(kBlack * (blackScore - eBlack));

  return {
    whiteNewRating: Math.max(MIN_RATING, whiteRating + whiteChange),
    blackNewRating: Math.max(MIN_RATING, blackRating + blackChange),
    whiteChange,
    blackChange,
  };
}
