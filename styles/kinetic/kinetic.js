// Стиль «kinetic» — кинетика и 3D: плиты влетают из глубины, двери на петлях, экструзия, скошенные красные теги, счётчик 1/N.
// Кадр = чистая функция времени. Внутри компонентов время основы tb = t − FZ (на стоп-кадре tb < 0).
// Без таймеров, случайности и CSS-анимаций. Данные — из plan.json (все времена плана переводятся в шкалу основы).
let FPS = 30, F = 1 / 30, FZ = 0.5;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, t0, d) => clamp((t - t0) / d, 0, 1);
const E = {
  outCubic: p => 1 - (1 - p) ** 3,
  inCubic: p => p ** 3,
  inOutCubic: p => p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2,
  outExpo: p => p >= 1 ? 1 : 1 - 2 ** (-10 * p),
  outBack: (s = 1.7) => p => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2,
  // пружина: перелёт ~10 % на 0,42, недолёт ~1 % на 0,83, покой к 1
  spring: p => p >= 1 ? 1 : 1 - Math.exp(-5.5 * p) * Math.cos(Math.PI * 2.4 * p),
};
const TAU = Math.PI * 2;

function h(tag, cls, parent, style, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) for (const k in style) e.style[k] = typeof style[k] === 'number' ? style[k] + 'px' : style[k];
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, parent, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function show(e, on) { const v = on ? '' : 'none'; if (e.style.display !== v) e.style.display = v; }
function fit(e, size, min, maxW) {
  e.style.fontSize = size + 'px';
  while (e.scrollWidth > maxW && size > min) { size -= 1; e.style.fontSize = size + 'px'; }
  return size;
}
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}-]+/gu, '');
// микротряска: 3 кадра, затухание; детерминированно от времени
function shake(tb, t0, amp, frames = 3) {
  const k = (tb - t0) * FPS;
  if (k < 0 || k >= frames) return [0, 0];
  const d = 1 - k / frames;
  return [amp * d * Math.sin(k * 2.9 + 0.7), amp * 0.6 * d * Math.cos(k * 3.7 + 0.2)];
}
// блик: полоса пробегает раз в period секунд
function shineX(tb, w, period, phase) {
  const u = ((tb + phase) % period + period) % period;
  const p = u / 0.55;
  return p < 1 ? -170 + (w + 340) * E.inOutCubic(p) : -600;
}
function addShine(parent, radius, soft) {
  const c = h('div', 'shine-clip', parent, { borderRadius: radius });
  const s = h('div', 'shine' + (soft ? ' soft' : ''), c);
  return (tb, w, period, phase) => { s.style.transform = `translateX(${shineX(tb, w, period, phase).toFixed(1)}px) skewX(-20deg)`; };
}
// заранее отрендеренное свечение (один раз на mount): скруглённый прямоугольник + blur в canvas
function glowRect(parent, w, hgt, r, color, blur, pad) {
  const c = h('canvas', 'abs', parent, { left: -pad, top: -pad });
  c.width = w + 2 * pad; c.height = hgt + 2 * pad;
  const g = c.getContext('2d');
  g.filter = `blur(${blur}px)`;
  g.fillStyle = color;
  g.beginPath(); g.roundRect(pad, pad, w, hgt, r); g.fill();
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.roundRect(pad + 4, pad + 4, w - 8, hgt - 8, Math.max(0, r - 4)); g.fill();
  return c;
}
// объёмный текст: жёсткая «экструзия» вниз-вправо (без размытия)
function extrude(color, n, dx = 1, dy = 1.2, soft = 'rgba(0,0,0,.35)') {
  const a = [];
  for (let i = 1; i <= n; i++) a.push(`${(i * dx).toFixed(1)}px ${(i * dy).toFixed(1)}px 0 ${color}`);
  a.push(`${(n * dx + 4).toFixed(1)}px ${(n * dy + 8).toFixed(1)}px 0 ${soft}`);
  return a.join(',');
}
function boxShadowExtrude(color, n, dx = 1, dy = 1.2, extra = '') {
  const a = [];
  for (let i = 1; i <= n; i++) a.push(`${(i * dx).toFixed(1)}px ${(i * dy).toFixed(1)}px 0 ${color}`);
  if (extra) a.push(extra);
  return a.join(',');
}

const FAST = [];   // [t0, t1] во времени основы — кадры с размытием в движении (подкадры)
const SFX = [];    // {type, tb, gain_db, dur}
const ITEMS = [];

