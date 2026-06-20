import crypto from "crypto";

export const generateGameId = (): string => {
  return crypto.randomUUID();
};