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
