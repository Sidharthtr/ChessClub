/**
 * generateGameId.ts — Cryptographically random UUID v4 for game identifiers.
 *
 * Games are identified by UUID rather than sequential integers so that:
 *  - Game IDs are unguessable (no enumeration attacks on the history API)
 *  - IDs remain unique across server restarts and future multi-node deploys
 *  - Reconnection endpoint /api/games/:id is safe to expose publicly
 *
 * HOW IT CONNECTS:
 *  - Game.ts constructor calls generateGameId() to assign this.gameId
 */

import crypto from 'crypto';

export const generateGameId = (): string => {
  return crypto.randomUUID();
};
