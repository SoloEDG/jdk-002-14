import type { Grade, Hit } from "../../../shared/session";
export const WINDOWS = { perfect: 0.045, great: 0.09, good: 0.15 };
/** 长按尾部松手窗口：尾点前后各 150ms */
export const TAIL_WINDOW = 0.15;
const GRADE_ORDER: Record<Grade, number> = {
  PERFECT: 0,
  GREAT: 1,
  GOOD: 2,
  MISS: 3,
};
export function grade(delta: number): Grade {
  const d = Math.abs(delta);
  return d <= WINDOWS.perfect
    ? "PERFECT"
    : d <= WINDOWS.great
      ? "GREAT"
      : d <= WINDOWS.good
        ? "GOOD"
        : "MISS";
}
/** 一次长按只计一次判定：取起点与尾部中较差的等级 */
export function worstGrade(a: Grade, b: Grade): Grade {
  return GRADE_ORDER[a] >= GRADE_ORDER[b] ? a : b;
}
/** 带符号毫秒文本，用于判定区展示两端误差 */
export function formatDelta(delta: number): string {
  const ms = Math.round(delta * 1000);
  return `${ms > 0 ? "+" : ""}${ms}ms`;
}
export const weight: Record<Grade, number> = {
  PERFECT: 1,
  GREAT: 0.75,
  GOOD: 0.4,
  MISS: 0,
};
export function statistics(hits: Hit[], total: number) {
  let combo = 0,
    maxCombo = 0,
    points = 0;
  for (const hit of hits) {
    combo = hit.grade === "MISS" ? 0 : combo + 1;
    maxCombo = Math.max(maxCombo, combo);
    points += weight[hit.grade];
  }
  return {
    combo,
    maxCombo,
    score: Math.round((points / Math.max(1, total)) * 1000000),
    accuracy: hits.length ? (points / hits.length) * 100 : 100,
  };
}
