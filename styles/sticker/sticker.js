// Стиль «sticker» — стикер и маркер: белая вырубка, жёсткая тень, маркерная подложка, пружины.
// Кадр = чистая функция времени t (шкала выхода, стоп-кадр уже внутри). Без таймеров, Math.random и CSS-анимаций.
// Вход — plan.json (engine/rm/plan.py), одинаковый для всех стилей.

const NS = 'http://www.w3.org/2000/svg';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, t0, d) => clamp((t - t0) / d);
const lerp = (a, b, p) => a + (b - a) * p;
const outCubic = p => 1 - Math.pow(1 - p, 3);
const inCubic = p => p * p * p;
const inOutCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p, s = 1.9) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);

// затухающая пружина 0→1: перелёт ≈16 %, первый пик ≈6 кадров, покой к 11–12 кадру (ζ=0.5)
function spring(tau, zeta = 0.5, wd = 15.7) {
  if (tau <= 0) return 0;
  if (tau >= 0.75) return 1;
  const w = wd / Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + (zeta * w / wd) * Math.sin(wd * tau));
}
// поп слова субтитров: 0.7 → 1.12 → 1 за 5 кадров
function popScale(fr) {
  if (fr < 0) return 0;
  if (fr >= 5) return 1;
  if (fr <= 3) return lerp(0.7, 1.12, 1 - Math.pow(1 - fr / 3, 2));
  return lerp(1.12, 1, inOutCubic((fr - 3) / 2));
}

