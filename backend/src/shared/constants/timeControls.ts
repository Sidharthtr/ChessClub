/**
 * timeControls.ts — Time control presets and matchmaking queue key helper.
 *
 * TIME_CONTROLS is the canonical list of selectable time controls shown in the
 * frontend lobby. Each entry has a human-readable label and the two numbers
 * the server actually uses: baseMs (starting clock in milliseconds) and
 * incrementMs (bonus added per move, Fischer-style).
 *
 * tcKey() produces a stable string like "600000_5000" used as the matchmaking
 * queue bucket key so that players who selected different time controls can
 * never accidentally be matched against each other.
 *
 * HOW IT CONNECTS:
 *  - MatchmakingService uses tcKey() to separate queues per time control
 *  - Game / ChessClock receive baseMs and incrementMs from GameService
 *  - Frontend mirrors this list for the lobby UI
 */

export interface TimeControl {
  label: string;
  baseMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { label: '10+0', baseMs: 600_000, incrementMs: 0 },
  { label: '10+5', baseMs: 600_000, incrementMs: 5_000 },
  { label: '15+10', baseMs: 900_000, incrementMs: 10_000 },
];

export const DEFAULT_TIME_CONTROL = TIME_CONTROLS[0];

/** Stable string key used as matchmaking queue bucket. */
export function tcKey(baseMs: number, incrementMs: number): string {
  return `${baseMs}_${incrementMs}`;
}