// ---------------------------------------------------------------- 1. Хук: стикер-карточка с указателем к пальцу
function mountHook(stage, HK) {
  const T_END = HK.e - FZ;
  const TIP = HK.tip;
  const L = h('div', 'layer', stage, { perspective: '1300px', perspectiveOrigin: '330px 1150px' });
  const g = h('div', 'abs p3d', L, { left: 0, top: 0, width: 470 });
  const CW = 470;
  const depth = h('div', 'abs', g, { left: 0, top: 0, width: CW, background: 'var(--paper-deep)', borderRadius: 30,
    transform: 'translate3d(9px,12px,-12px)', boxShadow: '0 34px 46px rgba(0,0,0,.5)' });
  const ptrD = h('div', 'abs', g, { width: 62, height: 62, background: 'var(--paper-deep)', borderRadius: 8 });
  const card = h('div', 'abs', g, { left: 0, top: 0, width: CW, background: '#fff', borderRadius: 30 });
  const ptr = h('div', 'abs', g, { width: 62, height: 62, background: '#fff', borderRadius: 8 });
  const cont = h('div', 'abs p3d', g, { left: 0, top: 0, width: CW, padding: '24px 30px 34px' });
  const r1 = h('div', 'p3d', cont, { display: 'flex', alignItems: 'flex-end' });
  if (HK.kicker) {
    const vot = h('div', 'ub nw', r1, { fontSize: 62, color: 'var(--ink)', lineHeight: '1', marginBottom: 30, letterSpacing: '-.01em' }, HK.kicker);
    vot.dataset.check = HK.kicker;
  }
  if (HK.number) {
    const three = h('div', 'ub nw', r1, { fontSize: 236, lineHeight: '.8', color: 'var(--red)', marginLeft: HK.kicker ? 22 : 0, marginTop: 6,
      textShadow: extrude('#8E1318', 9, 0.9, 1.1, 'rgba(0,0,0,.25)') });
    three.textContent = HK.number; three.dataset.check = HK.number;
  }
  const rws = HK.lines.map((ln, i) => {
    const r = h('div', 'ub nw', cont, { color: 'var(--ink)', lineHeight: '1.02', display: 'inline-block', marginTop: i === 0 && (HK.kicker || HK.number) ? 10 : 0, letterSpacing: '-.015em' }, ln);
    r.dataset.check = ln;
    h('br', null, cont);
    return r;
  });
  const fs = Math.min(...rws.map(r => fit(r, 70, 40, CW - 60)));
  for (const r of rws) r.style.fontSize = fs + 'px';
  const CH = cont.offsetHeight + 8;
  for (const e of [depth, card]) e.style.height = CH + 'px';
  const shineCard = addShine(card, 30, false);
  // указатель — ромб, наполовину спрятан под карточкой; вершина справа на высоте PY
  const PY = 196;
  const sq = 62, half = sq * Math.SQRT1_2;  // полудиагональ
  const apexX = CW + 30;
  for (const [e, dx, dy] of [[ptr, 0, 0], [ptrD, 9, 12]]) {
    e.style.left = (apexX - half - sq / 2 + dx) + 'px'; e.style.top = (PY - sq / 2 + dy) + 'px';
    e.style.transform = 'rotate(45deg)' + (e === ptrD ? ' translateZ(-12px)' : '');
  }
  const apex = h('div', 'abs', g, { left: apexX - 1, top: PY, width: 1, height: 1 });
  // красный тег-пояснение: скошенный, ближе к камере (параллакс)
  const tag = h('div', 'abs p3d', g, { left: -18, top: CH - 30, transform: 'translateZ(46px) rotate(-3deg)' });
  const tagBg = h('div', 'abs', tag, { left: 0, top: 0, right: 0, bottom: 0, background: 'var(--red)', transform: 'skewX(-9deg)',
    borderRadius: 10, boxShadow: boxShadowExtrude('#8E1318', 7, .9, 1.1, '0 22px 28px rgba(0,0,0,.45)') });
  const tagIn = h('div', 'abs', tag, { position: 'relative', padding: '12px 30px 16px 28px' });
  if (!HK.sub.length) tag.style.display = 'none';
  for (const ln of HK.sub.slice(0, -1)) { const l1 = h('div', 'in9 nw', tagIn, { fontSize: 42, color: '#fff', lineHeight: '1.15' }, ln); l1.dataset.check = ln; }
  const l2w = h('div', 'nw', tagIn, { position: 'relative', display: 'inline-block' });
  const l2 = h('span', 'in9 nw', l2w, { fontSize: 42, color: '#fff', lineHeight: '1.15', position: 'relative', zIndex: 1 }, HK.sub.length ? HK.sub[HK.sub.length - 1] : '');
  l2.dataset.check = l2.textContent;
  const uw = l2.offsetWidth + 14;
  const us = sv('svg', l2w, { width: uw + 10, height: 30, viewBox: `0 0 ${uw + 10} 30`, style: 'position:absolute;left:-6px;top:40px;overflow:visible' });
  const up = sv('path', us, { d: `M4 16 C ${uw * .25} 8, ${uw * .45} 22, ${uw * .62} 13 S ${uw * .9} 9, ${uw + 4} 15`, fill: 'none',
    stroke: '#FFC928', 'stroke-width': 9, 'stroke-linecap': 'round' });
  const ulen = up.getTotalLength();
  up.style.strokeDasharray = ulen; up.style.strokeDashoffset = ulen;
  const shineTag = addShine(tagBg, 10, false);

  // позиция: вершина указателя на 18 px левее кончика пальца; без пальца — карточка сверху по центру, без указателя
  if (!TIP) { ptr.style.display = ptrD.style.display = 'none'; }
  const AX = TIP ? TIP[0] - 18 : 0, AY = TIP ? TIP[1] : 0;
  let X = TIP ? AX - apexX : 500 - CW / 2, Y = TIP ? AY - PY : 250;
  const T_SH = HK.accent_at != null ? HK.accent_at - FZ : 2.2, T_UL = T_SH - 0.16;
  const fl = tb => ({ ry: 1.6 * Math.sin(TAU * tb / 3.4), rx: 1.0 * Math.sin(TAU * tb / 2.9 + 1), ty: 3 * Math.sin(TAU * tb / 2.5) });
  function pose(tb) {
    const f = fl(tb);
    let ry = -12 + f.ry, rx = 3 + f.rx, tx = X, ty = Y + f.ty, tz = 0, op = 1;
    const pe = E.inCubic(prog(tb, T_END - 0.15, 0.15));
    ry += 80 * pe; tx -= 300 * pe; tz += 260 * pe; op = 1 - prog(tb, T_END - 0.08, 0.08);
    return { t: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateZ(-3deg)`, op };
  }
  g.style.transformOrigin = `${CW / 2}px ${CH / 2}px`;
  for (let it = 0; TIP && it < 3; it++) {      // подгонка вершины к пальцу на кадре 0 (с учётом перспективы)
    g.style.transform = pose(-FZ).t;
    const r = apex.getBoundingClientRect();
    X += AX - r.left; Y += AY - r.top;
  }
  FAST.push([T_END - 0.16, T_END]);
  SFX.push({ type: 'whoosh', tb: T_END - 0.03, gain_db: -17, name: 'hook_out' });
  SFX.push({ type: 'pop', tb: T_UL, gain_db: -19, name: 'underline' });
  ITEMS.push({ name: HK.id, wrap: L, update(tb) {
    if (tb >= T_END) return false;
    const p = pose(tb); g.style.transform = p.t; g.style.opacity = p.op;
    shineCard(tb, CW, 1.9, 1.35); shineTag(tb, 520, 1.9, 1.05);
    up.style.strokeDashoffset = (ulen * (1 - E.outCubic(prog(tb, T_UL, 0.24)))).toFixed(1); up.style.opacity = tb >= T_UL ? 1 : 0;
    const [sx, sy] = shake(tb, T_SH, 7);
    tag.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,46px) rotate(-3deg)`;
    return true;
  }, apex });
}

