-- CreateTable — persists every live game so the server can reconstruct
-- Game objects after a crash and let authenticated players reconnect.
CREATE TABLE "ActiveGame" (
    "id"            TEXT        NOT NULL,
    "fen"           TEXT        NOT NULL,
    "pgn"           TEXT        NOT NULL DEFAULT '',
    "clockWhiteMs"  INTEGER     NOT NULL,
    "clockBlackMs"  INTEGER     NOT NULL,
    "turnColor"     TEXT        NOT NULL,
    "moveNumber"    INTEGER     NOT NULL DEFAULT 0,
    "whiteUserId"   TEXT,
    "blackUserId"   TEXT,
    "whiteUsername" TEXT,
    "blackUsername" TEXT,
    "timeControlMs" INTEGER     NOT NULL,
    "incrementMs"   INTEGER     NOT NULL DEFAULT 0,
    "startedAt"     TIMESTAMP(3) NOT NULL,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveGame_pkey" PRIMARY KEY ("id")
);

-- Indexes for reconnect lookups (SocketManager.findGameByUserId equivalent)
CREATE INDEX "ActiveGame_whiteUserId_idx" ON "ActiveGame"("whiteUserId");
CREATE INDEX "ActiveGame_blackUserId_idx" ON "ActiveGame"("blackUserId");