function el(tag, cls, parent, style, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function sv(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const px = v => v.toFixed(2) + 'px';
const show = (e, v) => { e.style.display = v ? '' : 'none'; };

// блик: полоса пробегает стикер раз в period с (фаза своя у каждого)
function addShine(parent) { const s = el('div', 'shine', parent); return el('i', null, s); }
function setShine(i, t, phase, period = 1.8, w = 1) {
  const c = ((t + phase) % period + period) % period;
  const p = c / 0.5;
  i.style.opacity = p < 1 ? '1' : '0';
  i.style.transform = `translateX(${lerp(-120, 330, outCubic(clamp(p)))}%) skewX(-12deg)`;
}
// покой: float 2–4 px и микроповорот
const floatY = (t, ph, a = 3) => a * Math.sin(2 * Math.PI * (t / 2.3 + ph));
const floatR = (t, ph, a = 0.35) => a * Math.sin(2 * Math.PI * (t / 3.1 + ph + 0.25));

// маркер: SVG-штрих с неровным краем (feTurbulence), прорисовка stroke-dashoffset
function makeMarker(parent, x, y, w, h, opts = {}) {
  const pad = 30;
  const s = sv('svg', { class: 'marker', width: w + pad * 2, height: h + pad * 2 }, parent);
  Object.assign(s.style, { left: px(x - pad), top: px(y - pad) });
  const col = opts.color || '#FFC928';
  const y0 = pad + h / 2;
  const d = `M ${pad + 2} ${y0 + h * 0.10} C ${pad + w * 0.3} ${y0 - h * 0.02}, ${pad + w * 0.62} ${y0 + h * 0.06}, ${pad + w - 2} ${y0 - h * 0.08}`;
  const a = sv('path', { d, fill: 'none', stroke: col, 'stroke-width': h, 'stroke-linecap': 'butt', filter: 'url(#rough)', opacity: '0.96' }, s);
  const d2 = `M ${pad + 6} ${y0 - h * 0.22} C ${pad + w * 0.4} ${y0 - h * 0.30}, ${pad + w * 0.7} ${y0 - h * 0.18}, ${pad + w - 4} ${y0 - h * 0.30}`;
  const b = sv('path', { d: d2, fill: 'none', stroke: col, 'stroke-width': h * 0.5, 'stroke-linecap': 'round', filter: 'url(#rough2)', opacity: '0.85' }, s);
  const L1 = a.getTotalLength() + 4, L2 = b.getTotalLength() + h;
  a.setAttribute('stroke-dasharray', L1); b.setAttribute('stroke-dasharray', L2);
  return { s, set(p) {
    a.setAttribute('stroke-dashoffset', (L1 * (1 - outCubic(clamp(p * 1.15)))).toFixed(2));
    b.setAttribute('stroke-dashoffset', (L2 * (1 - outCubic(clamp(p * 1.15 - 0.15)))).toFixed(2));
    s.style.display = p <= 0 ? 'none' : '';
  } };
}
// росчерк-подчёркивание (оранжевый, тонкий)
function makeScribble(parent, x, y, w, col = '#FF4A1C') {
  const s = sv('svg', { class: 'marker', width: w + 40, height: 60 }, parent);
  Object.assign(s.style, { left: px(x - 20), top: px(y - 30) });
  const d = `M 22 34 C ${w * 0.25} 24, ${w * 0.5} 40, ${w * 0.78} 28 S ${w + 10} 26, ${w + 18} 22`;
  const p = sv('path', { d, fill: 'none', stroke: col, 'stroke-width': 9, 'stroke-linecap': 'round' }, s);
  const L = p.getTotalLength() + 2; p.setAttribute('stroke-dasharray', L);
  return { s, set(q) { p.setAttribute('stroke-dashoffset', (L * (1 - outCubic(clamp(q)))).toFixed(2)); s.style.display = q <= 0 ? 'none' : ''; } };
}
// галочка от руки: прорисовка с небольшим вылетом за рамку
function makeCheck(parent, size) {
  const s = sv('svg', { class: 'marker', width: size + 40, height: size + 40 }, parent);
  Object.assign(s.style, { left: px(-14), top: px(-30) });
  const k = size / 58;
  const d = `M ${14 + 10 * k} ${30 + 30 * k} L ${14 + 24 * k} ${30 + 45 * k} L ${14 + 60 * k} ${30 - 2 * k}`;
  const p = sv('path', { d, fill: 'none', stroke: '#17161A', 'stroke-width': 11 * k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
  const L = p.getTotalLength() + 2; p.setAttribute('stroke-dasharray', L);
  return { s, set(q) { p.setAttribute('stroke-dashoffset', (L * (1 - inOutCubic(clamp(q)))).toFixed(2)); s.style.display = q <= 0 ? 'none' : ''; } };
}
// фигурная вырубка (тело + стрелка/хвост) в SVG: белая заливка + жёсткая тень
function shapeSVG(parent, w, h, r, extra, fill = '#fff') {
  const pad = 40;
  const s = sv('svg', { class: 'marker', width: w + pad * 2 + 30, height: h + pad * 2 + 30 }, parent);
  Object.assign(s.style, { left: px(-pad), top: px(-pad) });
  const g = sv('g', { transform: `translate(${pad},${pad})` }, s);
  let d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} `;
  if (extra && extra.side === 'right') {
    d += `V ${extra.y - extra.half} L ${w + extra.len} ${extra.y} L ${w} ${extra.y + extra.half} `;
  }
  d += `V ${h - r} Q ${w} ${h} ${w - r} ${h} `;
  if (extra && extra.side === 'bottom') {
    d += `H ${extra.x + extra.half} L ${extra.x - extra.half * 0.6} ${h + extra.len} L ${extra.x - extra.half} ${h} `;
  }
  d += `H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  sv('path', { d, fill: 'rgba(8,8,10,.55)', transform: 'translate(10,12)' }, g);
  sv('path', { d, fill, stroke: fill === '#fff' ? 'none' : '#fff', 'stroke-width': 14, 'paint-order': 'stroke' }, g);
  return { s, d };
}

// -------------------------------------------------------------------- компоненты
const C = {};
let P;   // план
let CHECK = null;

// ХУК: белый стикер со стрелкой-указателем к пальцу; число — жёлтый круглый стикер; чёрный тег с пояснением.
// Без пальца (нет стоп-кадра) — тот же стикер без стрелки, сверху по центру. Вопрос шаблона Б — тот же компонент.
function makeHook(h) {
  return {
  mount(root) {
    const st = { h };
    const L = el('div', 'L', root, { zIndex: 30 });
    const g = el('div', 'abs', L);
    const body = el('div', 'abs', g);
    const content = el('div', 'abs', g, { left: '34px', top: '24px' });
    const fs = 86;
    const rows = [];
    const rA = h.kicker ? el('div', 'nw', content, { fontSize: fs * 0.86 + 'px', lineHeight: '1.02', letterSpacing: '-0.01em', position: 'relative' }, h.kicker) : null;
    const lines = h.lines.length ? h.lines : [''];
    for (const ln of lines.slice(0, -1)) rows.push(el('div', 'nw', content, { fontSize: fs + 'px', lineHeight: '1.0', letterSpacing: '-0.015em', position: 'relative' }, ln));
    const rCw = el('div', 'nw', content, { fontSize: fs + 'px', lineHeight: '1.0', letterSpacing: '-0.015em', position: 'relative' });
    // автоподгонка: при пальце тело ≤ 452 px шириной (левый край ≥ 60 при кончике 545); без пальца — до 700
    let k = 1;
    const maxW = h.tip ? 352 : 640;
    const wB = rows.length ? Math.max(...rows.map(r => r.getBoundingClientRect().width)) : 0;
    if (wB > maxW) k = maxW / wB;
    for (const r of [rA, ...rows, rCw]) if (r) r.style.fontSize = (parseFloat(r.style.fontSize) * k).toFixed(1) + 'px';
    const mk = el('div', 'abs', rCw, { left: 0, top: 0, width: '100%', height: '100%' });
    const rC = el('span', null, rCw, { position: 'relative' }, lines[lines.length - 1]);
    const wC = rC.getBoundingClientRect().width;
    if (wC > maxW * 1.08) {                      // последняя строка шире остальных — ужать всё
      const k2 = maxW * 1.08 / wC;
      for (const r of [rA, ...rows, rCw]) if (r) r.style.fontSize = (parseFloat(r.style.fontSize) * k2).toFixed(1) + 'px';
    }
    const cw = Math.max(wB ? Math.max(...rows.map(r => r.getBoundingClientRect().width)) : 0, rC.getBoundingClientRect().width,
      rA ? rA.getBoundingClientRect().width : 0);
    const chh = content.getBoundingClientRect().height;
    const W = Math.round(cw + 68), H = Math.round(chh + 50);
    const tipLen = h.tip ? 40 : 0, tipY = Math.round(H * 0.56);
    shapeSVG(body, W, H, 26, h.tip ? { side: 'right', y: tipY, half: 36, len: tipLen } : null);
    const fsC = parseFloat(rCw.style.fontSize);
    st.mark = makeMarker(mk, -8, fsC * 0.30, rC.getBoundingClientRect().width + 16, fsC * 0.62);
    mk.style.zIndex = 0; rC.style.zIndex = 1;
    // число («3», «?») — круглый жёлтый стикер справа от верхней строки
    const wA = rA ? rA.getBoundingClientRect().width : 0;
    const D = 150;
    const three = el('div', 'st st-yellow abs', g, { width: D + 'px', height: D + 'px', borderRadius: '50%',
      left: px(rA ? 34 + wA + 14 : W - 70), top: px(rA ? -22 : -80), display: h.number ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' });
    el('div', 'unb', three, { fontSize: '104px', lineHeight: '1', marginTop: '6px' }, h.number || '');
    st.threeShine = addShine(three);
    // чёрный тег-пояснение: последняя строка — с росчерком
    const tag = el('div', 'st st-ink abs xb', g, { left: '22px', top: px(H - 18), padding: '16px 26px 18px', borderRadius: '18px',
      fontSize: '39px', lineHeight: '1.14', transformOrigin: '20% 0%', display: h.sub.length ? '' : 'none' });
    for (const ln of h.sub.slice(0, -1)) el('div', 'nw', tag, null, ln);
    const l2 = el('div', 'nw', tag, { position: 'relative' });
    const l2t = el('span', null, l2, null, h.sub.length ? h.sub[h.sub.length - 1] : '');
    const tw = l2t.getBoundingClientRect().width;
    st.scr = makeScribble(l2, 0, 52, tw);
    st.tagShine = addShine(tag);
    st.plateShine = addShine(body);
    if (h.tip) {
      // позиция: кончик стрелки — в точку tip, поворот вокруг кончика
      const ox = W + tipLen, oy = tipY;
      Object.assign(g.style, { left: px(h.tip[0] - ox), top: px(h.tip[1] - oy), transformOrigin: `${ox}px ${oy}px` });
    } else {
      Object.assign(g.style, { left: px(Math.max(70, 500 - W / 2)), top: px(230), transformOrigin: `${W / 2}px ${H / 2}px` });
    }
    body.style.width = W + 'px'; body.style.height = H + 'px';
    Object.assign(st, { L, g, body, three, tag, W, H, content });
    st.text = [h.kicker, h.number, ...h.lines].filter(Boolean).join(' ');
    return st;
  },
  update(st, t) {
    const h = st.h;
    if (t < h.s || t >= h.e) return false;
    const live = t >= h.live;
    const ex = prog(t, h.e - 5 / P.fps, 5 / P.fps);
    const ei = inCubic(ex);
    const fy = live ? floatY(t - h.live, 0.1, 2.5) : 0;
    const fr = live ? floatR(t - h.live, 0.2) : 0;
    st.g.style.transform = `translate(${-ei * 30}px, ${fy + ei * 46}px) rotate(${-3 + fr - ei * 5}deg) scale(${1 - 0.14 * ei})`;
    st.g.style.opacity = (1 - ei).toFixed(3);
    // число подпрыгивает на своём слове
    const tb = t - h.three_bump;
    const bump = tb > 0 && tb < 0.6 ? Math.sin(Math.PI * clamp(tb / 0.12)) * 0.18 * Math.exp(-tb * 4) + (spring(tb, 0.35) - 1) * 0 : 0;
    const wob = tb > 0 && tb < 0.8 ? 9 * Math.exp(-tb * 6) * Math.sin(tb * 34) : 0;
    st.three.style.transform = `rotate(${8 + wob}deg) scale(${1 + bump})`;
    st.mark.set(1);
    st.scr.set(prog(t, h.scribble, 8 / P.fps));
    setShine(st.plateShine, live ? t - h.live : -1, 0.9, 1.9);
    setShine(st.threeShine, live ? t - h.live : -1, 0.2, 1.9);
    setShine(st.tagShine, live ? t - h.live : -1, 1.4, 1.9);
    return true;
  },
  fast(st, t) { return t >= st.h.e - 6 / P.fps && t < st.h.e; },
  boxes(st) {
    const out = [{ el: st.body, text: st.text }];
    if (st.h.number) out.push({ el: st.three, text: st.h.number });
    if (st.h.sub.length) out.push({ el: st.tag, text: st.h.sub.join(' ') });
    return out;
  },
  };
}

// ЧЕК-ЛИСТ трёх причин: лид — строки по словам; начало блока — галочка прорисовывается
C.check = {
  mount(root) {
    const c = CHECK, st = { c, rows: [] };
    const L = el('div', 'L', root, { zIndex: 31 });
    const card = el('div', 'abs', L, { padding: '46px 40px 30px 34px' });
    const bg = el('div', 'st st-white', card, { left: 0, top: 0, borderRadius: '28px' });
    st.bg = bg;
    const kick = el('div', 'st st-yellow abs nw', card, { left: '-14px', top: '-30px', padding: '8px 20px 9px', borderRadius: '14px',
      fontSize: '34px', lineHeight: '1', transform: 'rotate(-4deg)', display: c.title ? '' : 'none' }, c.title);
    st.kick = kick;
    for (const r of c.rows) {
      const row = el('div', null, card, { display: 'flex', alignItems: 'center', gap: '22px', margin: '0 0 14px', position: 'relative' });
      const box = el('div', null, row, { width: '58px', height: '58px', borderRadius: '14px', border: '6px solid #17161A',
        flex: '0 0 58px', position: 'relative', background: '#fff' });
      const chk = makeCheck(box, 58);
      const col = el('div', null, row, { position: 'relative' });
      const q = el('div', 'xb nw', col, { fontSize: '30px', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: '1.05',
        color: r.dir === 'up' ? '#E23A12' : '#E23A12', transformOrigin: '0 100%', display: 'inline-block' },
        (r.dir === 'up' ? '↑ ' : '↓ ') + r.qual);
      const tw = el('div', 'nw', col, { fontSize: '68px', lineHeight: '1.02', letterSpacing: '-0.015em', position: 'relative' });
      const mk = el('div', 'abs', tw, { left: 0, top: 0, width: '100%', height: '100%' });
      const txt = el('span', null, tw, { position: 'relative' });
      const letters = [...r.term].map(ch => el('span', 'letter', txt, null, ch));
      st.rows.push({ r, row, box, chk, q, tw, mk, txt, letters });
    }
    st.rows[st.rows.length - 1].row.style.marginBottom = '0';
    for (const R of st.rows) {
      const w = R.txt.getBoundingClientRect().width;
      R.mark = makeMarker(R.mk, -6, 68 * 0.34, w + 12, 68 * 0.56);
    }
    const rc = card.getBoundingClientRect();
    const W = rc.width, H = rc.height;
    // фон растёт вместе со строками: базовая высота (до первой строки) + шаг каждой строки
    st.rowBottoms = st.rows.map(R => R.row.offsetTop + R.row.offsetHeight);
    st.wq = st.rows.map(R => R.q.getBoundingClientRect().width);
    st.wt = st.rows.map(R => R.txt.getBoundingClientRect().width);
    st.H0 = 60;
    Object.assign(card.style, { left: px(500 - W / 2), top: px(1296 - H), transformOrigin: '30% 60%' });
    st.shine = addShine(bg);
    Object.assign(st, { L, card, W, H });
    return st;
  },
  showAt(st, t) { return st.c.shows.findIndex(s => t >= s.s && t < s.e); },
  update(st, t) {
    const k = this.showAt(st, t);
    if (k < 0) return false;
    const S = st.c.shows[k], fps = P.fps;
    const tau = t - S.s;
    const sp = spring(tau);
    const ex = inCubic(prog(t, S.e - 5 / fps, 5 / fps));
    const sc = lerp(0.72, 1, sp) * (1 - 0.1 * ex);
    const rot = lerp(-11, -2, sp) + floatR(t, 0.3) - ex * 4;
    const dy = lerp(70, 0, sp) + floatY(t, 0.6) - ex * 40;
    st.card.style.transform = `translate(${-ex * 60}px, ${dy}px) rotate(${rot}deg) scale(${sc})`;
    st.card.style.opacity = (clamp(tau / (2 / fps)) * (1 - ex)).toFixed(3);
    setShine(st.shine, t, 0.5, 2.0);
    let bh = st.H0, prev = st.H0;
    st.rows.forEach((R, i) => {
      const target = st.rowBottoms[i] + 30;
      const p = k === 0 ? spring(t - R.r.q_t + 0.04, 0.6) : 1;
      bh += (target - prev) * p; prev = target;
    });
    st.bg.style.height = px(bh);
    // ширина тоже растёт: квалификатор → термин (в лиде), иначе полная
    let bw = 0;
    st.rows.forEach((R, i) => {
      const a = k === 0 ? spring(t - R.r.q_t + 0.04, 0.6) : 1, b = k === 0 ? spring(t - R.r.t_t + 0.02, 0.6) : 1;
      bw = Math.max(bw, a * (80 + st.wq[i]) + b * Math.max(0, st.wt[i] - st.wq[i]));
    });
    st.bg.style.width = px(Math.max(300, 34 + 40 + bw + 6));
    st.rows.forEach((R, i) => {
      const r = R.r;
      // строка: в лиде — по словам; в повторных показах — сразу
      const qt = k === 0 ? r.q_t : -1, tt = k === 0 ? r.t_t : -1;
      const qs = spring(t - qt, 0.45);
      R.q.style.transform = `scale(${lerp(0.5, 1, qs)})`;
      R.q.style.opacity = clamp((t - qt) * fps / 2).toFixed(3);
      R.box.style.transform = `scale(${lerp(0.4, 1, qs)}) rotate(${lerp(-25, 0, qs)}deg)`;
      R.box.style.opacity = clamp((t - qt) * fps / 2).toFixed(3);
      R.letters.forEach((Lt, j) => {
        const lt = t - (tt + j * 0.016);
        const p = prog(lt, 0, 5 / fps);
        Lt.style.opacity = clamp(lt * fps / 1.5).toFixed(3);
        Lt.style.transform = `translateY(${(1 - outBack(p, 2.2)) * 34}px)`;
      });
      R.mark.set(k === 0 ? prog(t, r.t_t + 0.12, 7 / fps) : 1);
      // галочки: прошлые блоки — стоят, текущий — прорисовка
      let cp = 0;
      if (i < S.check) cp = 1;
      if (i === S.check) cp = prog(t, S.check_t, 7 / fps);
      R.chk.set(cp);
      const filled = i < S.check || (i === S.check && t >= S.check_t);
      const fp = i === S.check ? spring(t - S.check_t, 0.4) : 1;
      R.box.style.background = filled ? '#FFC928' : '#fff';
      if (i === S.check && t >= S.check_t) R.box.style.transform = `scale(${lerp(0.7, 1, fp)})`;
      // фокус на текущей строке после галочки
      const dim = (t >= S.check_t && i !== S.check) ? 0.42 : 1;
      R.row.style.opacity = dim;
    });
    return true;
  },
  fast(st, t) {
    return st.c.shows.some(S => (t >= S.s && t < S.s + 0.3) || (t >= S.e - 6 / P.fps && t < S.e));
  },
  boxes(st) { return [{ el: st.bg, text: st.c.rows.map(r => r.qual + ' ' + r.term).join(' ') }].concat(st.c.title ? [{ el: st.kick, text: st.c.title }] : []); },
};

// ЗАГОЛОВОК ЭТАПА: номер (жёлтый круг Unbounded) + термин (белый стикер, маркер) + пояснение (чёрный тег) → «док» в угол
function makeHeader(spec) {
  return {
    mount(root) {
      const st = { h: spec };
      const L = el('div', 'L', root, { zIndex: 32 });
      const g = el('div', 'abs', L, { left: 0, top: 0, transformOrigin: '0 0' });
      const term = el('div', 'st st-white abs nw', g, { left: 0, top: 0, padding: '22px 34px 24px 70px', borderRadius: '24px' });
      const tw = el('div', null, term, { position: 'relative', fontSize: '104px', lineHeight: '1', letterSpacing: '-0.02em' });
      const mk = el('div', 'abs', tw, { left: 0, top: 0, width: '100%', height: '100%' });
      const txt = el('span', null, tw, { position: 'relative' }, spec.term);
      let fs = 104;
      const w0 = txt.getBoundingClientRect().width;
      if (w0 > 640) { fs = Math.floor(104 * 640 / w0); tw.style.fontSize = fs + 'px'; }
      const ww = txt.getBoundingClientRect().width;
      st.mark = makeMarker(mk, -10, fs * 0.33, ww + 20, fs * 0.6);
      st.termShine = addShine(term);
      const num = el('div', 'st st-yellow abs', g, { width: '136px', height: '136px', borderRadius: '50%', left: '-62px', top: '-64px',
        display: 'flex', alignItems: 'center', justifyContent: 'center' });
      el('div', 'unb', num, { fontSize: '86px', lineHeight: '1', marginTop: '4px' }, spec.num);
      const tr = term.getBoundingClientRect();
      const expl = el('div', 'st st-ink abs xb nw', g, { left: '46px', top: px(tr.height - 12), padding: '14px 24px 17px', borderRadius: '16px',
        fontSize: '42px', lineHeight: '1.05', transformOrigin: '0 0' });
      el('span', null, expl, { color: '#FFC928' }, '= ');
      el('span', null, expl, null, spec.expl);
      const er = expl.getBoundingClientRect();
      const GW = Math.max(tr.width, 46 + er.width), GH = tr.height - 12 + er.height;
      // большой план: группа по центру x≈520, низ ≈ 1262
      st.big = { x: Math.max(130, 520 - GW / 2 + 30), y: 1262 - GH };
      st.dockS = 0.5;
      st.dock = { x: 112, y: 256 };
      Object.assign(st, { L, g, term, num, expl, tr, GW, GH });
      return st;
    },
    update(st, t) {
      const h = st.h, fps = P.fps;
      if (t < h.s || t >= h.e) return false;
      const tau = t - h.s;
      const sp = spring(tau);
      const dk = spring(t - h.dock, 0.55, 14);      // док: пружина помягче
      const ex = inCubic(prog(t, h.e - 4 / fps, 4 / fps));
      const s = lerp(1, st.dockS, dk) * lerp(0.62, 1, sp) * (1 - 0.15 * ex);
      const fa = lerp(3, 1.2, dk);
      const x = lerp(st.big.x, st.dock.x, dk);
      const y = lerp(st.big.y, st.dock.y, dk) + lerp(60, 0, sp) + floatY(t, 0.15 + spec.num * 0.21, fa);
      const rot = lerp(-14, -3, sp) + floatR(t, 0.4) + lerp(0, 1, dk);
      st.g.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`;
      st.g.style.opacity = (clamp(tau * fps / 2) * (1 - ex)).toFixed(3);
      const ns = spring(tau - 2 / fps, 0.4);
      st.num.style.transform = `rotate(${lerp(-70, -8, ns)}deg) scale(${lerp(0.3, 1, ns)})`;
      st.num.style.opacity = clamp((tau - 2 / fps) * fps / 2).toFixed(3);
      const es = spring(tau - 5 / fps, 0.5);
      const eo = 1 - outCubic(prog(t, h.dock - 0.02, 4 / fps));
      st.expl.style.transform = `translateY(${lerp(30, 0, es)}px) rotate(${2.5 + lerp(6, 0, es)}deg)`;
      st.expl.style.clipPath = `inset(-20px ${lerp(100, -5, outCubic(prog(tau, 5 / fps, 7 / fps)))}% -20px -20px)`;
      st.expl.style.opacity = (clamp((tau - 5 / fps) * fps / 2) * eo).toFixed(3);
      show(st.expl, eo > 0.001);
      st.mark.set(prog(tau, 0.22, 7 / fps));
      setShine(st.termShine, t, spec.num * 0.37, 1.8);
      return true;
    },
    fast(st, t) {
      const h = st.h;
      return (t >= h.s && t < h.s + 0.32) || (t >= h.dock && t < h.dock + 0.36) || (t >= h.e - 5 / P.fps && t < h.e);
    },
    boxes(st) { return [{ el: st.term, text: st.h.term }, { el: st.num, text: st.h.num }, { el: st.expl, text: st.h.expl }]; },
  };
}

// ПЕТЛЯ: жёлтый стикер «ДАЛЬШЕ →» с покачиванием + белый тег-подсказка
function makeLoop(spec) {
  return {
    mount(root) {
      const st = { h: spec };
      const L = el('div', 'L', root, { zIndex: 35 });
      const g = el('div', 'abs', L, { transformOrigin: '50% 50%' });
      const main = el('div', 'st st-yellow nw', g, { position: 'relative', padding: '18px 30px 20px 34px', borderRadius: '22px',
        fontSize: '74px', lineHeight: '1', display: 'flex', alignItems: 'center', gap: '18px', letterSpacing: '-0.01em' });
      el('span', null, main, null, spec.main);
      const ar = sv('svg', { width: 70, height: 56, style: 'overflow:visible' }, main);
      sv('path', { d: 'M 4 28 H 56 M 34 6 L 58 28 L 34 50', fill: 'none', stroke: '#17161A', 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ar);
      st.ar = ar;
      st.shine = addShine(main);
      const sub = el('div', 'st st-white nw', g, { position: 'absolute', right: '-18px', top: '100%', marginTop: '6px', padding: '10px 20px 12px',
        borderRadius: '14px', fontSize: '38px', lineHeight: '1', transform: 'rotate(3deg)', transformOrigin: '100% 0' }, spec.sub.toUpperCase());
      const r = g.getBoundingClientRect();
      // правая часть груди: правый край ≤ 920
      Object.assign(g.style, { left: px(Math.min(920 - r.width, 560 - r.width / 2 + 90)), top: px(1050) });
      Object.assign(st, { L, g, main, sub });
      return st;
    },
    update(st, t) {
      const h = st.h, fps = P.fps;
      if (t < h.s || t >= h.e) return false;
      const tau = t - h.s, sp = spring(tau, 0.42);
      const ex = inCubic(prog(t, h.e - 5 / fps, 5 / fps));
      const wob = 3.2 * Math.sin(2 * Math.PI * 2.0 * tau) * clamp((tau - 0.25) / 0.2);
      st.g.style.transform = `translate(${ex * 50}px, ${lerp(50, 0, sp)}px) rotate(${lerp(22, 4, sp) + wob}deg) scale(${lerp(0.55, 1, sp) * (1 - 0.15 * ex)})`;
      st.g.style.opacity = (clamp(tau * fps / 2) * (1 - ex)).toFixed(3);
      const c = (tau % 0.6) / 0.6;
      st.ar.style.transform = `translateX(${12 * Math.sin(Math.PI * clamp(c / 0.5)) * (tau > 0.3 ? 1 : 0)}px)`;
      const ss = spring(tau - 4 / fps, 0.45);
      st.sub.style.transform = `rotate(${lerp(-10, 3, ss)}deg) scale(${lerp(0.5, 1, ss)})`;
      st.sub.style.opacity = clamp((tau - 4 / fps) * fps / 2).toFixed(3);
      setShine(st.shine, t, 0.7, 1.5);
      return true;
    },
    fast(st, t) { const h = st.h; return (t >= h.s && t < h.s + 0.3) || (t >= h.e - 6 / P.fps && t < h.e); },
    boxes(st) { return [{ el: st.main, text: st.h.main }, { el: st.sub, text: st.h.sub }]; },
  };
}

// СТОПКА стикеров (список пунктов) — каждый пружинит на своём слове; раскладка «вразброс» по шаблону
const STACK_POS = [['white', -5, -150, -70], ['yellow', 4, 110, 10], ['ink', -2, -60, 95], ['or', 3, 140, 170], ['white', -3, -120, 245]];
function makeStack(L0) {
  const S = { s: L0.s, e: L0.e, items: L0.items.map((it, i) => {
    const [style, rot, dx, dy] = STACK_POS[i % STACK_POS.length];
    return { text: it.text, t: it.t, style, rot, dx, dy };
  }) };
  return {
  mount(root) {
    const st = { S, items: [] };
    const L = el('div', 'L', root, { zIndex: 30 });
    for (const it of S.items) {
      const e = el('div', 'st st-' + it.style + ' abs nw', L, { padding: '16px 30px 18px', borderRadius: '20px', fontSize: '66px', lineHeight: '1',
        letterSpacing: '-0.01em' }, it.text);
      const r = e.getBoundingClientRect();
      Object.assign(e.style, { left: px(540 + it.dx - r.width / 2), top: px(1112 + it.dy - r.height / 2) });
      const sh = addShine(e);
      st.items.push({ it, e, sh });
    }
    st.L = L;
    return st;
  },
  update(st, t) {
    const S = st.S, fps = P.fps;
    if (t < S.s || t >= S.e) return false;
    st.items.forEach((o, i) => {
      const tau = t - o.it.t, sp = spring(tau, 0.42);
      const ex = inCubic(prog(t, S.e - 5 / fps - (S.items.length - 1 - i) * 2 / fps, 5 / fps));
      show(o.e, tau >= 0);
      o.e.style.transform = `translateY(${lerp(-80, 0, sp) + floatY(t, i * 0.3, 2.5) + ex * 30}px) rotate(${lerp(o.it.rot + (i % 2 ? 20 : -20), o.it.rot, sp)}deg) scale(${lerp(1.5, 1, sp) * (1 - 0.15 * ex)})`;
      o.e.style.opacity = (clamp(tau * fps / 2) * (1 - ex)).toFixed(3);
      setShine(o.sh, t, i * 0.6, 1.7);
    });
    return true;
  },
  fast(st, t) { return st.S.items.some(o => t >= o.t && t < o.t + 0.3) || (t >= st.S.e - 10 / P.fps && t < st.S.e); },
  boxes(st, t) { return st.items.filter(o => t >= o.it.t).map(o => ({ el: o.e, text: o.it.text })); },
  };
}

// ПРИЗЫВ: тег-подпись («пиши в комментариях») с линейной иконкой + стикер-пузырь с кодовым словом (удар синхронно со словом).
// Ответ шаблона Б — тот же пузырь, подпись необязательна.
function makeCta(c) {
  return {
  mount(root) {
    const st = { c };
    const L = el('div', 'L', root, { zIndex: 33 });
    const bub = el('div', 'abs', L);
    const content = el('div', 'abs nw', bub, { left: '44px', top: '26px', fontSize: '128px', lineHeight: '1', letterSpacing: '-0.02em' });
    const mk = el('div', 'abs', content, { left: 0, top: 0, width: '100%', height: '100%' });
    const txt = el('span', null, content, { position: 'relative' }, c.word.toUpperCase());
    let fs = 128;
    const w0 = txt.getBoundingClientRect().width;
    if (w0 > 720) { fs = Math.floor(128 * 720 / w0); content.style.fontSize = fs + 'px'; }
    const wr = txt.getBoundingClientRect();
    const W = Math.round(wr.width + 88), H = Math.round(fs * 1.0 + 56);
    const shp = shapeSVG(bub, W, H, 30, { side: 'bottom', x: 120, half: 34, len: 46 });
    bub.insertBefore(shp.s, content);
    st.mark = makeMarker(mk, -12, fs * 0.36, wr.width + 24, fs * 0.58);
    Object.assign(bub.style, { width: W + 'px', height: H + 'px', left: px(520 - W / 2), top: px(1268 - H), transformOrigin: '120px 110%' });
    st.shine = addShine(el('div', 'abs', bub, { left: 0, top: 0, width: W + 'px', height: H + 'px', borderRadius: '30px', overflow: 'hidden' }));
    const tag = el('div', 'st st-ink abs nw', L, { padding: '14px 26px 16px 20px', borderRadius: '18px', fontSize: '42px', lineHeight: '1',
      display: c.caption ? 'flex' : 'none', alignItems: 'center', gap: '14px' });
    const ic = sv('svg', { width: 48, height: 46 }, tag);
    sv('path', { d: 'M 8 6 H 40 Q 44 6 44 10 V 28 Q 44 32 40 32 H 22 L 12 41 V 32 H 8 Q 4 32 4 28 V 10 Q 4 6 8 6 Z', fill: 'none', stroke: '#FFC928',
      'stroke-width': 4.5, 'stroke-linejoin': 'round' }, ic);
    el('span', null, tag, null, c.caption.toUpperCase());
    const tr = tag.getBoundingClientRect();
    Object.assign(tag.style, { left: px(Math.min(930 - tr.width, 560 - tr.width / 2 + 40)), top: px(1268 - H - tr.height - 28), transformOrigin: '50% 100%' });
    Object.assign(st, { L, bub, tag, W, H });
    return st;
  },
  update(st, t) {
    const c = st.c, fps = P.fps;
    if (t < c.tag_t) return false;
    const ta = t - c.tag_t, ts = spring(ta, 0.45);
    st.tag.style.transform = `translateY(${lerp(40, 0, ts) + floatY(t, 0.8, 2)}px) rotate(${lerp(8, 2, ts)}deg) scale(${lerp(0.6, 1, ts)})`;
    st.tag.style.opacity = clamp(ta * fps / 2).toFixed(3);
    const tw = t - c.word_t;
    show(st.bub, tw >= 0);
    if (tw >= 0) {
      const sp = spring(tw, 0.38, 17);
      const jit = tw < 3 / fps ? [6, -5, 3][Math.floor(tw * fps)] : 0;    // удар: 3 кадра дрожи
      st.bub.style.transform = `translate(${jit}px, ${floatY(t, 0.3, 2.5) - jit * 0.6}px) rotate(${lerp(-12, -3, sp)}deg) scale(${lerp(1.45, 1, sp)})`;
      st.bub.style.opacity = clamp(tw * fps / 1.5).toFixed(3);
      st.mark.set(prog(tw, 4 / fps, 7 / fps));
      setShine(st.shine, tw - 0.5, 0, 1.6);
    }
    return true;
  },
  fast(st, t) { return (t >= st.c.tag_t && t < st.c.tag_t + 0.3) || (t >= st.c.word_t && t < st.c.word_t + 0.35); },
  boxes(st, t) {
    const out = st.c.caption ? [{ el: st.tag, text: st.c.caption.toUpperCase() }] : [];
    if (t >= st.c.word_t) out.push({ el: st.bub, text: st.c.word.toUpperCase() });
    return out;
  },
  };
}

// ЭМОЦИЯ (шаблон Б): 1–3 слова крупными стикерами, каждое пружинит на своём слове; акцентное — жёлтое
function makeEmotion(E) {
  return {
    mount(root) {
      const st = { E, items: [] };
      const L = el('div', 'L', root, { zIndex: 34 });
      const g = el('div', 'abs', L, { left: 0, top: 0 });
      let y = 0;
      E.words.forEach((w, i) => {
        const e = el('div', 'st abs nw unb ' + (i === E.accent ? 'st-yellow' : 'st-white'), g, { padding: '20px 34px 22px', borderRadius: '24px',
          fontSize: '96px', lineHeight: '1', letterSpacing: '-0.02em' }, w.toUpperCase());
        let r = e.getBoundingClientRect();
        if (r.width > 760) { e.style.fontSize = Math.floor(96 * 760 / r.width) + 'px'; r = e.getBoundingClientRect(); }
        Object.assign(e.style, { left: px(500 - r.width / 2 + (i % 2 ? 60 : -40)), top: px(y) });
        y += r.height + 26;
        st.items.push({ e, t: E.word_t[i], rot: i % 2 ? 4 : -4, sh: addShine(e) });
      });
      g.style.top = px(1290 - y);
      st.L = L;
      return st;
    },
    update(st, t) {
      const E = st.E, fps = P.fps;
      if (t < E.s || t >= E.e) return false;
      const ex = inCubic(prog(t, E.e - 4 / fps, 4 / fps));
      st.items.forEach((o, i) => {
        const tau = t - o.t, sp = spring(tau, 0.4);
        show(o.e, tau >= 0);
        o.e.style.transform = `translateY(${lerp(-70, 0, sp) + floatY(t, i * 0.3, 2.5) + ex * 30}px) rotate(${lerp(o.rot * 5, o.rot, sp)}deg) scale(${lerp(1.6, 1, sp) * (1 - 0.15 * ex)})`;
        o.e.style.opacity = (clamp(tau * fps / 2) * (1 - ex)).toFixed(3);
        setShine(o.sh, t, i * 0.5, 1.7);
      });
      return true;
    },
    fast(st, t) { return st.items.some(o => t >= o.t && t < o.t + 0.3) || (t >= st.E.e - 5 / P.fps && t < st.E.e); },
    boxes(st, t) { return st.items.filter(o => t >= o.t).map(o => ({ el: o.e, text: o.e.textContent })); },
  };
}

// СУБТИТРЫ: карточка до 3 слов, каждое слово — pop 0.7→1.12→1 за 5 кадров на своём старте, ключевое — маркер
C.caps = {
  mount(root) {
    const st = { cards: [] };
    const L = el('div', 'L', root, { zIndex: 40 });
    for (const k of P.captions) {
      const box = el('div', 'abs nw', L, { left: 0, width: '1080px', textAlign: 'center', fontSize: '84px', lineHeight: '1', letterSpacing: '-0.01em' });
      const line = el('div', null, box, { display: 'inline-block' });
      const ws = k.words.map(i => {
        const w = P.words[i];
        const sp = el('span', 'cap-word' + (w.acc ? ' acc' : ''), line);
        const mk = w.acc ? el('div', 'abs', sp, { left: 0, top: 0, width: '100%', height: '100%' }) : null;
        const tx = el('span', 'cap-txt', sp, null, w.w);
        return { w, sp, mk, tx };
      });
      let fs = 84;
      const lw = line.getBoundingClientRect().width;
      if (lw > 900) { fs = Math.floor(84 * 900 / lw); box.style.fontSize = fs + 'px'; }
      const lh = line.getBoundingClientRect().height;
      box.style.top = px(1488 - lh);
      for (const o of ws) if (o.mk) {
        const r = o.tx.getBoundingClientRect();
        o.mark = makeMarker(o.mk, -12, fs * 0.16, r.width + 24, fs * 0.80);
        o.sp.insertBefore(o.mk, o.tx);
      }
      st.cards.push({ k, box, ws });
      show(box, false);
    }
    st.L = L;
    return st;
  },
  update(st, t) {
    let any = false;
    for (const c of st.cards) {
      const on = t >= c.k.s && t < c.k.e;
      show(c.box, on);
      if (!on) continue;
      any = true;
      const fo = 1 - prog(t, c.k.e - 2 / P.fps, 2 / P.fps);
      c.box.style.opacity = fo.toFixed(3);
      for (const o of c.ws) {
        const fr = (t - (o.w.s - 0.02)) * P.fps;
        const s = popScale(fr);
        o.sp.style.visibility = fr < 0 ? 'hidden' : 'visible';
        o.sp.style.transform = `scale(${s}) rotate(${o.w.acc ? -2 : 0}deg)`;
        if (o.mark) o.mark.set(prog(fr, 1, 5));
      }
    }
    return any;
  },
  fast() { return false; },
  boxes(st, t) {
    const c = st.cards.find(c => t >= c.k.s && t < c.k.e);
    return c ? [{ el: c.box.firstChild, text: c.ws.map(o => o.w.w).join(' '), kind: 'caption' }] : [];
  },
};

// -------------------------------------------------------------------- модуль стиля
// Чек-лист лида: показ в лиде по словам + короткие показы в начале блоков с галочкой (зависит от блоков плана)
function checkShows(plan) {
  const blocks = plan.template === 'B' ? plan.spheres : plan.blocks;
  if (!plan.lead || !plan.lead.items.length) return null;
  const rows = plan.lead.items, shows = [], b0 = blocks[0];
  shows.push({ s: rows[0].q_t - 0.07, e: b0 ? b0.s + 0.62 : plan.lead.e, check: b0 ? 0 : -1, check_t: b0 ? b0.s + 0.06 : 1e9 });
  for (let k = 1; k < Math.min(rows.length, blocks.length); k++) shows.push({ s: blocks[k].s, e: blocks[k].s + 0.92, check: k, check_t: blocks[k].s + 0.20 });
  return { title: plan.lead.title, rows, shows };
}

function hookEl(h, ctx) {
  P = ctx.plan;
  const tip = P.tip && h.pointer !== false ? [P.tip[0] - 38, P.tip[1] - 3] : null;
  const H = Object.assign({}, h, { tip, live: P.hold,
    three_bump: h.number_at != null ? h.number_at : h.s + 0.3, scribble: h.accent_at != null ? h.accent_at : h.s + 0.8 });
  ctx.sfx(0, 'hit', h.id); ctx.sfx(0, 'pop', h.id);
  if (h.number && h.number_at != null) ctx.sfx(h.number_at, 'pop', h.id);
  return makeHook(H);
}

function ctaEl(c, ctx) {
  P = ctx.plan;
  if (c.caption) ctx.sfx(c.tag_t, 'pop', c.id);
  ctx.sfx(c.word_t, 'hit', c.id);
  return makeCta(c);
}

function blockEl(b, ctx) {
  P = ctx.plan;
  const CK = checkShows(P);
  const sh = CK && CK.shows.find(S => S.check === b.index);
  const s = sh ? sh.e + 0.06 : b.s + 0.1;
  const spec = { id: b.id, num: b.num, term: b.term.toUpperCase(), expl: b.expl.join(' '), s, dock: s + 3.12, e: b.e };
  ctx.sfx(spec.s, 'pop', b.id); ctx.sfx(spec.dock + 0.15, 'swoosh_down', b.id);
  return makeHeader(spec);
}

export default {
  name: 'sticker',
  css: ['sticker.css'],
  fonts: ['900 80px Inter', '800 40px Inter', '900 80px Unbounded'],
  // неровный край маркера: детерминированный шум (seed фиксирован)
  defs: `<svg width="0" height="0" style="position:absolute"><defs>
    <filter id="rough" filterUnits="userSpaceOnUse" x="0" y="0" width="1400" height="400">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="rough2" filterUnits="userSpaceOnUse" x="0" y="0" width="1400" height="400">
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.12" numOctaves="2" seed="21" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter>
  </defs></svg>`,
  elements: {
    hook: hookEl,
    question: hookEl,
    lead(spec, ctx) {
      P = ctx.plan;
      CHECK = checkShows(P);
      const S0 = CHECK.shows;
      ctx.sfx(S0[0].s, 'pop', spec.id);
      for (const r of CHECK.rows) ctx.sfx(r.q_t, 'click', spec.id);
      for (const S of S0) if (S.check >= 0) { ctx.sfx(S.check_t, 'click', spec.id); ctx.sfx(S.check_t + 2 / P.fps, 'pop', spec.id); }
      const c = Object.assign({}, C.check);
      const mount = c.mount; c.mount = root => { CHECK = checkShows(P); return mount.call(c, root); };
      return c;
    },
    block: blockEl,
    sphere: blockEl,
    loop(l, ctx) {
      P = ctx.plan;
      ctx.sfx(l.s, 'pop', l.id);
      return makeLoop({ id: l.id, main: (l.kicker || 'ДАЛЬШЕ').toUpperCase(), sub: l.text, s: l.s, e: l.e });
    },
    list(L, ctx) {
      P = ctx.plan;
      for (const it of L.items) ctx.sfx(it.t, 'pop', L.id);
      return makeStack(L);
    },
    emotion(E, ctx) {
      P = ctx.plan;
      ctx.sfx(E.word_t[0], 'hit', E.id);
      return makeEmotion(E);
    },
    cta: ctaEl,
    answer: ctaEl,
    captions(spec, ctx) { P = ctx.plan; return C.caps; },
  },
};
