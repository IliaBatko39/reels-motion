// Стиль premium — компоненты. Кадр = функция t, без таймеров и случайности.
import { el, px } from './lib/dom.js';
import { prog } from './lib/anim.js';
import { clamp, outCubic, inCubic, outExpo, inOutCubic, outBack } from './lib/ease.js';
import { typo } from './lib/typo.js';
import { WARM, svg, glass, sheenPhase, maskText, rise, drawPath, spring, outQuint, smooth } from './lib/glass.js';

const F = 1 / 30;                         // кадр
const INK = '#FFFFFF';
const fl = (t, S, amp = 2, per = 3.4) => amp * Math.sin(2 * Math.PI * (t - S) / per);   // плавание в покое 2 px
const outF = (t, E, n = 5) => inCubic(prog(t, E - n * F, n * F));                         // выход за n кадров

// SVG-цифры «01» тонким контуром (обводка Inter Black, без заливки) — прорисовка dashoffset
function numeral(parent, text, size, color = WARM, sw = 2) {
  const w = Math.round(size * 0.66 * text.length + 8), h = Math.round(size * 0.92);
  const s = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: 'position:absolute;overflow:visible' }, parent);
  const tx = svg('text', { x: 2, y: Math.round(size * 0.80), 'font-family': 'Inter', 'font-weight': 900, 'font-size': size,
    fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linejoin': 'round', 'letter-spacing': -size * 0.02 }, s);
  tx.textContent = text;
  const bb = tx.getBBox();
  s.setAttribute('width', Math.ceil(bb.x + bb.width + 4));
  s.setAttribute('viewBox', `0 0 ${Math.ceil(bb.x + bb.width + 4)} ${h}`);
  return { s, tx, w: Math.ceil(bb.x + bb.width + 4), h, len: size * 4.2 * text.length };
}

// ───────────────────────── 1. Хук у пальца (обложка) ─────────────────────────
// Стеклянная плашка с хвостом-указателем к кончику пальца; кольцо касания у пальца; блик по плашке на стоп-кадре.
const glass_hook = {
  id: 'glass_hook',
  mount(root, L, ctx) {
    const p = Object.assign({ tip: [565, 1149], gap: 16, tail: 26, left: 60, big: 78, small: 40,
      lines: [], sub: [], hold: 0.5 }, L.params);
    const wrap = el('div', 'abs', root, { left: '0px', top: '0px' });
    // текст — меряем до плашки
    const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
    const txt = el('div', '', meas, { padding: '30px 28px 32px 32px', fontFamily: 'Inter', color: INK });
    const bigEls = p.lines.map((l, i) => {
      const d = el('div', 'nowrap', txt, { fontWeight: 900, fontSize: p.big + 'px', lineHeight: '0.98', letterSpacing: '-0.025em' });
      l.split(' ').forEach((w, k, arr) => {
        const s = el('span', '', d); s.textContent = w;
        if (/\d/.test(w)) { s.style.color = WARM; s.style.fontSize = '1.22em'; s.style.lineHeight = '0.8'; }
        if (k < arr.length - 1) d.appendChild(document.createTextNode(' '));
      });
      d.dataset.font = '1';
      return d;
    });
    const rule = el('div', '', txt, { height: '2px', margin: '20px 0 16px', width: '64px', background: WARM, borderRadius: '1px' });
    const subEls = p.sub.map(l => { const d = el('div', 'nowrap', txt, { fontWeight: 700, fontSize: p.small + 'px', lineHeight: '1.16',
      color: 'rgba(255,255,255,.86)', letterSpacing: '-0.005em' }); d.textContent = typo(l); d.dataset.font = '1'; return d; });
    const noTip = !p.tip;
    const [tx, ty] = p.tip || [0, 0];
    // подгонка: плашка не шире места слева от пальца (левый край ≥ 60); без пальца — до 820
    const room = noTip ? 820 : tx - p.gap - p.tail - p.left;
    let bs = p.big, ss = p.small;
    while (txt.offsetWidth > room && bs > 64) {
      bs -= 2; if (bs < 70 && ss > 38) ss -= 1;
      bigEls.forEach(d => { d.style.fontSize = bs + 'px'; }); subEls.forEach(d => { d.style.fontSize = ss + 'px'; });
    }
    const w = Math.ceil(txt.offsetWidth), h = Math.ceil(txt.offsetHeight);
    const right = noTip ? Math.round(500 + w / 2) : tx - p.gap - p.tail;    // правый край тела плашки
    const x0 = Math.max(p.left, right - w);
    const W = right - x0;
    const top = noTip ? 230 : Math.round(ty - h * 0.52);
    const g = glass(wrap, W, h, noTip ? { r: 34 } : { r: 34, tail: { y: ty - top, len: p.tail, half: 34, dy: 2 } });
    g.box.style.left = x0 + 'px'; g.box.style.top = top + 'px';
    g.content.appendChild(txt); meas.remove();
    txt.style.width = W + 'px';
    g.box.style.transformOrigin = noTip ? '50% 50%' : `${W + p.tail}px ${ty - top}px`;
    // кольцо касания у пальца
    const ring = el('div', 'abs', root, { left: (tx - 14) + 'px', top: (ty - 14) + 'px', width: '28px', height: '28px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,.95)', boxShadow: '0 0 12px rgba(255,194,77,.55)' });
    const dot = el('div', 'abs', root, { left: (tx - 4) + 'px', top: (ty - 4) + 'px', width: '8px', height: '8px', borderRadius: '50%', background: WARM });
    const ripple = el('div', 'abs', root, { left: (tx - 14) + 'px', top: (ty - 14) + 'px', width: '28px', height: '28px', borderRadius: '50%',
      border: '1.5px solid rgba(255,255,255,.9)' });
    g.box.dataset.check = 'text';
    if (noTip) for (const e of [ring, dot, ripple]) e.style.display = 'none';
    return { p, g, ring, dot, ripple, x0, top, W, h, S: L.start, E: L.end, text: [...p.lines, ...p.sub].join(' ') };
  },
  update(st, t) {
    const { S, E, g, p } = st;
    if (t < S || t >= E) return false;
    const live = t >= p.hold;
    const out = outF(t, E, 5);
    const yf = live ? fl(t, p.hold + 0.3, 2) * smooth(prog(t, p.hold, 0.6)) : 0;
    const sc = 1 - 0.03 * out;
    g.box.style.transform = `translateY(${(yf - 10 * out).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    g.box.style.opacity = (1 - out).toFixed(3);
    g.sheen(sheenPhase(t, 0.04, 1.9, 0.6));
    // кольцо: на стоп-кадре видно, гаснет после жеста (живой жест 0,63–0,83 с основы)
    const ringOp = 1 - smooth(prog(t, p.hold, 4 * F));   // кольцо касания — только на стоп-кадре (в живой основе палец уходит)
    st.ring.style.opacity = st.dot.style.opacity = ringOp.toFixed(3);
    const rp = prog(t, 0.0, 0.5);
    const rs = 1 + 1.6 * outCubic(rp);
    st.ripple.style.transform = `scale(${rs.toFixed(3)})`;
    st.ripple.style.opacity = (0.9 * (1 - rp)).toFixed(3);
    st.op = 1 - out;
    return st.op > 0.001;
  },
  fast(st, t) { return t >= st.E - 5 * F && t < st.E; },
  rect: st => ({ x0: st.x0, y0: st.top, x1: st.x0 + st.W, y1: st.top + st.h }),
  boxes(st) { return [{ el: st.g.content, kind: 'text', opacity: st.op, text: st.text }]; },
};

// ───────────────────────── 2. Три причины (лид) ─────────────────────────
// Стопка стеклянных строк. Строка раскрывается шторкой слева + пружина; номер прорисовывается контуром;
// «высокий» и термин поднимаются из-под маски синхронно со словом (термин — по буквам, шаг 1 кадр).
const reason_list = {
  id: 'reason_list',
  mount(root, L, ctx) {
    const p = Object.assign({ left: 60, top: 990, gap: 16, termSize: 64, preSize: 40 }, L.params);
    let y = p.top;
    const rows = p.rows.map((r, i) => {
      const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
      const inner = el('div', '', meas, { display: 'flex', alignItems: 'center', padding: '20px 40px 22px 28px', gap: '26px', fontFamily: 'Inter' });
      const numBox = el('div', '', inner, { position: 'relative', width: '86px', height: '72px', flex: '0 0 86px' });
      const n = numeral(numBox, r.num, 72, WARM, 2);
      n.s.style.top = '0px'; n.s.style.left = '0px';
      const col = el('div', '', inner, { display: 'flex', flexDirection: 'column', gap: '4px' });
      const pre = maskText(col, r.pre, { fontWeight: 800, fontSize: p.preSize + 'px', lineHeight: '1.0', color: 'rgba(255,255,255,.72)', letterSpacing: '0.02em' });
      const term = maskText(col, r.term, { fontWeight: 900, fontSize: p.termSize + 'px', lineHeight: '1.0', color: INK, letterSpacing: '-0.02em' }, 'letter');
      pre.line.dataset.font = term.line.dataset.font = '1';
      const w = Math.ceil(inner.offsetWidth), h = Math.ceil(inner.offsetHeight);
      const g = glass(root, w, h, { r: 30 });
      g.box.style.left = p.left + 'px'; g.box.style.top = y + 'px';
      g.content.appendChild(inner); meas.remove();
      g.box.dataset.check = 'text';
      const row = { g, n, pre, term, w, h, y, t0: r.t_pre, t1: r.t_term, text: r.pre + ' ' + r.term };
      y += h + p.gap;
      return row;
    });
    return { p, rows, S: L.start, E: L.end };
  },
  update(st, t) {
    if (t < st.S || t >= st.E) return false;
    let any = false;
    st.rows.forEach((r, i) => {
      const a = r.t0;
      if (t < a) { r.g.box.style.display = 'none'; r.op = 0; return; }
      r.g.box.style.display = '';
      const pe = prog(t, a, 10 * F);
      const out = inCubic(prog(t, st.E - (6 - i) * F, 5 * F));          // выход лесенкой снизу вверх... сверху вниз
      const wipe = outQuint(pe);
      const sp = spring(prog(t, a, 16 * F), 0.55, 1.1);
      const dx = -34 * (1 - sp) - 26 * out;
      r.g.box.style.clipPath = wipe >= 1 ? '' : `inset(-40px ${((1 - wipe) * 100).toFixed(2)}% -40px -10px round 30px)`;
      r.g.box.style.transform = `translate(${dx.toFixed(2)}px, ${fl(t, a + 0.6, 1.6, 3.6 + i * 0.3).toFixed(2)}px)`;
      r.g.box.style.opacity = (1 - out).toFixed(3);
      r.g.sheen(sheenPhase(t, a + 0.35, 1.9 + i * 0.13, 0.7));
      drawPath(r.n.tx, r.n.len, inOutCubic(prog(t, a + 2 * F, 14 * F)));
      r.pre.items.forEach((it, k) => rise(it, prog(t, a + (3 + 2 * k) * F, 8 * F)));
      r.term.items.forEach((it, k) => rise(it, prog(t, r.t1 - 2 * F + k * F, 8 * F), 1.3));
      r.op = 1 - out;
      any = true;
    });
    return any;
  },
  fast(st, t) { return st.rows.some(r => t >= r.t0 && t < r.t0 + 8 * F) || t >= st.E - 6 * F; },
  rect: st => ({ x0: st.p.left, y0: st.p.top, x1: st.p.left + Math.max(...st.rows.map(r => r.w)), y1: st.rows[st.rows.length - 1].y + st.rows[st.rows.length - 1].h }),
  boxes(st, t) {
    return st.rows.filter(r => t >= r.t0).map(r => ({ el: r.g.content, kind: 'text', opacity: r.op, text: r.text }));
  },
};

// ───────────────────────── 3. Полоска прогресса: три тонких сегмента ─────────────────────────
const seg_bar = {
  id: 'seg_bar',
  mount(root, L, ctx) {
    const p = Object.assign({ x0: 150, x1: 930, y: 232, th: 7, gap: 14 }, L.params);
    const blocks = ctx.stages.filter(s => s.kind === 'block');
    const n = blocks.length, w = (p.x1 - p.x0 - p.gap * (n - 1)) / n;
    const wrap = el('div', 'abs', root, { left: p.x0 + 'px', top: (p.y - 10) + 'px', width: (p.x1 - p.x0) + 'px', height: (p.th + 20) + 'px' });
    wrap.dataset.check = 'graphic';
    const segs = blocks.map((b, i) => {
      const s = el('div', 'abs', wrap, { left: (i * (w + p.gap)) + 'px', top: '10px', width: w + 'px', height: p.th + 'px', borderRadius: p.th / 2 + 'px',
        background: 'rgba(255,255,255,.26)', boxShadow: '0 1px 6px rgba(0,0,0,.35)', overflow: 'hidden', transformOrigin: '50% 50%' });
      const f = el('div', 'abs', s, { left: '0px', top: '0px', width: w + 'px', height: p.th + 'px', background: '#fff', transformOrigin: '0 50%', transform: 'scaleX(0)' });
      const glow = el('div', 'abs', wrap, { top: (10 + p.th / 2 - 7) + 'px', width: '14px', height: '14px', borderRadius: '7px', background: WARM,
        boxShadow: `0 0 12px ${WARM}`, display: 'none' });
      return { b, s, f, glow, x: i * (w + p.gap), arm: p.arm ? p.arm[i] : null };
    });
    return { p, wrap, segs, w, S: L.start, E: L.end, loops: p.loops || [] };
  },
  update(st, t) {
    if (t < st.S || t >= st.E) return false;
    const a = outExpo(prog(t, st.S, 12 * F));
    st.wrap.style.opacity = clamp(a * 1.4).toFixed(3);
    st.segs.forEach((g, i) => {
      // появление: сегменты вытягиваются от центра, лесенка 2 кадра
      const ai = outExpo(prog(t, st.S + 2 * i * F, 12 * F));
      let sy = 1;
      const loop = st.loops.find(l => l.next === i && t >= l.start && t < l.end);
      if (loop) sy = 1 + 0.6 * Math.abs(Math.sin(Math.PI * (t - loop.start) / 0.45));
      g.s.style.transform = `scaleX(${(0.2 + 0.8 * ai).toFixed(4)}) scaleY(${sy.toFixed(3)})`;
      let fill = 0;
      if (t >= g.b.end) fill = 1;
      else if (t >= g.b.start) fill = (t - g.b.start) / (g.b.end - g.b.start);
      // на лиде: причина названа → сегмент «взводится» тонкой засветкой 12 %
      if (fill === 0 && g.arm != null && t >= g.arm) fill = 0.12 * outCubic(prog(t, g.arm, 8 * F));
      g.f.style.transform = `scaleX(${fill.toFixed(4)})`;
      const active = t >= g.b.start && t < g.b.end;
      g.glow.style.display = active ? '' : 'none';
      if (active) g.glow.style.left = (g.x + st.w * fill * (0.2 + 0.8 * ai) + st.w * (1 - (0.2 + 0.8 * ai)) / 2 - 7).toFixed(1) + 'px';
    });
    st.op = 1;
    return true;
  },
  fast(st, t) { return t >= st.S && t < st.S + 8 * F; },
  rect: st => ({ x0: st.p.x0, y0: st.p.y - 10, x1: st.p.x1, y1: st.p.y + st.p.th + 10 }),
  boxes(st) { return [{ el: st.wrap, kind: 'graphic', opacity: 1 }]; },
};

// ───────────────────────── 4. Заголовок блока: 01 — термин — пояснение ─────────────────────────
const block_title = {
  id: 'block_title',
  mount(root, L, ctx) {
    const p = Object.assign({ cx: 500, top: 1010, maxW: 820, termSize: 92, subSize: 44 }, L.params);
    const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
    const inner = el('div', '', meas, { padding: '30px 44px 36px 44px', fontFamily: 'Inter', color: INK });
    const head = el('div', '', inner, { position: 'relative', height: '96px', marginBottom: '10px' });
    const n = numeral(head, p.num, 104, WARM, 2.2);
    n.s.style.left = '-4px'; n.s.style.top = '-2px';
    const term = maskText(inner, p.term, { fontWeight: 900, fontSize: p.termSize + 'px', lineHeight: '1.0', letterSpacing: '-0.025em' }, 'letter');
    const sub = maskText(inner, typo(p.sub), { fontWeight: 700, fontSize: p.subSize + 'px', lineHeight: '1.1', color: 'rgba(255,255,255,.80)', marginTop: '14px' });
    term.line.dataset.font = sub.line.dataset.font = '1';
    // подгонка термина по ширине
    let ts = p.termSize;
    while (term.line.offsetWidth > p.maxW - 88 && ts > 64) { ts -= 2; term.line.style.fontSize = ts + 'px'; }
    const w = Math.ceil(Math.max(inner.offsetWidth, 560)), h = Math.ceil(inner.offsetHeight);
    const g = glass(root, w, h, { r: 36 });
    const x0 = Math.round(Math.min(940 - w, Math.max(60, p.cx - w / 2)));
    g.box.style.left = x0 + 'px'; g.box.style.top = p.top + 'px';
    g.box.style.transformOrigin = '50% 100%';
    g.content.appendChild(inner); meas.remove();
    inner.style.width = w + 'px';
    // линия от номера к правому краю
    const lx = 44 + n.w + 18, ly = 30 + 52;
    const ls = svg('svg', { width: w, height: h, style: 'position:absolute;left:0;top:0;overflow:visible' }, g.content);
    const grad = svg('linearGradient', { id: 'bl' + L.id, x1: 0, y1: 0, x2: 1, y2: 0 }, svg('defs', {}, ls));
    svg('stop', { offset: 0, 'stop-color': WARM, 'stop-opacity': 0.95 }, grad);
    svg('stop', { offset: 1, 'stop-color': WARM, 'stop-opacity': 0.05 }, grad);
    const line = svg('path', { d: `M${lx},${ly} H${w - 44}`, stroke: `url(#bl${L.id})`, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, ls);
    const llen = w - 44 - lx;
    g.box.dataset.check = 'text';
    return { p, g, n, term, sub, line, llen, x0, w, h, S: L.start, E: L.end, text: p.term + ' ' + p.sub };
  },
  update(st, t) {
    const { S, E, g } = st;
    if (t < S || t >= E) return false;
    const a = prog(t, S, 18 * F);
    const sp = spring(a, 0.5, 1.15);                    // 0.86 → 1.03 → 1
    const sc = 0.86 + 0.14 * sp;
    const op = clamp(prog(t, S, 4 * F)) * (1 - outF(t, E, 5));
    const out = outF(t, E, 5);
    const y = 46 * (1 - outExpo(prog(t, S, 12 * F))) - 18 * out + fl(t, S + 0.7, 2, 3.4) * smooth(prog(t, S + 0.5, 0.5));
    g.box.style.transform = `translateY(${y.toFixed(2)}px) scale(${(sc - 0.02 * out).toFixed(4)})`;
    g.box.style.opacity = op.toFixed(3);
    g.sheen(sheenPhase(t, S + 0.55, 1.8, 0.7));
    drawPath(st.n.tx, st.n.len, inOutCubic(prog(t, S + 2 * F, 16 * F)));
    drawPath(st.line, st.llen, inOutCubic(prog(t, S + 6 * F, 14 * F)));
    st.term.items.forEach((it, k) => rise(it, prog(t, S + (2 + k) * F, 8 * F), 1.25));
    st.sub.items.forEach((it, k) => rise(it, prog(t, S + (12 + 3 * k) * F, 9 * F)));
    st.op = op;
    return op > 0.001;
  },
  fast(st, t) { return (t >= st.S && t < st.S + 9 * F) || (t >= st.E - 5 * F && t < st.E); },
  rect: st => ({ x0: st.x0, y0: st.p.top, x1: st.x0 + st.w, y1: st.p.top + st.h }),
  boxes(st) { return [{ el: st.g.content, kind: 'text', opacity: st.op, text: st.text }]; },
};

// ───────────────────────── 5. Петля: стеклянная пилюля под полоской ─────────────────────────
const loop_pill = {
  id: 'loop_pill',
  mount(root, L, ctx) {
    const p = Object.assign({ cx: 540, top: 282, size: 46 }, L.params);
    const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
    const inner = el('div', '', meas, { display: 'flex', alignItems: 'center', gap: '18px', padding: '16px 34px 18px 38px', fontFamily: 'Inter', color: INK });
    const txt = maskText(inner, typo(p.text), { fontWeight: 800, fontSize: p.size + 'px', lineHeight: '1.05', letterSpacing: '-0.01em' });
    txt.line.dataset.font = '1';
    const arr = svg('svg', { width: 40, height: 28, viewBox: '0 0 40 28' }, inner);
    const ap = svg('path', { d: 'M2,14 H36 M24,3 L37,14 L24,25', stroke: WARM, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arr);
    const w = Math.ceil(inner.offsetWidth), h = Math.ceil(inner.offsetHeight);
    const g = glass(root, w, h, { r: h / 2 });
    const x0 = Math.round(p.cx - w / 2);
    g.box.style.left = x0 + 'px'; g.box.style.top = p.top + 'px';
    g.content.appendChild(inner); meas.remove();
    g.box.dataset.check = 'text';
    return { p, g, txt, arr, ap, x0, w, h, S: L.start, E: L.end };
  },
  update(st, t) {
    const { S, E, g } = st;
    if (t < S || t >= E) return false;
    const a = outQuint(prog(t, S, 10 * F));
    const out = outF(t, E, 4);
    const half = (1 - a) * 50;
    g.box.style.clipPath = a >= 1 ? '' : `inset(-30px ${half.toFixed(2)}% -30px ${half.toFixed(2)}% round ${st.h / 2}px)`;
    const sc = 0.92 + 0.08 * spring(prog(t, S, 14 * F), 0.5, 1.1);
    g.box.style.transform = `translateY(${(-10 * out).toFixed(2)}px) scale(${(sc - 0.03 * out).toFixed(4)})`;
    g.box.style.opacity = (1 - out).toFixed(3);
    g.sheen(sheenPhase(t, S + 0.3, 1.6, 0.6));
    st.txt.items.forEach((it, k) => rise(it, prog(t, S + (3 + 2 * k) * F, 8 * F), 1.2));
    drawPath(st.ap, 70, outCubic(prog(t, S + 8 * F, 10 * F)));
    const nudge = t > S + 0.6 ? 6 * Math.max(0, Math.sin(2 * Math.PI * (t - S - 0.6) / 0.7)) : 0;
    st.arr.style.transform = `translateX(${nudge.toFixed(2)}px)`;
    st.op = 1 - out;
    return st.op > 0.001;
  },
  fast(st, t) { return t >= st.S && t < st.S + 8 * F; },
  rect: st => ({ x0: st.x0, y0: st.p.top, x1: st.x0 + st.w, y1: st.p.top + st.h }),
  boxes(st) { return [{ el: st.g.content, kind: 'text', opacity: st.op, text: st.p.text }]; },
};

// ───────────────────────── 6. Стопка инструментов (блок 3): иконка-линия + слово ─────────────────────────
const ICONS = {
  check: 'M7,23 L18,34 L37,11',
  star: 'M22,4 L27,16 L40,17 L30,26 L33,39 L22,32 L11,39 L14,26 L4,17 L17,16 Z',
  heart: 'M22,38 C10,29 4,22 4,15 C4,9 9,5 14,5 C18,5 20.5,7.5 22,10 C23.5,7.5 26,5 30,5 C35,5 40,9 40,15 C40,22 34,29 22,38 Z',
  globe: 'M22,4 A18,18 0 1 0 22.01,4 Z M4,22 H40 M22,4 C13,13 13,31 22,40 M22,4 C31,13 31,31 22,40',
  phone: 'M13,3 H31 A4,4 0 0 1 35,7 V37 A4,4 0 0 1 31,41 H13 A4,4 0 0 1 9,37 V7 A4,4 0 0 1 13,3 Z M19,35 H25',
  grid: 'M5,5 H19 V19 H5 Z M25,5 H39 V19 H25 Z M5,25 H19 V39 H5 Z M25,25 H39 V39 H25 Z',
  tag: 'M4,6 V20 L24,40 L40,24 L20,4 H6 A2,2 0 0 0 4,6 Z M13,13 A2.5,2.5 0 1 0 13.01,13 Z',
  gift: 'M5,16 H39 V24 H5 Z M8,24 V40 H36 V24 M22,16 V40 M22,16 C17,16 11,14 12,9 C13,5 19,7 22,16 C25,7 31,5 32,9 C33,14 27,16 22,16',
};
const chip_stack = {
  id: 'chip_stack',
  mount(root, L, ctx) {
    const p = Object.assign({ left: 60, top: 1000, gap: 18, size: 50 }, L.params);
    let y = p.top;
    const chips = p.items.map((it, i) => {
      const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
      const inner = el('div', '', meas, { display: 'flex', alignItems: 'center', gap: '22px', padding: '18px 40px 20px 28px', fontFamily: 'Inter', color: INK });
      const ic = svg('svg', { width: 48, height: 48, viewBox: '0 0 44 44' }, inner);
      const ip = svg('path', { d: ICONS[it.icon], stroke: WARM, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ic);
      const lab = maskText(inner, it.label, { fontWeight: 900, fontSize: p.size + 'px', lineHeight: '1.0', letterSpacing: '-0.015em' });
      lab.line.dataset.font = '1';
      const w = Math.ceil(inner.offsetWidth), h = Math.ceil(inner.offsetHeight);
      const g = glass(root, w, h, { r: h / 2 });
      g.box.style.left = p.left + 'px'; g.box.style.top = y + 'px';
      g.content.appendChild(inner); meas.remove();
      g.box.dataset.check = 'text';
      const c = { g, ip, lab, w, h, y, t: it.t, text: it.label };
      y += h + p.gap;
      return c;
    });
    return { p, chips, S: L.start, E: L.end };
  },
  update(st, t) {
    if (t < st.S || t >= st.E) return false;
    let any = false;
    st.chips.forEach((c, i) => {
      if (t < c.t) { c.g.box.style.display = 'none'; c.op = 0; return; }
      c.g.box.style.display = '';
      const out = inCubic(prog(t, st.E - (5 + i) * F, 5 * F));
      const sp = spring(prog(t, c.t, 16 * F), 0.5, 1.1);
      const wipe = outQuint(prog(t, c.t, 9 * F));
      c.g.box.style.clipPath = wipe >= 1 ? '' : `inset(-40px ${((1 - wipe) * 100).toFixed(2)}% -40px -10px round ${c.h / 2}px)`;
      c.g.box.style.transform = `translate(${(-40 * (1 - sp) - 24 * out).toFixed(2)}px, ${fl(t, c.t + 0.5, 1.6, 3.2 + 0.4 * i).toFixed(2)}px)`;
      c.g.box.style.opacity = (1 - out).toFixed(3);
      c.g.sheen(sheenPhase(t, c.t + 0.4, 1.9 + 0.17 * i, 0.65));
      drawPath(c.ip, 170, inOutCubic(prog(t, c.t + 2 * F, 16 * F)));
      c.lab.items.forEach((it, k) => rise(it, prog(t, c.t + (2 + 2 * k) * F, 8 * F), 1.2));
      c.op = 1 - out;
      any = true;
    });
    return any;
  },
  fast(st, t) { return st.chips.some(c => t >= c.t && t < c.t + 8 * F) || (t >= st.E - 8 * F && t < st.E); },
  rect: st => ({ x0: st.p.left, y0: st.p.top, x1: st.p.left + Math.max(...st.chips.map(c => c.w)), y1: st.chips[st.chips.length - 1].y + st.chips[st.chips.length - 1].h }),
  boxes(st, t) { return st.chips.filter(c => t >= c.t).map(c => ({ el: c.g.content, kind: 'text', opacity: c.op, text: c.text })); },
};

// ───────────────────────── 7. Призыв: кодовое слово + подпись «пиши в комментариях» ─────────────────────────
const cta_glass = {
  id: 'cta_glass',
  mount(root, L, ctx) {
    const p = Object.assign({ cx: 500, top: 1040, size: 116 }, L.params);
    const meas = el('div', 'abs', root, { left: '0px', top: '0px', visibility: 'hidden' });
    const inner = el('div', '', meas, { padding: '30px 50px 44px 50px', fontFamily: 'Inter', color: INK, textAlign: 'left' });
    const top = el('div', '', inner, { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' });
    const ic = svg('svg', { width: 46, height: 46, viewBox: '0 0 44 44' }, top);
    const ip = svg('path', { d: 'M6,8 H38 A3,3 0 0 1 41,11 V29 A3,3 0 0 1 38,32 H18 L9,40 V32 H6 A3,3 0 0 1 3,29 V11 A3,3 0 0 1 6,8 Z M11,17 H33 M11,23 H26',
      stroke: WARM, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ic);
    const cap = maskText(top, typo(p.caption), { fontWeight: 700, fontSize: '44px', lineHeight: '1.1', color: 'rgba(255,255,255,.86)' });
    const word = maskText(inner, p.word, { fontWeight: 900, fontSize: p.size + 'px', lineHeight: '1.0', letterSpacing: '-0.03em' }, 'letter');
    cap.line.dataset.font = word.line.dataset.font = '1';
    let s = p.size;
    while (word.line.offsetWidth > 780 && s > 80) { s -= 2; word.line.style.fontSize = s + 'px'; }
    const w = Math.ceil(inner.offsetWidth), h = Math.ceil(inner.offsetHeight);
    const g = glass(root, w, h, { r: 36, a0: 0.66, a1: 0.82 });
    const x0 = Math.round(Math.min(940 - w, Math.max(60, p.cx - w / 2)));
    g.box.style.left = x0 + 'px'; g.box.style.top = p.top + 'px';
    g.box.style.transformOrigin = '50% 60%';
    g.content.appendChild(inner); meas.remove();
    // росчерк под словом (тёплый)
    const ww = word.line.offsetWidth, wy = word.line.offsetTop + word.line.offsetHeight + 4;
    const us = svg('svg', { width: w, height: h, style: 'position:absolute;left:0;top:0;overflow:visible' }, g.content);
    const ul = svg('path', { d: `M50,${wy + 6} C${50 + ww * 0.3},${wy - 4} ${50 + ww * 0.7},${wy - 2} ${50 + ww},${wy - 9}`,
      stroke: WARM, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, us);
    g.box.dataset.check = 'text';
    return { p, g, ip, cap, word, ul, ulen: ww * 1.08, x0, w, h, S: L.start, E: L.end, text: p.word + ' ' + p.caption };
  },
  update(st, t) {
    const { S, E, g } = st;
    if (t < S || t >= E) return false;
    const sp = spring(prog(t, S, 18 * F), 0.45, 1.2);
    const sc = 0.8 + 0.2 * sp;
    const op = clamp(prog(t, S, 3 * F));
    g.box.style.transform = `translateY(${(30 * (1 - outExpo(prog(t, S, 12 * F))) + fl(t, S + 0.8, 2, 3.4) * smooth(prog(t, S + 0.6, 0.5))).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    g.box.style.opacity = op.toFixed(3);
    g.sheen(sheenPhase(t, S + 0.5, 1.7, 0.7));
    // подпись — на её слове (S); кодовое слово — по буквам ровно со словом (t_word)
    const tw = st.p.t_word != null ? st.p.t_word : S;
    st.cap.items.forEach((it, k) => rise(it, prog(t, S + (2 + 2 * k) * F, 9 * F)));
    drawPath(st.ip, 200, inOutCubic(prog(t, S + 1 * F, 16 * F)));
    st.word.items.forEach((it, k) => rise(it, prog(t, tw + k * F, 8 * F), 1.4));
    drawPath(st.ul, st.ulen, inOutCubic(prog(t, tw + 8 * F, 12 * F)));
    st.op = op;
    return op > 0.001;
  },
  fast(st, t) { return (t >= st.S && t < st.S + 8 * F) || (st.p.t_word != null && t >= st.p.t_word && t < st.p.t_word + 8 * F); },
  rect: st => ({ x0: st.x0, y0: st.p.top, x1: st.x0 + st.w, y1: st.p.top + st.h }),
  boxes(st) { return [{ el: st.g.content, kind: 'text', opacity: st.op, text: st.text }]; },
};

// ───────────────────────── 8. Субтитры: белые, по словам, ключевое слово — тёплым ─────────────────────────
const BOTTOM = 1494, MAXW = 880;
const captions_v1 = {
  id: 'captions_v1',
  mount(root, L, ctx) {
    const p = L.params;
    const cards = p.cards.map(c => {
      const box = el('div', 'abs', root, { left: '0px', top: '0px', fontFamily: 'Inter', fontWeight: 900, fontSize: '70px', lineHeight: '1.12',
        color: '#fff', whiteSpace: 'nowrap', display: 'none', letterSpacing: '-0.015em',
        webkitTextStroke: '7px rgba(0,0,0,.55)', paintOrder: 'stroke fill', textShadow: '0 4px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.5)' });
      box.dataset.font = '1';
      const spans = c.words.map((w, i) => {
        const m = el('span', '', box, { display: 'inline-block', position: 'relative' });
        m.textContent = w.text;
        if (w.accent) m.style.color = WARM;
        if (i < c.words.length - 1) box.appendChild(document.createTextNode(' '));
        return { m, w };
      });
      return { c, box, spans };
    });
    for (const k of cards) {
      k.box.style.display = '';
      let size = 70;
      while (k.box.offsetWidth > MAXW && size > 58) { size -= 2; k.box.style.fontSize = size + 'px'; }
      k.w = k.box.offsetWidth; k.h = k.box.offsetHeight;
      k.box.style.display = 'none';
    }
    return { cards, suppress: p.suppress || [], cur: null };
  },
  update(st, t, ctx) {
    let on = null;
    if (!st.suppress.some(([a, b]) => t >= a && t < b)) on = st.cards.find(k => t >= k.c.start && t < k.c.end) || null;
    if (st.cur && st.cur !== on) st.cur.box.style.display = 'none';
    st.cur = on;
    if (!on) return false;
    const k = on;
    k.box.style.left = px(540 - k.w / 2);
    k.box.style.top = px(BOTTOM - k.h);
    k.box.style.display = '';
    // слово «встаёт» при произнесении: подъём 14 px + проявление за 4 кадра; до своего слова — 0
    for (const s of k.spans) {
      const a = prog(t, Math.max(k.c.start, s.w.start - 2 * F), 4 * F);
      const e = outCubic(a);
      s.m.style.opacity = e.toFixed(3);
      s.m.style.transform = e >= 1 ? '' : `translateY(${(14 * (1 - e)).toFixed(2)}px)`;
    }
    const fo = 1 - prog(t, k.c.end - 2 * F, 2 * F);
    k.box.style.opacity = fo.toFixed(3);
    st.op = fo;
    return fo > 0;
  },
  boxes(st) { return st.cur ? [{ el: st.cur.box, kind: 'text', opacity: st.op, text: st.cur.c.words.map(w => w.text).join(' ') }] : []; },
};

// ───────────────────────── 9. Вспышка-засвет на шве (тёплый белый, мягкий) ─────────────────────────
const bloom = {
  id: 'bloom',
  mount(root, L, ctx) {
    const p = Object.assign({ peak: 0.78 }, L.params);
    const d = el('div', 'abs', root, { left: '0px', top: '0px', width: '1080px', height: '1920px',
      background: 'radial-gradient(90% 60% at 50% 40%, rgba(255,250,240,1) 0%, rgba(255,240,215,.92) 45%, rgba(255,226,180,.70) 100%)' });
    d.dataset.check = 'graphic';
    return { p, d, at: p.at != null ? p.at : L.start, S: L.start, E: L.end };
  },
  update(st, t) {
    let a = 0;
    if (t >= st.at - 2 * F && t < st.at) a = outCubic(prog(t, st.at - 2 * F, 2 * F));
    else if (t >= st.at) a = Math.exp(-(t - st.at) / 0.06);
    a *= st.p.peak;
    if (t >= st.E || a < 0.01) return false;
    st.d.style.opacity = a.toFixed(3); st.op = a;
    return true;
  },
  boxes(st) { return [{ el: st.d, kind: 'graphic', opacity: st.op }]; },
};

export default { glass_hook, reason_list, seg_bar, block_title, loop_pill, chip_stack, cta_glass, captions_v1, bloom };
