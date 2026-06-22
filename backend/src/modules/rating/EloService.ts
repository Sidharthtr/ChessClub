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
