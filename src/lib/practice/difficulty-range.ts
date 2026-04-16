export const PRACTICE_DIFFICULTY_MIN = 0;
export const PRACTICE_DIFFICULTY_MAX = 10;

export type PracticeDifficultyRange = {
  min: number;
  max: number;
};

function clampDifficulty(value: number) {
  return Math.min(PRACTICE_DIFFICULTY_MAX, Math.max(PRACTICE_DIFFICULTY_MIN, Math.round(value)));
}

export function normalizeDifficultyRange(raw?: string | null): PracticeDifficultyRange {
  if (!raw) {
    return {
      min: PRACTICE_DIFFICULTY_MIN,
      max: PRACTICE_DIFFICULTY_MAX,
    };
  }

  const match = raw.trim().match(/^(-?\d+)-(-?\d+)$/);
  if (!match) {
    return {
      min: PRACTICE_DIFFICULTY_MIN,
      max: PRACTICE_DIFFICULTY_MAX,
    };
  }

  const left = clampDifficulty(Number(match[1]));
  const right = clampDifficulty(Number(match[2]));

  return {
    min: Math.min(left, right),
    max: Math.max(left, right),
  };
}

export function hasCustomDifficultyRange(range: PracticeDifficultyRange) {
  return range.min !== PRACTICE_DIFFICULTY_MIN || range.max !== PRACTICE_DIFFICULTY_MAX;
}

export function serializeDifficultyRange(range: PracticeDifficultyRange) {
  return hasCustomDifficultyRange(range) ? `${range.min}-${range.max}` : "";
}
