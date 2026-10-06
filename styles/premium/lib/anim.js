// Время → 0…1. Никаких таймеров: всё — чистые функции от t.
import { clamp, outCubic, inCubic } from './ease.js';
export const prog = (t, t0, dur) => (dur <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / dur));
export const lerp = (a, b, p) => a + (b - a) * p;
// огибающая: вход [start, start+inDur], выход [end-outDur, end]; вне [start, end) — 0
export function env(t, start, end, inDur, outDur, inEase = outCubic, outEase = inCubic) {
  if (t < start || t >= end) return 0;
  const a = inDur > 0 ? inEase(prog(t, start, inDur)) : 1;
  const b = outDur > 0 ? 1 - outEase(prog(t, end - outDur, outDur)) : 1;
  return Math.min(a, b);
}
// колокол вспышки: рост outCubic за rise, спад exp(-(t-peak)/0.08), обрезка на fall
export function bell(t, tPeak, rise, fall, tau = 0.08) {
  if (t < tPeak - rise || t > tPeak + fall) return 0;
  if (t <= tPeak) return outCubic(prog(t, tPeak - rise, rise));
  return Math.exp(-(t - tPeak) / tau);
}
