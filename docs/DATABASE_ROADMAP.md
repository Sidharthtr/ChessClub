# Database Roadmap

Deferred schema and query improvements — implement before or during Phase 4 (Auth) launch.

---

## 1. Case-insensitive username/email (`citext`)

**Why:** PostgreSQL's `TEXT UNIQUE` is case-sensitive. `User@Example.com` and `user@example.com` would
create two separate accounts. The `citext` extension enforces uniqueness case-insensitively at the DB
layer so no application-level `.toLowerCase()` is needed.

**Schema change:**

```prisma
// schema.prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [citext]
}

model User {
  username String @unique @db.Citext
  email    String @unique @db.Citext
}
```

**Migration SQL:**

```sql
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE "User" ALTER COLUMN "username" TYPE citext;
ALTER TABLE "User" ALTER COLUMN "email"    TYPE citext;
```

---

## 2. Atomic `saveGame()` with `$transaction`

**Why:** `HistoryService.saveGame()` currently does 3 separate round-trips (game insert, two user
reads, two user updates). If the process crashes between them, a game could be persisted without
rating updates, or vice versa. Wrapping in a serializable transaction makes all five operations
atomic.

**Code change in `HistoryService.ts`:**

```ts
async saveGame(data: SaveGameData): Promise<SaveGameResult | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.game.create({ data: { ... } });

      if (!data.whiteUserId || !data.blackUserId) return null;

      // Lock both rows so concurrent rating updates for the same players don't race.
      const [white, black] = await Promise.all([
        tx.$queryRaw<{ rating: number; gamesCount: number }[]>`
          SELECT rating, "gamesCount" FROM "User"
          WHERE id = ${data.whiteUserId} FOR UPDATE`,
        tx.$queryRaw<{ rating: number; gamesCount: number }[]>`
          SELECT rating, "gamesCount" FROM "User"
          WHERE id = ${data.blackUserId} FOR UPDATE`,
      ]);

      const result = calculateElo(
        white[0].rating, black[0].rating,
        white[0].gamesCount, black[0].gamesCount,
        data.winner,
      );

      await Promise.all([
        tx.user.update({ where: { id: data.whiteUserId },
          data: { rating: result.whiteNewRating, gamesCount: { increment: 1 } } }),
        tx.user.update({ where: { id: data.blackUserId },
          data: { rating: result.blackNewRating, gamesCount: { increment: 1 } } }),
      ]);

      return { ratingUpdates: result };
    }, { isolationLevel: 'Serializable' });
  } catch (err) {
    logger.error({ err, gameId: data.gameId }, 'game_save_failed');
    return null;
  }
}
```

---

## 3. CHECK constraints

**Why:** Prisma doesn't expose CHECK constraints natively — they require a raw SQL migration. These
enforce business rules at the database layer so invalid data can never be inserted even through
direct SQL access or future tooling.

**Migration SQL** (add to a new migration file):

```sql
-- Rating can never go below 0
ALTER TABLE "User" ADD CONSTRAINT "User_rating_floor" CHECK ("rating" >= 0);

-- Username: 3–20 chars, only letters/numbers/underscores/hyphens
ALTER TABLE "User" ADD CONSTRAINT "User_username_format"
  CHECK ("username" ~ '^[a-zA-Z0-9_-]{3,20}$');

-- A game must have at least one player (prevents ghost games)
ALTER TABLE "Game" ADD CONSTRAINT "Game_has_player"
  CHECK ("whitePlayerId" IS NOT NULL OR "blackPlayerId" IS NOT NULL);

-- Players must be different people
ALTER TABLE "Game" ADD CONSTRAINT "Game_distinct_players"
  CHECK ("whitePlayerId" IS DISTINCT FROM "blackPlayerId");

-- Time control must be positive
ALTER TABLE "Game" ADD CONSTRAINT "Game_timeControlMs_positive"
  CHECK ("timeControlMs" > 0);
```

---

## 4. UNION query for `getUserGames`

**Why:** The current `OR` query (`WHERE whitePlayerId = $1 OR blackPlayerId = $1`) forces Postgres
to do a bitmap OR across two indexes and cannot use the composite `(playerId, endedAt DESC)` index
efficiently. A `UNION` rewrites it as two separate seeks, each of which hits the composite index
directly — roughly 2× faster for large game histories.

**Code change in `HistoryService.ts`:**

```ts
async getUserGames(userId: string) {
  // Two index seeks on composite (playerId, endedAt DESC), merged and re-sorted.
  return prisma.$queryRaw`
    SELECT g.*, row_to_json(w) AS "whitePlayer", row_to_json(b) AS "blackPlayer"
    FROM (
      SELECT * FROM "Game" WHERE "whitePlayerId" = ${userId}
      UNION ALL
      SELECT * FROM "Game" WHERE "blackPlayerId" = ${userId}
    ) g
    LEFT JOIN LATERAL (
      SELECT id, username, rating FROM "User" WHERE id = g."whitePlayerId"
    ) w ON true
    LEFT JOIN LATERAL (
      SELECT id, username, rating FROM "User" WHERE id = g."blackPlayerId"
    ) b ON true
    ORDER BY g."endedAt" DESC
    LIMIT 50
  `;
}
```
