// Стиль premium: стеклянная плашка (SVG) + маски слов и букв + пружины. Всё — чистые функции от t.
import { el } from './dom.js';
import { clamp } from './ease.js';

const NS = 'http://www.w3.org/2000/svg';
export const WARM = '#FFC24D';
export function svg(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
let UID = 0;

// затухающая пружина 0→1 с перелётом (ζ≈0.5): p — нормированное время 0…1 (1 = практически покой)
export function spring(p, zeta = 0.52, cycles = 1.15) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const w = 2 * Math.PI * cycles, x = p;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const v = 1 - Math.exp(-zeta * w * x) * (Math.cos(wd * x) + (zeta * w / wd) * Math.sin(wd * x));
  // доводка к 1 в самом конце, чтобы не было ступеньки на p=1
  const k = clamp((p - 0.85) / 0.15);
  return v * (1 - k) + k;
}
export const outQuint = p => 1 - Math.pow(1 - p, 5);
export const inQuad = p => p * p;
export const smooth = p => p * p * (3 - 2 * p);

// контур плашки: скруглённый прямоугольник, опционально «хвост»-указатель справа (к пальцу)
export function plateD(w, h, r, tail) {
  if (!tail) {
    return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
  }
  const { y, len, half, dy = 0 } = tail;
  return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${y - half} ` +
    `C${w},${y - half * 0.35} ${w + len * 0.55},${y + dy - 3} ${w + len},${y + dy} ` +
    `C${w + len * 0.55},${y + dy + 3} ${w},${y + half * 0.35} ${w},${y + half} ` +
    `V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
}

// Стеклянная плашка: тёмный полупрозрачный градиент (под ним compose.py размывает видео — «матовое стекло»),
// тонкая светлая обводка 1.5 px с градиентом, внутренний блик сверху, бегущий световой блик (клип по контуру).
export function glass(parent, w, h, o = {}) {
  const r = o.r ?? 32, tail = o.tail || null, id = 'g' + (++UID);
  const extra = tail ? tail.len + 4 : 0;
  const box = el('div', 'abs', parent, { left: '0px', top: '0px', width: w + extra + 'px', height: h + 'px' });
  const s = svg('svg', { width: w + extra, height: h, viewBox: `0 0 ${w + extra} ${h}`, style: 'position:absolute;left:0;top:0;overflow:visible' }, box);
  s.style.filter = o.shadow === false ? '' : 'drop-shadow(0 18px 26px rgba(0,0,0,.42))';
  const defs = svg('defs', {}, s);
  const fill = svg('linearGradient', { id: id + 'f', x1: 0, y1: 0, x2: 0.25, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': o.top || '#3a3a44', 'stop-opacity': o.a0 ?? 0.62 }, fill);
  svg('stop', { offset: 1, 'stop-color': o.bottom || '#0e0e12', 'stop-opacity': o.a1 ?? 0.78 }, fill);
  const st = svg('linearGradient', { id: id + 's', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.62 }, st);
  svg('stop', { offset: 0.45, 'stop-color': '#fff', 'stop-opacity': 0.10 }, st);
  svg('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.30 }, st);
  const sh = svg('linearGradient', { id: id + 'h', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.16 }, sh);
  svg('stop', { offset: 0.42, 'stop-color': '#fff', 'stop-opacity': 0.0 }, sh);
  const gl = svg('linearGradient', { id: id + 'b', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }, gl);
  svg('stop', { offset: 0.5, 'stop-color': '#fff', 'stop-opacity': 0.17 }, gl);
  svg('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, gl);
  const d = plateD(w, h, r, tail);
  const cp = svg('clipPath', { id: id + 'c' }, defs);
  svg('path', { d }, cp);
  const body = svg('path', { d, fill: `url(#${id}f)` }, s);
  svg('path', { d, fill: `url(#${id}h)` }, s);
  const sg = svg('g', { 'clip-path': `url(#${id}c)` }, s);
  const band = svg('rect', { x: 0, y: -h * 0.2, width: Math.max(120, w * 0.28), height: h * 1.4, fill: `url(#${id}b)` }, sg);
  svg('path', { d, fill: 'none', stroke: `url(#${id}s)`, 'stroke-width': 1.5 }, s);
  const content = el('div', 'abs', box, { left: '0px', top: '0px', width: w + 'px', height: h + 'px' });
  return { box, svg: s, body, band, content, w, h, bw: Math.max(120, w * 0.28),
    // бегущий блик: фаза ph 0…1 проходит слева направо; вне [0,1] — не виден
    sheen(ph) {
      const x = -this.bw * 1.3 + (this.w + this.bw * 2) * ph;
      this.band.setAttribute('transform', `translate(${x.toFixed(1)},0) skewX(-18)`);
      this.band.style.display = ph <= 0 || ph >= 1 ? 'none' : '';
    } };
}
// фаза блика: проход 0,75 с раз в period с, начиная с t0
export function sheenPhase(t, t0, period = 1.9, dur = 0.75) {
  if (t < t0) return -1;
  const k = ((t - t0) % period) / dur;
  return k > 1 ? -1 : k;
}

// Маска-раскрытие: слово в overflow:hidden, внутренний span едет снизу.
export function maskText(parent, text, style = {}, by = 'word') {
  const line = el('div', 'nowrap', parent, style);
  const parts = by === 'letter' ? Array.from(text) : text.split(' ');
  const items = [];
  parts.forEach((p, i) => {
    const m = el('span', '', line, { display: 'inline-block', overflow: 'hidden', verticalAlign: 'top',
      padding: '0.06em 0.02em 0.1em', margin: '-0.06em -0.02em -0.1em' });
    const inner = el('span', '', m, { display: 'inline-block', willChange: 'transform' });
    inner.textContent = p === ' ' ? ' ' : p;
    items.push({ m, inner, text: p });
    if (by === 'word' && i < parts.length - 1) line.appendChild(document.createTextNode(' '));
  });
  return { line, items };
}
// подъём из-под маски: p 0…1 → translateY 110%→0 (с перелётом outBack-подобным, если back > 0)
export function rise(item, p, back = 0) {
  let y;
  if (p <= 0) y = 112;
  else if (p >= 1) y = 0;
  else {
    const s = back;
    const e = s > 0 ? 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2) : 1 - Math.pow(1 - p, 4);
    y = 112 * (1 - e);
  }
  item.inner.style.transform = y === 0 ? '' : `translateY(${y.toFixed(2)}%)`;
}
// линия-штрих, прорисовка stroke-dashoffset
export function drawPath(path, len, p) {
  path.setAttribute('stroke-dasharray', `${len} ${len}`);
  path.setAttribute('stroke-dashoffset', (len * (1 - clamp(p))).toFixed(2));
}
