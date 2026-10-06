// Кривые — те же формулы в tools/_ease.py (тесты сверяют).
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const linear = p => p;
export const outCubic = p => 1 - Math.pow(1 - p, 3);
export const inCubic = p => p * p * p;
export const inOutCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const outExpo = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
export const outBack = (s = 1.70158) => p => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
