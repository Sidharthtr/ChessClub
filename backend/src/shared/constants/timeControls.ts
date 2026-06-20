export const TIME_CONTROLS = {
  BULLET: 60_000,         // 1 min
  BLITZ_3: 180_000,       // 3 min
  BLITZ_5: 300_000,       // 5 min
  RAPID: 600_000,         // 10 min
  CLASSICAL: 1_800_000,   // 30 min
} as const;

export type TimeControlKey = keyof typeof TIME_CONTROLS;