// ---------------------------------------------------------------- 2. Лид: три термина влетают из глубины
function mountLead(stage, LD) {
  const T0 = LD.items[0].q_t - FZ - 0.1, T1 = LD.e - FZ;
  const L = h('div', 'layer', stage, { perspective: '1100px', perspectiveOrigin: '500px 1100px' });
  const rows = LD.items.map(it => ({ adj: (it.qual || '').toUpperCase(), term: it.term.toUpperCase(), a: { start: it.q_t - FZ }, n: { start: it.t_t - FZ }, up: it.dir !== 'down' }));
  const TOP = 960, STEP = 150;
  const R = rows.map((r, i) => {
    const row = h('div', 'abs p3d', L, { left: 60, top: TOP + i * STEP, width: 880, height: 120 });
    const num = h('div', 'abs', row, { left: 0, top: 0, width: 116, height: 116, background: 'var(--yel)', borderRadius: 24,
      boxShadow: boxShadowExtrude('#B98A00', 8, .8, 1.1, '0 20px 26px rgba(0,0,0,.45)') });
    const nd = h('div', 'ub nw', num, { position: 'absolute', left: 0, right: 0, top: 14, textAlign: 'center', fontSize: 78,
      lineHeight: '1', color: 'var(--ink)' }, String(i + 1));
    nd.dataset.check = String(i + 1);
    const slab = h('div', 'abs p3d', row, { left: 134, top: 0, height: 116, transformOrigin: '0 50%' });
    const sb = h('div', 'abs', slab, { left: 0, top: 0, right: 0, bottom: 0, background: '#fff', borderRadius: 22,
      boxShadow: boxShadowExtrude('#B9B1A3', 8, .8, 1.1, '0 22px 30px rgba(0,0,0,.45)') });
    const sin = h('div', 'nw', slab, { position: 'relative', display: 'flex', alignItems: 'center', height: 116, padding: '0 26px 0 30px' });
    const term = h('div', 'ub nw', sin, { color: 'var(--ink)', lineHeight: '1', letterSpacing: '-.02em', marginTop: 6 }, r.term);
    term.dataset.check = r.term;
    // стрелка-иконка: линия + наконечник (↑ рост затрат, ↓ падение возврата)
    const ar = sv('svg', sin, { width: 46, height: 64, viewBox: '0 0 46 64', style: 'margin-left:18px;flex:none;overflow:visible' });
    const d = r.up ? 'M23 58 L23 8 M6 25 L23 8 L40 25' : 'M23 6 L23 56 M6 39 L23 56 L40 39';
    const ap = sv('path', ar, { d, fill: 'none', stroke: '#E3242B', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const alen = ap.getTotalLength(); ap.style.strokeDasharray = alen;
    fit(term, 60, 40, 880 - 134 - 56 - 64 - 16);
    const shine = addShine(sb, 22, false);
    const tag = h('div', 'abs', row, { left: 150, top: -26, transform: 'rotate(-4deg)', transformOrigin: '0 100%' });
    h('div', 'abs', tag, { left: 0, top: 0, right: 0, bottom: 0, background: 'var(--red)', transform: 'skewX(-10deg)', borderRadius: 8,
      boxShadow: boxShadowExtrude('#8E1318', 5, .8, 1, '0 10px 14px rgba(0,0,0,.35)') });
    const tt = h('div', 'in9 nw', tag, { position: 'relative', fontSize: 40, color: '#fff', lineHeight: '1', padding: '8px 18px 9px' }, r.adj);
    tt.dataset.check = r.adj;
    if (!r.adj) tag.style.display = 'none';
    const ta = r.a.start - 2 * F, tn = r.n.start - 3 * F;
    FAST.push([tn, tn + 6 * F], [T1 - 4 * F, T1]);
    SFX.push({ type: 'whoosh', tb: tn + 7 * F, gain_db: -17, name: 'lead_' + i });
    return { row, num, slab, tag, ap, alen, shine, ta, tn, i, sbw: () => slab.offsetWidth };
  });
  const widths = R.map(r => r.slab.offsetWidth);
  ITEMS.push({ name: LD.id, wrap: L, update(tb) {
    if (tb < T0 || tb >= T1) return false;
    for (const r of R) {
      // плитка-номер: переворот на ребре + тег прилегают на прилагательном
      const pa = prog(tb, r.ta, 0.33), sa = E.spring(pa);
      const okA = tb >= r.ta;
      r.num.style.opacity = okA ? clamp((tb - r.ta) / (2 * F), 0, 1) : 0;
      r.tag.style.opacity = r.num.style.opacity;
      r.num.style.transform = `rotateY(${(-110 * (1 - sa)).toFixed(2)}deg) scale(${(0.8 + 0.2 * sa).toFixed(3)})`;
      const st = E.outBack(2.2)(prog(tb, r.ta + 2 * F, 0.26));
      r.tag.style.transform = `rotate(${(-9 + 5 * st).toFixed(2)}deg) scale(${(0.7 + 0.3 * st).toFixed(3)})`;
      // плита термина: из глубины (Z −1500), поворот по X/Y, посадка пружиной + микротряска ряда
      const pn = prog(tb, r.tn, 0.36), sn = E.spring(pn);
      const okN = tb >= r.tn;
      const z = -1500 * (1 - sn), rx = 52 * (1 - sn), ry = -34 * (1 - sn), tx = 240 * (1 - sn);
      r.slab.style.opacity = okN ? clamp((tb - r.tn) / (3 * F), 0, 1) : 0;
      const [kx, ky] = shake(tb, r.tn + 7 * F, 6);
      r.slab.style.transform = `translate3d(${(tx + kx).toFixed(1)}px,${ky.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      r.ap.style.strokeDashoffset = (r.alen * (1 - E.outCubic(prog(tb, r.tn + 8 * F, 0.25)))).toFixed(1);
      r.shine(tb, widths[r.i], 1.8, 1.2 - r.tn);
      // выход: ряды уносятся влево со сдвигом в кадр (под whip на шве)
      const pe = E.inCubic(prog(tb, T1 - (5 - r.i) * F, 4 * F));
      r.row.style.transform = `translate3d(${(-760 * pe).toFixed(1)}px,${(3 * Math.sin(TAU * (tb + r.i * .4) / 2.6)).toFixed(1)}px,${(120 * pe).toFixed(1)}px) rotateY(${(35 * pe).toFixed(2)}deg)`;
      r.row.style.opacity = 1 - prog(tb, T1 - 2 * F, 2 * F);
    }
    return true;
  } });
}

// ---------------------------------------------------------------- 3. Счётчик 1/3 · 2/3 · 3/3 с перекатом + карточки терминов
let BLOCKS = [];          // [{S, term, expl: [строки]}] — шкала основы
let T_CTA = 1e9;
const HOLD = 2.9;
function mountCounter(stage) {
  const L = h('div', 'layer', stage, { perspective: '1200px', perspectiveOrigin: '200px 330px' });
  const TW = 222, TH = 196;
  const tile = h('div', 'abs p3d', L, { left: 60, top: 238, width: TW, height: TH, transformOrigin: '0 0' });
  const glow = glowRect(tile, TW, TH, 30, 'rgba(255,201,40,.85)', 16, 40);
  glow.style.transform = 'translateZ(-20px)';
  const body = h('div', 'abs', tile, { left: 0, top: 0, width: TW, height: TH, background: 'var(--yel)', borderRadius: 30,
    boxShadow: boxShadowExtrude('#B98A00', 9, .8, 1.1, '0 26px 34px rgba(0,0,0,.45)') });
  const win = h('div', 'abs', body, { left: 0, top: 0, width: 150, height: TH, overflow: 'hidden' });
  const col = h('div', 'abs', win, { left: 0, top: 0, width: 150 });
  const digs = [];
  for (let d = 1; d <= BLOCKS.length; d++) {
    const e = h('div', 'ub nw', col, { height: TH, fontSize: 156, lineHeight: TH + 'px', textAlign: 'center', color: 'var(--ink)',
      paddingTop: 10, paddingLeft: 18 }, String(d));
    digs.push(e);
  }
  const of3 = h('div', 'ub nw', body, { position: 'absolute', right: 14, bottom: 20, fontSize: 60, lineHeight: '1', color: 'var(--red)' }, '/' + BLOCKS.length);
  of3.dataset.check = '/' + BLOCKS.length;
  const shine = addShine(body, 30, false);
  // ключи масштаба: 1 — большой, 0,62 — компактный в углу
  const SM = 0.62;
  const keys = [];
  BLOCKS.forEach((b, i) => {
    if (i > 0) keys.push({ t: b.S - 4 * F, v: 1, d: 0.3, e: E.spring });
    keys.push({ t: b.S + HOLD, v: SM, d: 0.26, e: E.inOutCubic });
  });
  const scaleAt = tb => { let v = 1; for (const k of keys) { if (tb < k.t) break; v = lerp(v, k.v, k.e(prog(tb, k.t, k.d))); } return v; };
  const rollAt = tb => { let v = 0; BLOCKS.forEach((b, i) => { if (i > 0) v += E.outBack(1.4)(prog(tb, b.S, 0.32)); }); return v; };
  BLOCKS.forEach((b, i) => { if (i > 0) { FAST.push([b.S, b.S + 5 * F]); SFX.push({ type: 'click', tb: b.S + 6 * F, gain_db: -20, name: 'roll_' + i }); } });
  const T_IN = BLOCKS[0].S + F;
  FAST.push([T_IN, T_IN + 5 * F], [T_CTA - 4 * F, T_CTA]);
  ITEMS.push({ name: 'counter', wrap: L, update(tb) {
    if (tb < T_IN || tb >= T_CTA) return false;
    const pin = prog(tb, T_IN, 0.36), si = E.spring(pin);
    const s = scaleAt(tb);
    const z = 700 * (1 - si), rx = -70 * (1 - si);
    const pe = E.inCubic(prog(tb, T_CTA - 4 * F, 4 * F));
    const fy = 2.5 * Math.sin(TAU * tb / 2.3), ry = 6 * Math.sin(TAU * tb / 4.1);
    tile.style.opacity = clamp((tb - T_IN) / (2 * F), 0, 1) * (1 - prog(tb, T_CTA - F, F));
    tile.style.transform = `translate3d(${(-500 * pe).toFixed(1)}px,${fy.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${(ry - 40 * pe).toFixed(2)}deg) scale(${s.toFixed(4)})`;
    col.style.transform = `translateY(${(-TH * rollAt(tb)).toFixed(1)}px)`;
    glow.style.opacity = (0.35 + 0.65 * (s - SM) / (1 - SM)).toFixed(3);
    shine(tb, TW, 2.0, 0.4);
    return true;
  } });
  return { tile };
}

function mountTerm(stage, b, i) {
  const nextS = i + 1 < BLOCKS.length ? BLOCKS[i + 1].S : T_CTA;
  const S = b.S, T_IN = S + 2 * F, T_OUT = Math.min(S + HOLD, nextS - 9 * F);   // короткий блок: карточка уходит до следующей
  const L = h('div', 'layer', stage, { perspective: '1300px', perspectiveOrigin: '260px 340px' });
  const X0 = 298, MAXW = 940 - X0;
  const card = h('div', 'abs p3d', L, { left: X0, top: 248, transformOrigin: '0 50%' });
  const bg = h('div', 'abs', card, { left: 0, top: 0, right: 0, bottom: 0, background: '#fff',
    clipPath: 'polygon(0 0, calc(100% - 46px) 0, 100% 46px, 100% 100%, 0 100%)', borderRadius: 18 });
  const bgd = h('div', 'abs', card, { left: 0, top: 0, right: 0, bottom: 0, background: '#B9B1A3', transform: 'translate3d(8px,10px,-10px)',
    clipPath: 'polygon(0 0, calc(100% - 46px) 0, 100% 46px, 100% 100%, 0 100%)', borderRadius: 18 });
  card.insertBefore(bgd, bg);
  const shine = addShine(bg, 18, false);
  const inner = h('div', 'p3d', card, { position: 'relative', padding: '22px 40px 26px 30px' });
  const term = h('div', 'ub nw', inner, { color: 'var(--ink)', lineHeight: '1', letterSpacing: '-.02em', display: 'inline-block', marginTop: 4 }, b.term);
  term.dataset.check = b.term;
  fit(term, 64, 40, MAXW - 70);
  h('br', null, inner);
  const tag = h('div', 'p3d', inner, { display: 'inline-block', position: 'relative', marginTop: 14, transform: 'translateZ(40px) rotate(-1.5deg)' });
  h('div', 'abs', tag, { left: 0, top: 0, right: 0, bottom: 0, background: 'var(--red)', transform: 'skewX(-9deg)', borderRadius: 8,
    boxShadow: boxShadowExtrude('#8E1318', 5, .8, 1, '0 12px 16px rgba(0,0,0,.35)') });
  const tl = h('div', 'nw', tag, { position: 'relative', padding: '7px 18px 10px' });
  const ws = [];
  b.expl.forEach(line => {
    const ld = h('div', 'nw', tl, { lineHeight: '1.12' });
    line.split(' ').forEach(w => { const m = h('span', 'mask', ld, { marginRight: '11px' }); ws.push(h('span', 'in9 nw', m, { fontSize: 44, color: '#fff' }, w)); });
  });
  tl.dataset.check = b.expl.join(' ');
  card.style.width = Math.min(MAXW, Math.max(term.offsetWidth + 70, tl.offsetWidth + 76)) + 'px';
  tag.style.transformOrigin = '0 50%';
  const cw = card.offsetWidth;
  FAST.push([T_IN, T_IN + 5 * F], [T_OUT, T_OUT + 6 * F]);
  ITEMS.push({ name: b.id, wrap: L, update(tb) {
    if (tb < T_IN || tb >= T_OUT + 7 * F) return false;
    // дверь на петлях от плитки-счётчика: rotateY −105° → 0 с перелётом
    const p = E.spring(prog(tb, T_IN, 0.4));
    const pe = E.inCubic(prog(tb, T_OUT, 6 * F));
    const ry = -105 * (1 - p), rx = -88 * pe;
    const fl = 2 * Math.sin(TAU * (tb - S) / 2.5);
    card.style.transformOrigin = pe > 0 ? '50% 0' : '0 50%';
    card.style.opacity = clamp((tb - T_IN) / (2 * F), 0, 1) * (1 - prog(tb, T_OUT + 4 * F, 2 * F));
    card.style.transform = `translate3d(0,${fl.toFixed(1)}px,0) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateY(${(2.5 * Math.sin(TAU * (tb - S) / 3.6)).toFixed(2)}deg)`;
    const tw = E.outBack(1.4)(prog(tb, T_IN + 6 * F, 7 * F));
    tag.style.transform = `translateZ(40px) rotate(-1.5deg) scaleX(${Math.max(0.001, tw).toFixed(3)})`;
    ws.forEach((s, k) => {
      const q = E.outExpo(prog(tb, T_IN + (9 + 2 * k) * F, 0.32));
      s.style.transform = `translateY(${(105 * (1 - q)).toFixed(1)}%)`;
    });
    shine(tb, cw, 1.9, 1.5 - S);
    return true;
  } });
}

// ---------------------------------------------------------------- 4. Открытые петли
function mountTeaser(stage, name, lines, tStart, tEnd) {
  const L = h('div', 'layer', stage, { perspective: '1200px', perspectiveOrigin: '500px 1180px' });
  const g = h('div', 'abs p3d', L, { left: 0, top: 1080 });
  const box = h('div', 'p3d', g, { position: 'relative', padding: '26px 40px 30px 40px' });
  const bg = h('div', 'abs', box, { left: 0, top: 0, right: 0, bottom: 0, background: 'var(--ink)', borderRadius: 28,
    border: '3px solid rgba(255,201,40,.9)', boxShadow: '0 26px 40px rgba(0,0,0,.5)' });
  const content = h('div', 'p3d', box, { position: 'relative', display: 'flex', alignItems: 'center' });
  const txt = h('div', 'p3d', content, {});
  const parts = [];
  lines.forEach(line => {
    const ln = h('div', 'nw', txt, { lineHeight: '1.08' });
    line.forEach(([s, col]) => {
      const m = h('span', 'mask', ln, { marginRight: '16px' });
      const e = h('span', 'ub nw', m, { fontSize: 62, color: col, letterSpacing: '-.02em' }, s);
      parts.push(e);
    });
    ln.dataset.check = line.map(x => x[0]).join(' ');
  });
  const ar = sv('svg', content, { width: 110, height: 70, viewBox: '0 0 110 70', style: 'margin-left:16px;flex:none;overflow:visible' });
  const ap = sv('path', ar, { d: 'M6 35 L96 35 M70 10 L98 35 L70 60', fill: 'none', stroke: '#FFC928', 'stroke-width': 11,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const alen = ap.getTotalLength(); ap.style.strokeDasharray = alen;
  const bw = box.offsetWidth, bh = box.offsetHeight;
  const glow = glowRect(box, bw, bh, 28, 'rgba(255,201,40,.75)', 14, 36);
  box.insertBefore(glow, bg);
  glow.style.transform = 'translateZ(-30px)';
  const shine = addShine(bg, 28, true);
  g.style.left = Math.round(500 - bw / 2) + 'px';
  g.style.transformOrigin = `${bw / 2}px ${bh / 2}px`;
  FAST.push([tStart, tStart + 6 * F], [tEnd - 3 * F, tEnd]);
  SFX.push({ type: 'pop', tb: tStart, gain_db: -17, name: name + '_in' });
  SFX.push({ type: 'riser', tb: tEnd, dur: Math.min(1.1, tEnd - tStart - 0.15), gain_db: -18, name: name + '_riser' });
  ITEMS.push({ name, wrap: L, update(tb) {
    if (tb < tStart || tb >= tEnd) return false;
    const p = E.spring(prog(tb, tStart, 0.4));
    const pe = E.inCubic(prog(tb, tEnd - 3 * F, 3 * F));
    const tx = 560 * (1 - p) - 700 * pe, ry = -16 - 60 * (1 - p) + 30 * pe, rx = 6;
    const fy = 3 * Math.sin(TAU * (tb - tStart) / 2.2);
    g.style.opacity = clamp((tb - tStart) / (2 * F), 0, 1);
    g.style.transform = `translate3d(${tx.toFixed(1)}px,${fy.toFixed(1)}px,${(-200 * (1 - p)).toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx}deg) rotateZ(-2deg)`;
    parts.forEach((e, k) => { const q = E.outExpo(prog(tb, tStart + (4 + 2 * k) * F, 0.3)); e.style.transform = `translateY(${(105 * (1 - q)).toFixed(1)}%)`; });
    ap.style.strokeDashoffset = (alen * (1 - E.outCubic(prog(tb, tStart + (6 + 2 * parts.length) * F, 0.25)))).toFixed(1);
    shine(tb, bw, 1.6, -tStart + 0.2);
    return true;
  } });
}

// ---------------------------------------------------------------- 5. Чипы возвращаемости (3D-лестница)
function mountChips(stage, name, items, tOut) {
  const L = h('div', 'layer', stage, { perspective: '1100px', perspectiveOrigin: '480px 1150px' });
  const g = h('div', 'abs p3d', L, { left: 0, top: 0, width: 1080, height: 1920, transformOrigin: '480px 1150px' });
  const C = items.map(([label, w], i) => {
    const t0 = w.start - 2 * F;
    const chip = h('div', 'abs p3d', g, { left: 96 + i * 70, top: 990 + i * 122 });
    const bg = h('div', 'abs', chip, { left: 0, top: 0, right: 0, bottom: 0, background: '#fff', borderRadius: 60,
      boxShadow: boxShadowExtrude('#B9B1A3', 8, .8, 1.1, '0 20px 28px rgba(0,0,0,.45)') });
    const row = h('div', 'nw', chip, { position: 'relative', display: 'flex', alignItems: 'center', height: 104, padding: '0 40px 0 18px' });
    const dot = h('div', null, row, { width: 70, height: 70, borderRadius: 35, background: 'var(--yel)', flex: 'none', marginRight: 18,
      display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const ck = sv('svg', dot, { width: 40, height: 40, viewBox: '0 0 40 40' });
    const cp = sv('path', ck, { d: 'M8 21 L17 30 L33 11', fill: 'none', stroke: '#17161A', 'stroke-width': 6.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const cl = cp.getTotalLength(); cp.style.strokeDasharray = cl;
    const tx = h('div', 'in9 nw', row, { fontSize: 54, color: 'var(--ink)', lineHeight: '1', letterSpacing: '-.01em', marginTop: 2 }, label);
    tx.dataset.check = label;
    const shine = addShine(bg, 60, false);
    FAST.push([t0, t0 + 5 * F]);
    SFX.push({ type: 'click', tb: t0 + 6 * F, gain_db: -21, name: `${name}_${i}` });
    return { chip, cp, cl, t0, i, shine, w: () => chip.offsetWidth };
  });
  const widths = C.map(c => c.chip.offsetWidth);
  const tA = C[0].t0;
  FAST.push([tOut, tOut + 7 * F]);
  ITEMS.push({ name, wrap: L, update(tb) {
    if (tb < tA || tb >= tOut + 8 * F) return false;
    g.style.transform = `rotateY(${(-7 + 4 * Math.sin(TAU * (tb - tA) / 4.2)).toFixed(2)}deg) rotateX(${(4 + 1.5 * Math.sin(TAU * (tb - tA) / 3.1)).toFixed(2)}deg)`;
    for (const c of C) {
      const p = E.spring(prog(tb, c.t0, 0.34));
      const ok = tb >= c.t0;
      const pe = E.inCubic(prog(tb, tOut + c.i * F, 5 * F));
      const z = -900 * (1 - p) + 60 * c.i - 300 * pe, rx = -75 * (1 - p) + 85 * pe, ty = 90 * (1 - p) + 40 * pe;
      c.chip.style.opacity = ok ? clamp((tb - c.t0) / (2 * F), 0, 1) * (1 - prog(tb, tOut + (c.i + 3) * F, 2 * F)) : 0;
      c.chip.style.transform = `translate3d(0,${(ty + 2.5 * Math.sin(TAU * (tb + c.i * .5) / 2.4)).toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg)`;
      c.cp.style.strokeDashoffset = (c.cl * (1 - E.outCubic(prog(tb, c.t0 + 7 * F, 0.22)))).toFixed(1);
      c.shine(tb, widths[c.i], 1.8, 0.6 - c.t0 + c.i * 0.15);
    }
    return true;
  } });
}

// ---------------------------------------------------------------- 6. Призыв: поле комментария + кодовое слово по буквам
function mountCTA(stage, CT) {
  const WORD = CT.word.toUpperCase(), CAP = (CT.caption || '').toUpperCase();
  const wP = { start: CT.tag_t - FZ }, wF = { start: CT.word_t - FZ };
  const tTag = wP.start - 3 * F, tPill = Math.min(wP.start, wF.start) - 5 * F, tF = wF.start - 2 * F;
  const L = h('div', 'layer', stage, { perspective: '1200px', perspectiveOrigin: '500px 1180px' });
  const g = h('div', 'abs p3d', L, { left: 80, top: 1120, width: 840, height: 156, transformOrigin: '420px 78px' });
  const glow = glowRect(g, 840, 156, 78, 'rgba(255,201,40,.95)', 22, 60);
  glow.style.transform = 'translateZ(-24px)';
  const depth = h('div', 'abs', g, { left: 0, top: 0, width: 840, height: 156, borderRadius: 78, background: '#B98A00',
    transform: 'translate3d(8px,11px,-10px)', boxShadow: '0 28px 40px rgba(0,0,0,.5)' });
  const pill = h('div', 'abs', g, { left: 0, top: 0, width: 840, height: 156, borderRadius: 78, background: '#fff' });
  const pillY = h('div', 'abs', g, { left: 0, top: 0, width: 840, height: 156, borderRadius: 78, background: 'var(--yel)' });
  const shine = addShine(pillY, 78, false);
  const row = h('div', 'abs p3d nw', g, { left: 0, top: 0, width: 840, height: 156, display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const letters = [...WORD].map(ch => h('span', 'ub nw', row, { fontSize: 98, color: 'var(--ink)', lineHeight: '1', display: 'inline-block',
    marginTop: 8, letterSpacing: '-.01em' }, ch === ' ' ? '\u00a0' : ch));
  const wsum = letters.reduce((x, e) => x + e.offsetWidth, 0);          // длинное слово — ужать, чтобы влезло в поле
  if (wsum > 860) { const fsz = Math.floor(98 * 860 / wsum); letters.forEach(e => { e.style.fontSize = fsz + 'px'; }); }
  row.dataset.check = WORD;
  // каретка в пустом поле (до слова)
  const caret = h('div', 'abs', g, { left: 70, top: 44, width: 7, height: 68, background: 'var(--ink)', borderRadius: 4 });
  const ph = h('div', 'abs in8 nw', g, { left: 96, top: 52, fontSize: 44, color: '#9A958C', lineHeight: '1' }, CT.placeholder || 'Комментарий…');
  // тег «ПИШИ В КОММЕНТАРИЯХ» над полем
  const tag = h('div', 'abs p3d', L, { left: 100, top: 1032, transform: 'rotate(-3deg) translateZ(30px)' });
  h('div', 'abs', tag, { left: 0, top: 0, right: 0, bottom: 0, background: 'var(--red)', transform: 'skewX(-10deg)', borderRadius: 10,
    boxShadow: boxShadowExtrude('#8E1318', 6, .8, 1, '0 14px 18px rgba(0,0,0,.4)') });
  const tl = h('div', 'nw', tag, { position: 'relative', padding: '9px 22px 12px' });
  const tws = CAP.split(/\s+/).filter(Boolean).map(w => { const m = h('span', 'mask', tl, { marginRight: '12px' }); return h('span', 'in9 nw', m, { fontSize: 46, color: '#fff', lineHeight: '1.08' }, w); });
  tl.dataset.check = CAP;
  if (!CAP) { tag.style.display = 'none'; caret.style.display = 'none'; ph.style.display = 'none'; }
  const ico = sv('svg', tag, { width: 54, height: 50, viewBox: '0 0 54 50', style: 'position:absolute;right:-70px;top:4px;overflow:visible' });
  sv('path', ico, { d: 'M8 6 H46 a4 4 0 0 1 4 4 V32 a4 4 0 0 1 -4 4 H24 L12 46 V36 H8 a4 4 0 0 1 -4 -4 V10 a4 4 0 0 1 4 -4 Z', fill: 'none',
    stroke: '#fff', 'stroke-width': 5, 'stroke-linejoin': 'round' });
  FAST.push([tF, tF + 14 * F], [tPill, tPill + 4 * F]);
  SFX.push({ type: 'pop', tb: tPill, gain_db: -17, name: 'cta_pill' });
  SFX.push({ type: 'hit', tb: tF + 4 * F, gain_db: -11, name: 'cta_hit' });
  ITEMS.push({ name: CT.id, wrap: L, update(tb) {
    if (tb < tPill) return false;
    const pp = E.spring(prog(tb, tPill, 0.36));
    const [kx, ky] = shake(tb, tF + 4 * F, 9);
    const punch = 1 + 0.06 * Math.sin(Math.PI * prog(tb, tF + 4 * F, 0.2));
    g.style.opacity = clamp((tb - tPill) / (2 * F), 0, 1);
    g.style.transform = `translate3d(${kx.toFixed(1)}px,${(ky + 2.5 * Math.sin(TAU * (tb - tPill) / 2.4)).toFixed(1)}px,0) rotateX(${(10 + 40 * (1 - pp)).toFixed(2)}deg) rotateY(${(-6 + 3 * Math.sin(TAU * (tb - tPill) / 3.5)).toFixed(2)}deg) rotateZ(-2deg) scale(${(punch * (0.75 + 0.25 * pp)).toFixed(4)})`;
    const yel = prog(tb, tF + 3 * F, 2 * F);
    pillY.style.opacity = yel; glow.style.opacity = yel; depth.style.background = yel > 0.5 ? '#B98A00' : '#B9B1A3';
    caret.style.opacity = tb < tF + 2 * F ? (Math.floor((tb - tPill) * 2.5) % 2 === 0 ? 1 : 0.15) : 0;
    ph.style.opacity = tb < tF ? 1 : 0;
    letters.forEach((e, k) => {
      const t0 = tF + k * F;
      const q = prog(tb, t0, 0.2), s = E.outBack(1.8)(q);
      e.style.opacity = tb >= t0 ? clamp((tb - t0) / (2 * F), 0, 1) : 0;
      e.style.transform = `translate3d(0,${(-30 * (1 - s)).toFixed(1)}px,${(340 * (1 - s)).toFixed(1)}px) rotateX(${(-50 * (1 - s)).toFixed(2)}deg)`;
    });
    shine(tb, 840, 1.6, -tF - 0.5);
    tag.style.opacity = clamp((tb - tTag) / (2 * F), 0, 1);
    tws.forEach((e, k) => { const q = E.outExpo(prog(tb, tTag + 2 * k * F, 0.3)); e.style.transform = `translateY(${(105 * (1 - q)).toFixed(1)}%)`; });
    return true;
  } });
  return { tStart: tTag };
}

// ---------------------------------------------------------------- 7. Субтитры: слова встают на ребре по таймингу речи
function mountCaptions(stage, P) {
  // карточки — из plan.json (группировка общая, параметры — style.json → captions); вид — этого стиля
  const L = h('div', 'layer', stage, {});
  const suppress = P.captions_suppress.map(([a, b]) => [a - FZ, b - FZ]);
  const isSup = t => suppress.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);
  const G = [];
  P.captions.forEach(c => {
    const gw = c.words.map(i => { const w = P.words[i]; return { start: w.s - FZ, end: w.e - FZ, d: w.raw.replace(/[«»".,!?;:]/g, ''), acc: w.acc }; });
    const t0 = c.s - FZ, t1 = c.e - FZ;
    const box = h('div', 'cap', L, { bottom: 1920 - 1492 });
    box.dataset.check = gw.map(x => x.d).join(' ');
    const W = gw.map(w => {
      const s = h('span', 'w', box);
      const mk = w.acc ? h('span', 'mk', s) : null;
      const t = h('span', 't', s, null, w.d);
      return { s, t, mk, w, acc: w.acc };
    });
    G.push({ box, W, t0, t1 });
  });
  ITEMS.push({ name: 'captions', wrap: L, update(tb) {
    let any = false;
    for (const g of G) {
      const vis = tb >= g.t0 && tb < g.t1 && !isSup(tb);
      show(g.box, vis);
      if (!vis) continue;
      any = true;
      g.box.style.opacity = 1 - prog(tb, g.t1 - 2 * F, 2 * F);
      for (const x of g.W) {
        const ta = x.w.start - F;
        const q = prog(tb, ta, 4 * F), s = E.outBack(1.6)(q);
        const active = tb >= x.w.start - F && tb < x.w.end + F;
        x.s.style.opacity = tb >= ta ? clamp((tb - ta) / (2 * F), 0, 1) : 0;
        const sc = active ? 1.08 : 1;
        x.s.style.transform = `rotateX(${(-85 * (1 - s)).toFixed(2)}deg) translateY(${(active ? -4 : 0)}px) scale(${sc})`;
        x.t.style.color = x.acc ? '#fff' : (active ? '#FFC928' : '#fff');
        if (x.mk) x.mk.style.transform = `skewX(-10deg) scaleX(${E.outCubic(prog(tb, ta + F, 5 * F)).toFixed(3)})`;
      }
    }
    return any;
  } });
  return G;
}

// ---------------------------------------------------------------- модуль стиля
let INIT = null;
function init(ctx) {
  if (INIT === ctx) return;
  INIT = ctx;
  const P = ctx.plan;
  FPS = P.fps; F = 1 / FPS; FZ = P.hold;
  const blocks = (P.template === 'B' ? P.spheres : P.blocks) || [];
  BLOCKS = blocks.map(b => ({ id: b.id, S: b.s - FZ, term: b.term.toUpperCase(), expl: b.expl.length ? b.expl : [''] }));
  const end = P.cta || P.answer;
  T_CTA = end ? end.s - FZ : P.duration - FZ;
}

// mount-функция этого стиля → компонент рантайма (ITEMS/FAST/SFX, накопленные при монтаже, привязываются к элементу)
function comp(ctx, mountFn, id) {
  return {
    fastAlways: true,
    mount(root) {
      init(ctx);
      const i0 = ITEMS.length, f0 = FAST.length, s0 = SFX.length;
      mountFn(root);
      for (const e of SFX.slice(s0)) ctx.sfx(e.tb + FZ, e.type, id || e.name, { gain_db: e.gain_db, dur: e.dur, name: e.name });
      return { items: ITEMS.slice(i0), fast: FAST.slice(f0) };
    },
    update(st, t) {
      const tb = t - FZ;
      let any = false;
      for (const it of st.items) { const v = !!it.update(tb); show(it.wrap, v); any = any || v; }
      return any;
    },
    fast(st, t) { const tb = t - FZ; return st.fast.some(([x, y]) => tb >= x - 1e-6 && tb <= y + 1e-6); },
    boxes(st) {
      const out = [];
      for (const it of st.items) {
        if (it.wrap.style.display === 'none') continue;
        for (const e of it.wrap.querySelectorAll('[data-check]')) out.push({ el: e, text: e.dataset.check });
      }
      return out;
    },
  };
}

// строки петли: «А — Б» → две строки (первая жёлтая); иначе одна строка, последнее слово жёлтое
function loopLines(l) {
  const Y = '#FFC928', Wt = '#fff';
  const txt = l.text.toUpperCase();
  if (l.lines && l.lines.length) return l.lines.map((ln, i) => ln.toUpperCase().split(/\s+/).map(w => [w, i === 0 ? Y : Wt]));
  const m = txt.split(/\s+[—–-]\s+/);
  if (m.length === 2) return [[...m[0].split(/\s+/).map(w => [w, Y]), ['—', Y]], m[1].split(/\s+/).map(w => [w, Wt])];
  const ws = txt.split(/\s+/);
  return [ws.map((w, i) => [w, i === ws.length - 1 ? Y : Wt])];
}

function hookEl(hk, ctx) {
  const P = ctx.plan;
  return comp(ctx, root => mountHook(root, Object.assign({}, hk, { tip: P.tip && hk.pointer !== false ? P.tip : null })), hk.id);
}
function ctaEl(c, ctx) { return comp(ctx, root => mountCTA(root, c), c.id); }
function blockEl(b, ctx) { return comp(ctx, root => mountTerm(root, BLOCKS[b.index], b.index), b.id); }

export default {
  name: 'kinetic',
  css: ['kinetic.css'],
  fonts: ['900 60px Inter', '800 40px Inter', '900 60px Unbounded'],
  elements: {
    hook: hookEl,
    question: hookEl,
    lead(L, ctx) { return comp(ctx, root => mountLead(root, L), L.id); },
    counter(spec, ctx) { return comp(ctx, root => { if (BLOCKS.length) mountCounter(root); }, spec.id); },
    block: blockEl,
    sphere: blockEl,
    loop(l, ctx) { return comp(ctx, root => mountTeaser(root, l.id, loopLines(l), l.s - FZ, l.e - FZ), l.id); },
    list(L, ctx) {
      return comp(ctx, root => mountChips(root, L.id, L.items.map(it => [it.text.toUpperCase(), { start: it.t - FZ }]), L.e - FZ - 0.25), L.id);
    },
    cta: ctaEl,
    answer: ctaEl,
    captions(spec, ctx) { return comp(ctx, root => mountCaptions(root, ctx.plan)); },
  },
};
