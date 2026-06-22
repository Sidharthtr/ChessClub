-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "gamesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "whitePlayerId" TEXT,
    "blackPlayerId" TEXT,
    "winner" TEXT,
    "reason" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "finalFen" TEXT NOT NULL,
    "timeControlMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex (query performance — getUserGames + orderBy endedAt)
CREATE INDEX "Game_whitePlayerId_idx" ON "Game"("whitePlayerId");
CREATE INDEX "Game_blackPlayerId_idx" ON "Game"("blackPlayerId");
CREATE INDEX "Game_endedAt_idx" ON "Game"("endedAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_whitePlayerId_fkey"
    FOREIGN KEY ("whitePlayerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Game" ADD CONSTRAINT "Game_blackPlayerId_fkey"
    FOREIGN KEY ("blackPlayerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
