// Общие функции для компонентов: всё — чистые функции от t. Никаких таймеров, Date, Math.random.
export const NS = 'http://www.w3.org/2000/svg';
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const prog = (t, t0, d) => (d <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / d));
export const lerp = (a, b, p) => a + (b - a) * p;
export const TAU = Math.PI * 2;

// кривые по имени (токены motion.ease.*): "outCubic", "outExpo", "outBack:1.7", "spring:0.5", "linear" …
export const E = {
  linear: p => p,
  outCubic: p => 1 - Math.pow(1 - p, 3),
  inCubic: p => p * p * p,
  inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outQuint: p => 1 - Math.pow(1 - p, 5),
  outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inQuad: p => p * p,
  smooth: p => p * p * (3 - 2 * p),
};
export const outBack = (s = 1.70158) => p => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
// затухающая пружина по нормированному времени p 0…1 (1 — покой); zeta — затухание, cycles — колебаний до покоя
export function springP(p, zeta = 0.5, cycles = 1.15) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const w = TAU * cycles, wd = w * Math.sqrt(1 - zeta * zeta);
  const v = 1 - Math.exp(-zeta * w * p) * (Math.cos(wd * p) + (zeta * w / wd) * Math.sin(wd * p));
  const k = clamp((p - 0.85) / 0.15);
  return v * (1 - k) + k;
}
export function ease(name) {
  if (typeof name === 'function') return name;
  const [n, arg] = String(name || 'outCubic').split(':');
  if (n === 'outBack') return outBack(arg ? +arg : 1.70158);
  if (n === 'spring') return p => springP(p, arg ? +arg : 0.5);
  return E[n] || E.outCubic;
}

export function el(tag, cls, parent, style, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) for (const k in style) e.style[k] = typeof style[k] === 'number' && !/opacity|zIndex|fontWeight|lineHeight|flex/.test(k) ? style[k] + 'px' : style[k];
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
export function sv(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export const px = v => (Math.round(v * 100) / 100) + 'px';
export function show(e, on) { const v = on ? '' : 'none'; if (e.style.display !== v) e.style.display = v; }
// подгонка кегля: уменьшать, пока ширина > maxW
export function fit(e, size, min, maxW) {
  e.style.fontSize = size + 'px';
  while (e.scrollWidth > maxW && size > min) { size -= 1; e.style.fontSize = size + 'px'; }
  return size;
}
export const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}-]+/gu, '');
// детерминированный шум: mulberry32
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }
// огибающая показа: вход за inD, выход за outD; вне [s, e) — 0
export function env(t, s, e, inD, outD, inE = E.outCubic, outE = E.inCubic) {
  if (t < s || t >= e) return 0;
  const a = inD > 0 ? inE(prog(t, s, inD)) : 1;
  const b = outD > 0 ? 1 - outE(prog(t, e - outD, outD)) : 1;
  return Math.min(a, b);
}
// микродвижение в покое
export const floatY = (t, ph, a = 3, per = 2.3) => a * Math.sin(TAU * (t / per + ph));
export const floatR = (t, ph, a = 0.35, per = 3.1) => a * Math.sin(TAU * (t / per + ph + 0.25));
// фаза бегущего блика: проход dur раз в period; вне прохода — -1
export function sheen(t, t0, period = 1.9, dur = 0.6) {
  if (t < t0 || period <= 0) return -1;
  const k = ((t - t0) % period) / dur;
  return k > 1 ? -1 : k;
}
