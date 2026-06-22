-- CreateEnum
CREATE TYPE "GameWinner" AS ENUM ('white', 'black');

-- CreateEnum
CREATE TYPE "GameOverReason" AS ENUM (
  'checkmate',
  'stalemate',
  'draw_by_repetition',
  'draw_by_insufficient_material',
  'draw_by_50_move_rule',
  'draw_by_agreement',
  'resignation',
  'timeout'
);

-- AlterTable "User" — soft-delete support + auto-managed updatedAt
ALTER TABLE "User"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable "Game" — promote winner/reason from free-text to typed enums
-- USING casts existing rows; safe because only valid enum values were ever written.
ALTER TABLE "Game"
  ALTER COLUMN "winner" TYPE "GameWinner" USING "winner"::"GameWinner",
  ALTER COLUMN "reason" TYPE "GameOverReason" USING "reason"::"GameOverReason";

-- DropIndex — single-column indexes replaced by composite below
DROP INDEX "Game_whitePlayerId_idx";
DROP INDEX "Game_blackPlayerId_idx";
DROP INDEX "Game_endedAt_idx";

-- CreateIndex — composite indexes cover the common getUserGames pattern:
--   WHERE whitePlayerId = $1 ORDER BY endedAt DESC
-- The sort column is included in the index so Postgres avoids a sort step.
CREATE INDEX "Game_whitePlayerId_endedAt_idx" ON "Game"("whitePlayerId", "endedAt" DESC);
CREATE INDEX "Game_blackPlayerId_endedAt_idx" ON "Game"("blackPlayerId", "endedAt" DESC);
CREATE INDEX "Game_endedAt_idx" ON "Game"("endedAt" DESC);

-- CreateIndex — leaderboard / rating-ordered queries
CREATE INDEX "User_rating_idx" ON "User"("rating" DESC);

-- CreateIndex — fast filter for active (non-deleted) users
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
