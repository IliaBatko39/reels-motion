// Базовые компоненты: каждый элемент библиотеки нарисован ТОЛЬКО из токенов стиля (style.json → tokens, motion, captions).
// Новый стиль = новые токены; движок не правится. Пресеты могут подменять любой тип своим модулем (components в style.json).
//
// Типы: hook, question, lead, block, sphere, loop, list, cta, answer, emotion, captions, progress, counter,
//       reaction, comment, arrow, callout, sticker, accent.
// Кадр — чистая функция времени. Смаз в движении — только на входах и выходах (fast).
import { clamp, prog, lerp, TAU, ease, E, el, sv, px, show, fit, rng, hash, floatY, floatR, sheen, outBack } from '../lib.js';

const SAFE = { x0: 60, x1: 940, y0: 220, y1: 1500 };
let T = null, M = null, CAP = null, P = null, FPS = 30;

function init(ctx) {
  T = ctx.tokens; M = ctx.motion; CAP = ctx.style.captions || {}; P = ctx.plan; FPS = P.fps;
}
const c = k => (T.color || {})[k];
const pl = k => (T.plate || {})[k];
const font = role => ({ fontFamily: (T.fonts || {})[role] || "'Inter', sans-serif", fontWeight: String((T.fonts || {})[role + '_weight'] || 900) });
const caseOf = s => ((T.text || {}).case === 'as-is' ? s : String(s).toUpperCase());

// ---------------------------------------------------------------- кожа плашки: форма, обводка, тень, текстура — из токенов
// kind: main (плашка), tag (пояснение), chip (пункт), accent (кодовое слово, номер)
function skin(parent, kind = 'main', o = {}) {
  const shape = o.shape || pl('shape') || 'rounded';
  const r = kind === 'chip' ? ((T.chip || {}).radius ?? 60) : shape === 'pill' ? 999 : (pl('radius') ?? 26) * (kind === 'tag' ? 0.65 : 1);
  const fill = { main: c('plate'), tag: c('tag'), chip: (T.chip || {}).fill || c('plate'), accent: c('accent') }[kind];
  const ink = { main: c('plate_text'), tag: c('tag_text'), chip: (T.chip || {}).text || c('plate_text'), accent: c('ink') }[kind];
  const box = el('div', 'b-plate', parent, { position: 'relative', display: 'inline-block', color: ink });
  const bg = el('div', 'b-bg', box, { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: px(Math.min(r, 999)) });
  const sh = [];
  const outline = pl('outline') || 0, border = pl('border') || 0, bc = pl('border_color') || '#fff';
  if (shape === 'sticker' && outline) sh.push(`0 0 0 ${outline}px ${bc}`);
  if (shape === 'extrude') {
    const d = c('depth') || 'rgba(0,0,0,.35)';
    for (let i = 1; i <= 8; i++) sh.push(`${(i * 0.8).toFixed(1)}px ${(i * 1.1).toFixed(1)}px 0 ${d}`);
  }
  if (pl('shadow')) sh.push(shape === 'sticker' && outline ? pl('shadow').replace(/(\d+px \d+px) 0( |\b)/, `$1 0 ${outline}px `) : pl('shadow'));
  if (pl('glow')) sh.push(pl('glow'));
  bg.style.background = shape === 'outline' ? 'transparent' : fill;
  if (shape === 'glass') {
    bg.style.background = `linear-gradient(170deg, rgba(255,255,255,.16), rgba(255,255,255,0) 45%), ${fill}`;
    bg.style.border = `${border || 1.5}px solid ${bc}`;
  } else if (shape === 'outline' || border) {
    bg.style.border = `${border || 3}px solid ${shape === 'outline' ? (kind === 'tag' ? c('accent2') : kind === 'accent' ? c('accent') : c('line')) : bc}`;
  }
  if (sh.length) bg.style.boxShadow = sh.join(',');
  if (shape === 'tag' || (pl('skew') && kind === 'tag')) bg.style.transform = `skewX(${pl('skew') || -9}deg)`;
  if (shape === 'cut') bg.style.clipPath = 'polygon(0 0, calc(100% - 34px) 0, 100% 34px, 100% 100%, 0 100%)';
  const tex = pl('texture');
  if (tex && tex !== 'none') {
    const t = el('div', 'b-tex', bg, { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 'inherit', pointerEvents: 'none' });
    t.style.backgroundImage = {
      scanlines: 'repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 2px, transparent 2px 6px)',
      grid: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
      dots: 'radial-gradient(rgba(0,0,0,.12) 1.2px, transparent 1.4px)',
    }[tex] || '';
    if (tex === 'grid') t.style.backgroundSize = '22px 22px';
    if (tex === 'dots') t.style.backgroundSize = '9px 9px';
  }
  // бегущий блик
  const clip = el('div', null, bg, { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 'inherit', overflow: 'hidden' });
  const shine = el('div', null, clip, { position: 'absolute', top: '-30%', height: '160%', width: '90px', left: 0, opacity: 0,
    background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.45), rgba(255,255,255,0))' });
  const content = el('div', 'b-in', box, { position: 'relative' });
  const pad = pl('padding') || [24, 36];
  const k = kind === 'tag' ? 0.62 : kind === 'chip' ? 0.7 : 1;
  content.style.padding = `${Math.round(pad[0] * k)}px ${Math.round(pad[1] * k)}px ${Math.round(pad[0] * k * 1.08)}px`;
  return { box, bg, content, shine, shape };
}
function setShine(S, t, t0) {
  const per = ((M.idle || {}).shine_period) || 0;
  const ph = sheen(t, t0, per, 0.6);
  S.shine.style.opacity = ph < 0 ? 0 : 1;
  if (ph >= 0) S.shine.style.transform = `translateX(${(-120 + (S.box.offsetWidth + 240) * ph).toFixed(1)}px) skewX(-18deg)`;
}

// ---------------------------------------------------------------- моушн: вход, выход, покой — из токенов motion
function enterP(t, s) { return prog(t, s, M.enter_dur || 0.36); }
function motionTf(t, s, e, o = {}) {
  const kind = o.enter || M.enter || 'spring';
  const ein = ease(M.ease_in || 'spring:0.5'), eout = ease(M.ease_out || 'inCubic');
  const pi = s <= 0.001 && o.instant ? 1 : enterP(t, s);
  const p = ein(pi);
  const xd = M.exit_dur || 0.16;
  const q = eout(prog(t, e - xd, xd));
  const idle = M.idle || {};
  const live = Math.max(0, t - s);
  let tx = 0, ty = 0, sc = 1, rot = o.rot != null ? o.rot : (pl('rotate') || 0), op = 1, clipR = 0, rx = 0;
  if (kind === 'spring' || kind === 'pop') {
    sc = lerp(M.from_scale ?? 0.72, 1, p); ty = lerp(M.from_y ?? 60, 0, p); rot = lerp((M.from_rotate ?? -9) + rot, rot, p);
    op = clamp(pi * 5);
  } else if (kind === 'slide') { tx = lerp(-140, 0, p); op = clamp(pi * 3); }
  else if (kind === 'wipe') { clipR = (1 - clamp(p)) * 100; ty = lerp(M.from_y ?? 30, 0, p); }
  else if (kind === 'flip') { rx = lerp(-88, 0, p); op = clamp(pi * 4); sc = lerp(M.from_scale ?? 0.9, 1, p); }
  else { op = p; }
  const ex = M.exit || 'drop';
  if (q > 0) {
    if (ex === 'drop') { ty += 40 * q; sc *= 1 - 0.12 * q; op *= 1 - q; }
    else if (ex === 'slide') { tx -= 160 * q; op *= 1 - q; }
    else if (ex === 'shrink') { sc *= 1 - 0.6 * q; op *= 1 - q; }
    else op *= 1 - q;
  }
  ty += floatY(live, o.ph || 0, idle.float ?? 2.5);
  rot += floatR(live, o.ph || 0, idle.rotate ?? 0.3);
  return { tf: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) perspective(900px) rotateX(${rx.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`,
    op, clip: clipR > 0.01 ? `inset(-40px ${clipR.toFixed(2)}% -40px -40px)` : '' };
}
function applyMotion(node, t, s, e, o) {
  const m = motionTf(t, s, e, o);
  node.style.transform = m.tf; node.style.opacity = m.op.toFixed(3); node.style.clipPath = m.clip;
  return m.op;
}
const fastWin = (t, s, e) => (t >= s && t < s + (M.enter_dur || 0.36)) || (t >= e - (M.exit_dur || 0.16) - 1 / FPS && t < e);

// раскрытие текста по словам или буквам (motion.text_reveal: word | letter | mask | none)
function revealText(parent, text, style) {
  const mode = M.text_reveal || 'word';
  const line = el('div', null, parent, Object.assign({ whiteSpace: 'nowrap' }, style || {}), mode === 'none' ? text : null);
  const parts = [];
  if (mode !== 'none') {
    const units = mode === 'letter' ? [...text] : text.split(' ');
    units.forEach((u, i) => {
      const m = el('span', null, line, { display: 'inline-block', overflow: mode === 'mask' || mode === 'word' ? 'hidden' : 'visible', verticalAlign: 'top',
        padding: '0.06em 0.02em 0.1em', margin: '-0.06em -0.02em -0.1em' });
      const s = el('span', null, m, { display: 'inline-block' }, u === ' ' ? ' ' : u);
      parts.push(s);
      if (mode !== 'letter' && i < units.length - 1) line.appendChild(document.createTextNode(' '));
    });
  }
  return { line, parts };
}
function setReveal(R, t, t0) {
  const st = M.stagger ?? 0.06;
  R.parts.forEach((s, k) => {
    const q = E.outExpo(prog(t, t0 + k * st, 0.32));
    s.style.transform = q >= 1 ? '' : `translateY(${(110 * (1 - q)).toFixed(1)}%)`;
  });
}

// акцент на слове: маркер, подчёркивание или плашка (tokens.text.accent_mark)
function accentMark(wordEl) {
  const mode = (T.text || {}).accent_mark || 'marker';
  if (mode === 'none') return { set() {} };
  wordEl.style.position = 'relative';
  const m = el('span', null, wordEl, { position: 'absolute', left: '-0.12em', right: '-0.12em', zIndex: -1, transformOrigin: '0 50%',
    background: mode === 'underline' ? 'transparent' : c('accent'), borderRadius: mode === 'box' ? '8px' : '6px' });
  if (mode === 'marker') Object.assign(m.style, { top: '38%', bottom: '4%', transform: 'skewX(-8deg) rotate(-1.5deg)' });
  if (mode === 'box') Object.assign(m.style, { top: '2%', bottom: '-4%' });
  if (mode === 'underline') Object.assign(m.style, { top: '92%', height: '0.12em', background: c('line') || c('accent'), borderRadius: '99px' });
  wordEl.style.isolation = 'isolate';
  return { set(p) { m.style.transform = (mode === 'marker' ? 'skewX(-8deg) rotate(-1.5deg) ' : '') + `scaleX(${clamp(p).toFixed(3)})`; } };
}

// ---------------------------------------------------------------- указатель: стрелка-нос или линия от пальца к плашке
function pointer(layer, plateBox, tip, t0, mode) {
  mode = mode || pl('pointer') || 'arrow';
  if (!tip || mode === 'none') return { set() {} };
  const r = plateBox.getBoundingClientRect();
  const x0 = r.right, y0 = clamp(tip[1], r.top + 30, r.bottom - 30);
  if (mode === 'arrow') {
    const s = sv('svg', { width: 1080, height: 1920, style: 'position:absolute;left:0;top:0;overflow:visible' }, layer);
    const h = 30;
    sv('path', { d: `M ${x0 - 2} ${y0 - h} L ${tip[0] - 8} ${tip[1]} L ${x0 - 2} ${y0 + h} Z`, fill: c('plate'),
      stroke: pl('outline') ? pl('border_color') : 'none', 'stroke-width': pl('outline') || 0, 'paint-order': 'stroke' }, s);
    return { set() {} };
  }
  const s = sv('svg', { width: 1080, height: 1920, style: 'position:absolute;left:0;top:0;overflow:visible' }, layer);
  const d = `M ${x0 + 6} ${y0} C ${x0 + 40} ${y0}, ${tip[0] - 40} ${tip[1]}, ${tip[0] - 10} ${tip[1]}`;
  const path = sv('path', { d, fill: 'none', stroke: c('line') || c('accent'), 'stroke-width': 4, 'stroke-linecap': 'round' }, s);
  sv('circle', { cx: tip[0], cy: tip[1], r: 12, fill: 'none', stroke: c('line') || c('accent'), 'stroke-width': 3 }, s);
  const L = path.getTotalLength();
  path.setAttribute('stroke-dasharray', L);
  return { set(t) { path.setAttribute('stroke-dashoffset', (L * (1 - E.outCubic(prog(t, t0, 0.3)))).toFixed(1)); } };
}

// ---------------------------------------------------------------- 1. Хук / вопрос
function hook(h, ctx) {
  init(ctx);
  const tip = P.tip && h.pointer !== false ? P.tip : null;
  if (h.number_at != null) ctx.sfx(h.number_at, 'pop', h.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0, width: '1080px', height: '1920px' });
      const g = el('div', null, L, { position: 'absolute', left: 0, top: 0 });
      const S = skin(g, 'main');
      const ct = S.content;
      const head = font('head');
      let num = null;
      if (h.kicker || h.number) {
        const r1 = el('div', null, ct, Object.assign({ whiteSpace: 'nowrap', fontSize: '64px', lineHeight: '1', display: 'flex', alignItems: 'flex-end', gap: '14px' }, head));
        if (h.kicker) el('span', null, r1, null, caseOf(h.kicker));
        if (h.number) num = el('span', null, r1, { color: c('accent'), fontSize: '1.9em', lineHeight: '.78', display: 'inline-block', transformOrigin: '50% 80%' }, h.number);
      }
      const rows = h.lines.map(ln => el('div', null, ct, Object.assign({ whiteSpace: 'nowrap', fontSize: '84px', lineHeight: '1.0', letterSpacing: (T.text || {}).tracking || '-0.015em' }, head), caseOf(ln)));
      const maxW = tip ? tip[0] - 70 - 60 - 72 : 760;
      const fs = Math.min(...rows.map(r => fit(r, 84, 44, maxW)), 84);
      rows.forEach(r => { r.style.fontSize = fs + 'px'; });
      const mark = rows.length ? accentMark(rows[rows.length - 1]) : { set() {} };
      let tag = null, under = null;
      if (h.sub.length) {
        const T2 = skin(g, 'tag');
        tag = T2;
        Object.assign(T2.box.style, { position: 'absolute', left: '18px', top: '100%', marginTop: '-14px', transform: 'rotate(-2deg)' });
        h.sub.forEach(s => el('div', null, T2.content, Object.assign({ whiteSpace: 'nowrap', fontSize: '40px', lineHeight: '1.14' }, font('body')), s));
        const last = T2.content.lastChild;
        under = accentMark(last);
      }
      const r = S.box.getBoundingClientRect();
      const W = r.width, Hh = r.height;
      const gap = (pl('pointer') || 'arrow') === 'line' ? 80 : 46;
      let X = tip ? tip[0] - gap - W : 500 - W / 2, Y = tip ? tip[1] - Hh * 0.55 : 240;
      X = Math.max(SAFE.x0, X);
      Object.assign(g.style, { left: px(X), top: px(Y), transformOrigin: tip ? `${W}px ${Hh * 0.55}px` : '50% 50%' });
      const ptr = pointer(L, S.box, tip, -1);          // на стоп-кадре (обложке) линия уже прорисована
      return { L, g, S, num, mark, under, tag, ptr, text: [h.kicker, h.number, ...h.lines].filter(Boolean).join(' ') };
    },
    update(st, t) {
      if (t < h.s || t >= h.e) return false;
      const live = t >= P.hold;
      applyMotion(st.g, live ? t : 0, h.s, h.e, { instant: true, ph: 0.1 });
      if (!live) st.g.style.transform = `rotate(${pl('rotate') || 0}deg)`;
      st.mark.set(1);
      if (st.under) st.under.set(h.accent_at != null ? prog(t, h.accent_at, 0.25) : 1);
      if (st.num && h.number_at != null) {
        const tb = t - h.number_at;
        const b = tb > 0 && tb < 0.6 ? Math.sin(Math.PI * clamp(tb / 0.12)) * 0.2 * Math.exp(-tb * 4) : 0;
        st.num.style.transform = `scale(${(1 + b).toFixed(3)}) rotate(${(tb > 0 && tb < 0.8 ? 9 * Math.exp(-tb * 6) * Math.sin(tb * 34) : 0).toFixed(2)}deg)`;
      }
      st.ptr.set(t);
      setShine(st.S, t, P.hold);
      return true;
    },
    fast(st, t) { return t >= h.e - (M.exit_dur || 0.16) - 1 / FPS && t < h.e; },
    boxes(st) { return [{ el: st.S.box, text: st.text }].concat(st.tag ? [{ el: st.tag.box, text: h.sub.join(' ') }] : []); },
  };
}

// ---------------------------------------------------------------- 2. Лид: список пунктов, каждый — на своём слове
function lead(Ld, ctx) {
  init(ctx);
  for (const it of Ld.items) ctx.sfx(it.q_t, 'click', Ld.id);
  const e = Ld.e;
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const rows = Ld.items.map((it, i) => {
        const S = skin(L, 'chip');
        Object.assign(S.box.style, { position: 'absolute', left: px(SAFE.x0 + 10 + i * 26), top: px(980 + i * 132) });
        const row = el('div', null, S.content, { display: 'flex', alignItems: 'center', gap: '20px', whiteSpace: 'nowrap' });
        const badge = el('div', null, row, Object.assign({ width: '66px', height: '66px', borderRadius: px(Math.min(33, (pl('radius') || 26) * 0.7)), background: c('accent'),
          color: c('ink'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', flex: 'none' }, font('head')),
          it.dir === 'down' ? '↓' : it.dir === 'up' ? '↑' : String(i + 1));
        const col = el('div', null, row, {});
        const q = el('div', null, col, Object.assign({ fontSize: '30px', lineHeight: '1', color: c('accent2') || c('accent'), letterSpacing: '.04em' }, font('body')), caseOf(it.qual || ''));
        const R = revealText(col, caseOf(it.term), Object.assign({ fontSize: '58px', lineHeight: '1.04' }, font('head')));
        fit(R.line, 58, 38, 700);
        return { it, S, badge, q, R };
      });
      return { L, rows };
    },
    update(st, t) {
      if (t < Ld.items[0].q_t - 0.05 || t >= e) return false;
      st.rows.forEach((r, i) => {
        const vis = t >= r.it.q_t;
        show(r.S.box, vis);
        if (!vis) return;
        applyMotion(r.S.box, t, r.it.q_t, e - (st.rows.length - 1 - i) * 2 / FPS, { ph: i * 0.3, rot: 0 });
        setReveal(r.R, t, r.it.t_t - 0.03);
        setShine(r.S, t, r.it.q_t + 0.4);
      });
      return true;
    },
    fast(st, t) { return Ld.items.some(it => t >= it.q_t && t < it.q_t + (M.enter_dur || 0.36)) || (t >= e - 0.3 && t < e); },
    boxes(st, t) { return st.rows.filter(r => t >= r.it.q_t).map(r => ({ el: r.S.box, text: (r.it.qual || '') + ' ' + r.it.term })); },
  };
}

// ---------------------------------------------------------------- 3. Карточка блока / сферы: номер + термин + пояснение
function block(b, ctx) {
  init(ctx);
  const s = b.s + 0.12, e = Math.min(b.e, b.s + 3.3);
  ctx.sfx(s, 'pop', b.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const g = el('div', null, L, { position: 'absolute', left: px(SAFE.x0 + 6), top: '262px', transformOrigin: '0 50%' });
      const S = skin(g, 'main');
      const row = el('div', null, S.content, { display: 'flex', alignItems: 'center', gap: '22px', whiteSpace: 'nowrap' });
      const N = skin(row, 'accent');
      el('div', null, N.content, Object.assign({ fontSize: '64px', lineHeight: '1', minWidth: '44px', textAlign: 'center' }, font('head')), String(b.num));
      N.content.style.padding = '10px 20px 12px';
      const term = el('div', null, row, Object.assign({ fontSize: '72px', lineHeight: '1', letterSpacing: (T.text || {}).tracking || '-0.015em' }, font('head')), caseOf(b.term));
      fit(term, 72, 42, 600);
      let tag = null, R = null;
      if (b.expl.length) {
        tag = skin(g, 'tag');
        Object.assign(tag.box.style, { position: 'absolute', left: '34px', top: '100%', marginTop: '-12px' });
        R = revealText(tag.content, b.expl.join(' '), Object.assign({ fontSize: '40px', lineHeight: '1.1' }, font('body')));
        fit(R.line, 40, 30, 760);
      }
      return { L, g, S, tag, R };
    },
    update(st, t) {
      if (t < s || t >= e) return false;
      applyMotion(st.g, t, s, e, { ph: b.index * 0.21 });
      if (st.R) setReveal(st.R, t, s + 0.2);
      setShine(st.S, t, s + 0.5);
      return true;
    },
    fast(st, t) { return fastWin(t, s, e); },
    boxes(st) { return [{ el: st.S.box, text: b.num + ' ' + b.term }].concat(st.tag ? [{ el: st.tag.box, text: b.expl.join(' ') }] : []); },
  };
}

// ---------------------------------------------------------------- 4. Открытая петля: фраза + стрелка «дальше»
function loop(l, ctx) {
  init(ctx);
  ctx.sfx(l.s, 'pop', l.id);
  ctx.sfx(l.e, 'riser', l.id, { dur: Math.max(0.6, Math.min(1.2, l.e - l.s)) });
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const g = el('div', null, L, { position: 'absolute', top: '1150px' });
      const S = skin(g, 'main');
      const row = el('div', null, S.content, { display: 'flex', alignItems: 'center', gap: '18px', whiteSpace: 'nowrap' });
      const R = revealText(row, caseOf(l.text), Object.assign({ fontSize: '62px', lineHeight: '1.05' }, font('head')));
      fit(R.line, 62, 38, 640);
      const ar = sv('svg', { width: 76, height: 56, viewBox: '0 0 76 56', style: 'overflow:visible;flex:none' }, row);
      const ap = sv('path', { d: 'M 6 28 H 64 M 44 8 L 66 28 L 44 48', fill: 'none', stroke: c('accent'), 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ar);
      const AL = ap.getTotalLength(); ap.setAttribute('stroke-dasharray', AL);
      const w = S.box.getBoundingClientRect().width;
      g.style.left = px(Math.min(SAFE.x1 - w, 500 - w / 2));
      g.style.transformOrigin = '50% 50%';
      return { L, g, S, R, ar, ap, AL };
    },
    update(st, t) {
      if (t < l.s || t >= l.e) return false;
      applyMotion(st.g, t, l.s, l.e, { ph: 0.4 });
      setReveal(st.R, t, l.s + 0.1);
      st.ap.setAttribute('stroke-dashoffset', (st.AL * (1 - E.outCubic(prog(t, l.s + 0.3, 0.25)))).toFixed(1));
      st.ar.style.transform = `translateX(${(t > l.s + 0.6 ? 8 * Math.max(0, Math.sin(TAU * (t - l.s) / 0.7)) : 0).toFixed(1)}px)`;
      setShine(st.S, t, l.s + 0.3);
      return true;
    },
    fast(st, t) { return fastWin(t, l.s, l.e); },
    boxes(st) { return [{ el: st.S.box, text: l.text }]; },
  };
}

// ---------------------------------------------------------------- 5. Список-чипы: пункт на своём слове
const ICON = {
  check: 'M8 23 L18 33 L36 12',
  heart: 'M22 38 C10 29 4 22 4 15 C4 9 9 5 14 5 C18 5 20.5 7.5 22 10 C23.5 7.5 26 5 30 5 C35 5 40 9 40 15 C40 22 34 29 22 38 Z',
  globe: 'M22 4 A18 18 0 1 0 22.01 4 Z M4 22 H40 M22 4 C13 13 13 31 22 40 M22 4 C31 13 31 31 22 40',
  phone: 'M13 3 H31 A4 4 0 0 1 35 7 V37 A4 4 0 0 1 31 41 H13 A4 4 0 0 1 9 37 V7 A4 4 0 0 1 13 3 Z M19 35 H25',
  grid: 'M5 5 H19 V19 H5 Z M25 5 H39 V19 H25 Z M5 25 H19 V39 H5 Z M25 25 H39 V39 H25 Z',
  tag: 'M4 6 V20 L24 40 L40 24 L20 4 H6 A2 2 0 0 0 4 6 Z',
  gift: 'M5 16 H39 V24 H5 Z M8 24 V40 H36 V24 M22 16 V40',
  star: 'M22 4 L27 16 L40 17 L30 26 L33 39 L22 32 L11 39 L14 26 L4 17 L17 16 Z',
};
function list(Lst, ctx) {
  init(ctx);
  for (const it of Lst.items) ctx.sfx(it.t, 'pop', Lst.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const chips = Lst.items.map((it, i) => {
        const S = skin(L, 'chip');
        Object.assign(S.box.style, { position: 'absolute', left: px(SAFE.x0 + 30 + i * 56), top: px(990 + i * 124) });
        const row = el('div', null, S.content, { display: 'flex', alignItems: 'center', gap: '18px', whiteSpace: 'nowrap' });
        const dot = el('div', null, row, { width: '62px', height: '62px', borderRadius: '50%', background: (T.chip || {}).dot || c('accent'), flex: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' });
        const ic = sv('svg', { width: 40, height: 40, viewBox: '0 0 44 44' }, dot);
        const ip = sv('path', { d: ICON[it.icon] || ICON.check, fill: 'none', stroke: c('ink'), 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ic);
        const IL = ip.getTotalLength(); ip.setAttribute('stroke-dasharray', IL);
        const tx = el('div', null, row, Object.assign({ fontSize: '52px', lineHeight: '1' }, font('head')), caseOf(it.text));
        fit(tx, 52, 34, 640);
        return { it, S, ip, IL };
      });
      return { L, chips };
    },
    update(st, t) {
      if (t < Lst.s || t >= Lst.e) return false;
      st.chips.forEach((ch, i) => {
        const vis = t >= ch.it.t;
        show(ch.S.box, vis);
        if (!vis) return;
        applyMotion(ch.S.box, t, ch.it.t, Lst.e - (st.chips.length - 1 - i) * 2 / FPS, { ph: i * 0.37, rot: 0 });
        ch.ip.setAttribute('stroke-dashoffset', (ch.IL * (1 - E.inOutCubic(prog(t, ch.it.t + 0.08, 0.4)))).toFixed(1));
        setShine(ch.S, t, ch.it.t + 0.4 + i * 0.15);
      });
      return true;
    },
    fast(st, t) { return Lst.items.some(it => t >= it.t && t < it.t + (M.enter_dur || 0.36)) || (t >= Lst.e - 0.3 && t < Lst.e); },
    boxes(st, t) { return st.chips.filter(ch => t >= ch.it.t).map(ch => ({ el: ch.S.box, text: ch.it.text })); },
  };
}

// ---------------------------------------------------------------- 6. Призыв / ответ: подпись + крупное слово по буквам с ударом
function cta(C, ctx) {
  init(ctx);
  if (C.caption) ctx.sfx(C.tag_t, 'pop', C.id);
  ctx.sfx(C.word_t, 'hit', C.id);
  const end = P.duration + 1;
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const g = el('div', null, L, { position: 'absolute', top: '1110px' });
      let tag = null;
      if (C.caption) {
        tag = skin(g, 'tag');
        Object.assign(tag.box.style, { display: 'block', width: 'max-content', marginLeft: '20px', marginBottom: '14px', transform: 'rotate(-2deg)' });
        el('div', null, tag.content, Object.assign({ fontSize: '42px', lineHeight: '1.1', whiteSpace: 'nowrap' }, font('body')), caseOf(C.caption));
      }
      const S = skin(g, 'accent');
      const R = revealText(S.content, caseOf(C.word), Object.assign({ fontSize: '112px', lineHeight: '1' }, font('head')));
      fit(R.line, 112, 60, 760);
      const w = g.getBoundingClientRect().width;
      g.style.left = px(Math.max(SAFE.x0, Math.min(SAFE.x1 - w, 500 - w / 2)));
      g.style.transformOrigin = '50% 70%';
      return { L, g, tag, S, R };
    },
    update(st, t) {
      const t0 = C.caption ? Math.min(C.tag_t, C.word_t) : C.word_t;
      if (t < t0) return false;
      if (st.tag) applyMotion(st.tag.box, t, C.tag_t, end, { rot: -2, ph: 0.8 });
      const vis = t >= C.word_t;
      st.S.box.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) {
        const p = outBack(1.7)(prog(t, C.word_t, 0.22));
        const k = Math.floor((t - C.word_t) * FPS);
        const jit = k >= 0 && k < 3 ? [6, -5, 3][k] : 0;
        st.S.box.style.transform = `translate(${jit}px, ${floatY(t - C.word_t, 0.3, ((M.idle || {}).float ?? 2.5))}px) scale(${lerp(1.35, 1, p).toFixed(4)}) rotate(${(pl('rotate') || 0)}deg)`;
        st.S.box.style.opacity = clamp((t - C.word_t) * FPS / 2).toFixed(3);
        setReveal(st.R, t, C.word_t);
        setShine(st.S, t, C.word_t + 0.5);
      }
      return true;
    },
    fast(st, t) { return (t >= C.tag_t && t < C.tag_t + 0.3) || (t >= C.word_t && t < C.word_t + 0.3); },
    boxes(st, t) { return (st.tag ? [{ el: st.tag.box, text: C.caption }] : []).concat(t >= C.word_t ? [{ el: st.S.box, text: C.word }] : []); },
  };
}

// ---------------------------------------------------------------- 7. Эмоция / акцентное слово: крупно, по словам из маски
function bigWords(spec, ctx, words, times, accentIdx, s, e) {
  init(ctx);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0, width: '1080px' });
      const g = el('div', null, L, { position: 'absolute', left: '60px', width: '880px', top: '960px', textAlign: 'center' });
      const items = words.map((w, i) => {
        const m = el('div', null, g, { display: 'block', overflow: 'hidden', padding: '0.04em 0.1em 0.12em', marginBottom: '-0.08em' });
        const sp = el('span', null, m, Object.assign({ display: 'inline-block', fontSize: '132px', lineHeight: '1', color: i === accentIdx ? c('accent') : '#fff',
          WebkitTextStroke: `${CAP.stroke ?? 10}px ${CAP.stroke_color || '#000'}`, paintOrder: 'stroke fill', textShadow: CAP.shadow || '' }, font('head')), caseOf(w));
        fit(sp, 132, 64, 860);
        return { sp, t: times[i] };
      });
      return { L, g, items };
    },
    update(st, t) {
      if (t < s || t >= e) return false;
      const x = E.inCubic(prog(t, e - 0.12, 0.12));
      st.items.forEach(it => {
        const q = E.outExpo(prog(t, it.t, 0.35));
        it.sp.style.transform = `translateY(${(110 * (1 - q) - 30 * x).toFixed(1)}%)`;
      });
      st.g.style.opacity = (1 - x).toFixed(3);
      return true;
    },
    fast(st, t) { return st.items.some(it => t >= it.t && t < it.t + 0.2) || (t >= e - 0.15 && t < e); },
    boxes(st, t) { return st.items.filter(it => t >= it.t).map(it => ({ el: it.sp, text: it.sp.textContent })); },
  };
}
function emotion(Em, ctx) {
  ctx.sfx(Em.word_t[0], 'hit', Em.id);
  return bigWords(Em, ctx, Em.words, Em.word_t, Em.accent, Em.s, Em.e);
}
function accent(A, ctx) {
  ctx.sfx(A.s, 'pop', A.id);
  const ws = String(A.text).split(/\s+/);
  return bigWords(A, ctx, ws, ws.map((_, i) => A.s + i * ((ctx.motion.stagger) ?? 0.06)), A.accent ?? ws.length - 1, A.s, A.e);
}

// ---------------------------------------------------------------- 8. Субтитры: clean | pop | karaoke | marker
function captions(spec, ctx) {
  init(ctx);
  const v = CAP.variant || 'pop';
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0, width: '1080px', height: '1920px' });
      const cards = P.captions.map(k => {
        const box = el('div', null, L, { position: 'absolute', left: 0, width: '1080px', textAlign: 'center', whiteSpace: 'nowrap', display: 'none' });
        const line = el('div', null, box, { display: 'inline-block', fontFamily: CAP.font || "'Inter', sans-serif", fontWeight: String(CAP.weight || 900),
          fontSize: (CAP.size || 80) + 'px', lineHeight: '1.08', letterSpacing: '-0.01em' });
        const ws = k.words.map(i => {
          const w = P.words[i];
          const txt = CAP.case === 'as-is' ? w.text : w.w;
          const sp = el('span', null, line, { display: 'inline-block', position: 'relative', margin: '0 .16em', transformOrigin: '50% 70%' });
          const bgm = (v === 'marker' && w.acc) || v === 'karaoke' ? el('span', null, sp, { position: 'absolute', left: '-.14em', right: '-.14em', top: '.06em', bottom: '.02em',
            background: CAP.highlight || c('accent'), borderRadius: '10px', transformOrigin: '0 50%', transform: 'scaleX(0)' }) : null;
          const tx = el('span', null, sp, { position: 'relative', color: CAP.color || '#fff', WebkitTextStroke: `${CAP.stroke ?? 10}px ${CAP.stroke_color || '#000'}`,
            paintOrder: 'stroke fill', textShadow: CAP.shadow || '' }, txt);
          if (w.acc && v !== 'marker') tx.style.color = CAP.accent_color || c('accent');
          if (v === 'marker' && w.acc) { tx.style.color = c('ink'); tx.style.WebkitTextStroke = '0'; tx.style.textShadow = 'none'; }
          return { w, sp, bgm, tx };
        });
        box.style.display = '';
        let fs = CAP.size || 80;
        const lw = line.getBoundingClientRect().width;
        if (lw > (CAP.max_w || 880)) { fs = Math.floor(fs * (CAP.max_w || 880) / lw); line.style.fontSize = fs + 'px'; }
        const lh = line.getBoundingClientRect().height;
        box.style.top = px((CAP.bottom || 1488) - lh);
        box.style.display = 'none';
        return { k, box, ws };
      });
      return { L, cards };
    },
    update(st, t) {
      let any = false;
      const sup = P.captions_suppress.some(([a, b]) => t >= a && t < b);
      for (const cd of st.cards) {
        const on = !sup && t >= cd.k.s && t < cd.k.e;
        show(cd.box, on);
        if (!on) continue;
        any = true;
        cd.box.style.opacity = (1 - prog(t, cd.k.e - 2 / FPS, 2 / FPS)).toFixed(3);
        for (const o of cd.ws) {
          const fr = (t - (o.w.s - 0.02)) * FPS;
          const act = t >= o.w.s - 0.02 && t < o.w.e + 0.04;
          if (v === 'pop' || v === 'marker') {
            const s = fr < 0 ? 0 : fr >= 5 ? 1 : fr <= 3 ? lerp(0.7, 1.12, 1 - Math.pow(1 - fr / 3, 2)) : lerp(1.12, 1, E.inOutCubic((fr - 3) / 2));
            o.sp.style.visibility = fr < 0 ? 'hidden' : 'visible';
            o.sp.style.transform = `scale(${s.toFixed(3)})`;
          } else if (v === 'clean') {
            const p = E.outCubic(prog(t, o.w.s - 2 / FPS, 4 / FPS));
            o.sp.style.opacity = p.toFixed(3);
            o.sp.style.transform = p >= 1 ? '' : `translateY(${(14 * (1 - p)).toFixed(1)}px)`;
          } else if (v === 'karaoke') {
            o.sp.style.visibility = 'visible';
            if (!o.w.acc) o.tx.style.color = act ? (CAP.karaoke_text || c('ink')) : (CAP.color || '#fff');
            o.tx.style.WebkitTextStroke = act ? '0' : `${CAP.stroke ?? 10}px ${CAP.stroke_color || '#000'}`;
          }
          if (o.bgm) {
            const p = v === 'karaoke' ? (act ? 1 : 0) : prog(fr, 1, 5);
            o.bgm.style.transform = `scaleX(${clamp(p).toFixed(3)})`;
          }
        }
      }
      return any;
    },
    fast() { return false; },
    boxes(st, t) {
      const cd = st.cards.find(cd => cd.box.style.display !== 'none');
      return cd ? [{ el: cd.box.firstChild, text: cd.ws.map(o => o.w.w).join(' '), kind: 'caption' }] : [];
    },
  };
}

// ---------------------------------------------------------------- 9. Прогресс: сегменты по блокам
function progress(spec, ctx) {
  init(ctx);
  const blocks = (P.template === 'B' ? P.spheres : P.blocks) || [];
  const s = spec.s != null ? spec.s : ((P.hook || P.question || {}).e || 0);
  const e = spec.e != null ? spec.e : P.duration + 1;
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: '150px', top: '226px', width: '780px', height: '14px' });
      const n = Math.max(1, blocks.length), gap = 14, w = (780 - gap * (n - 1)) / n;
      const segs = blocks.map((b, i) => {
        const sg = el('div', null, L, { position: 'absolute', left: px(i * (w + gap)), top: 0, width: px(w), height: '10px', borderRadius: '5px',
          background: 'rgba(255,255,255,.3)', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.35)' });
        const f = el('div', null, sg, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', background: c('accent'), transformOrigin: '0 50%' });
        return { b, f };
      });
      return { L, segs };
    },
    update(st, t) {
      if (t < s || t >= e || !st.segs.length) return false;
      st.L.style.opacity = E.outCubic(prog(t, s, 0.25)).toFixed(3);
      st.L.style.transform = `translateY(${(-20 * (1 - E.outCubic(prog(t, s, 0.25)))).toFixed(1)}px)`;
      for (const g of st.segs) g.f.style.transform = `scaleX(${clamp((t - g.b.s) / (g.b.e - g.b.s)).toFixed(4)})`;
      return true;
    },
    fast(st, t) { return t >= s && t < s + 0.25; },
    boxes(st) { return [{ el: st.L, kind: 'graphic' }]; },
  };
}

// счётчик блока n/N: цифра перекатывается на старте блока
function counter(spec, ctx) {
  init(ctx);
  const blocks = (P.template === 'B' ? P.spheres : P.blocks) || [];
  const end = (P.cta || P.answer || { s: P.duration + 1 }).s;
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: '62px', top: '250px' });
      const S = skin(L, 'accent');
      const win = el('div', null, S.content, Object.assign({ height: '84px', overflow: 'hidden', display: 'flex', alignItems: 'flex-start', fontSize: '76px', lineHeight: '84px' }, font('head')));
      const col = el('div', null, win, {});
      blocks.forEach((b, i) => el('div', null, col, { height: '84px' }, String(i + 1)));
      el('div', null, win, { fontSize: '40px', marginLeft: '6px', marginTop: '30px', lineHeight: '1', opacity: 0.7 }, '/' + blocks.length);
      return { L, S, col };
    },
    update(st, t) {
      if (!blocks.length || t < blocks[0].s || t >= end) return false;
      let k = 0;
      blocks.forEach((b, i) => { if (i > 0) k += outBack(1.4)(prog(t, b.s, 0.32)); });
      st.col.style.transform = `translateY(${(-84 * k).toFixed(1)}px)`;
      applyMotion(st.S.box, t, blocks[0].s, end, { rot: 0 });
      return true;
    },
    fast(st, t) { return blocks.some(b => t >= b.s && t < b.s + 0.32); },
    boxes(st) { return [{ el: st.S.box, kind: 'graphic' }]; },
  };
}

// ---------------------------------------------------------------- 10. Реакции: 🔥 😮 👍 ❤ ⭐ и надписи «ЛАЙК», «ВАУ» — отскок + частицы
const REACT = {
  fire: s => { const g = sv('g', {}, s);
    sv('path', { d: 'M50 6 C62 26 82 34 80 60 C78 82 62 94 50 94 C34 94 20 82 20 62 C20 46 30 38 34 26 C40 36 44 40 46 44 C50 32 52 18 50 6 Z', fill: '#FF5A1F' }, g);
    sv('path', { d: 'M50 44 C58 56 66 62 64 74 C62 86 56 90 50 90 C42 90 36 84 36 74 C36 66 42 62 44 54 C47 60 49 60 50 44 Z', fill: '#FFC928' }, g); },
  wow: s => { sv('circle', { cx: 50, cy: 50, r: 44, fill: '#FFC928' }, s);
    sv('path', { d: 'M28 30 Q34 24 40 30 M60 30 Q66 24 72 30', stroke: '#17161A', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, s);
    sv('ellipse', { cx: 35, cy: 42, rx: 5, ry: 7, fill: '#17161A' }, s); sv('ellipse', { cx: 65, cy: 42, rx: 5, ry: 7, fill: '#17161A' }, s);
    sv('ellipse', { cx: 50, cy: 70, rx: 10, ry: 13, fill: '#17161A' }, s); },
  like: s => { sv('circle', { cx: 50, cy: 50, r: 44, fill: '#2F7BF6' }, s);
    sv('path', { d: 'M30 48 H40 V76 H30 Z M44 76 V48 L54 28 C58 26 62 28 61 34 L58 46 H72 C76 46 78 50 77 54 L72 72 C71 75 69 76 66 76 Z', fill: '#fff' }, s); },
  heart: s => sv('path', { d: 'M50 88 C22 66 8 52 8 34 C8 20 18 10 31 10 C40 10 46 15 50 22 C54 15 60 10 69 10 C82 10 92 20 92 34 C92 52 78 66 50 88 Z', fill: '#FF3B5C' }, s),
  star: s => sv('path', { d: 'M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z', fill: '#FFC928' }, s),
};
function reaction(R, ctx) {
  init(ctx);
  const s = R.s, e = R.e;
  ctx.sfx(s, 'pop', R.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const size = R.size || (T.reaction || {}).size || 150;
      const x = R.x != null ? R.x : 800, y = R.y != null ? R.y : 900;
      const g = el('div', null, L, { position: 'absolute', left: px(x - size / 2), top: px(y - size / 2), width: px(size), height: px(size) });
      let icon;
      if (R.kind === 'text' || !REACT[R.kind]) {
        const S = skin(g, 'accent');
        Object.assign(S.box.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(-6deg)' });
        el('div', null, S.content, Object.assign({ fontSize: px(size * 0.42), lineHeight: '1', whiteSpace: 'nowrap' }, font('head')), caseOf(R.text || R.kind || 'ВАУ'));
        icon = S.box;
      } else {
        icon = sv('svg', { width: size, height: size, viewBox: '0 0 100 100', style: 'position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))' }, g);
        REACT[R.kind](icon);
      }
      const r = rng(hash(R.id));
      const pal = (T.reaction || {}).palette || [c('accent'), c('accent2'), '#fff'];
      const parts = Array.from({ length: (T.reaction || {}).particles ?? 10 }, (_, i) => {
        const a = TAU * (i / 10 + r() * 0.08), d = size * (0.7 + r() * 0.5), sz = 8 + r() * 10;
        const p = el('div', null, L, { position: 'absolute', left: px(x - sz / 2), top: px(y - sz / 2), width: px(sz), height: px(sz),
          borderRadius: i % 3 ? '50%' : '3px', background: pal[i % pal.length] });
        return { p, a, d };
      });
      return { L, g, icon, parts };
    },
    update(st, t) {
      if (t < s || t >= e) return false;
      const tau = t - s;
      const sc = tau < 0.5 ? outBack(2.4)(prog(tau, 0, 0.3)) : 1;
      const up = -40 * E.inCubic(prog(t, e - 0.35, 0.35));
      st.g.style.transform = `translateY(${(up + floatY(tau, 0.2, 4)).toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${(8 * Math.exp(-tau * 5) * Math.sin(tau * 22)).toFixed(2)}deg)`;
      st.g.style.opacity = (1 - prog(t, e - 0.2, 0.2)).toFixed(3);
      st.parts.forEach(q => {
        const k = E.outCubic(prog(tau, 0.04, 0.5));
        q.p.style.transform = `translate(${(Math.cos(q.a) * q.d * k).toFixed(1)}px, ${(Math.sin(q.a) * q.d * k + 60 * k * k).toFixed(1)}px) scale(${(1 - k).toFixed(3)})`;
        q.p.style.opacity = (k < 1 ? 1 - k * k : 0).toFixed(3);
      });
      return true;
    },
    fast(st, t) { return (t >= s && t < s + 0.3) || (t >= e - 0.2 && t < e); },
    boxes(st) { return [{ el: st.g, kind: R.kind === 'text' ? 'text' : 'graphic', text: R.text || '' }]; },
  };
}

// ---------------------------------------------------------------- 11. Пузырь «ответ на комментарий» (вход шаблона Б)
function comment(Cm, ctx) {
  init(ctx);
  ctx.sfx(Cm.s, 'pop', Cm.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const g = el('div', null, L, { position: 'absolute', left: '72px', top: px(Cm.y || 250), width: '860px' });
      const lab = el('div', null, g, Object.assign({ fontSize: '30px', color: '#fff', marginBottom: '10px', textShadow: '0 2px 6px rgba(0,0,0,.6)' }, font('body')),
        Cm.label || 'Ответ пользователю ' + (Cm.author || 'подписчик'));
      const box = el('div', null, g, { background: '#fff', color: '#17161A', borderRadius: '30px', padding: '22px 30px 26px 24px', display: 'inline-flex', gap: '18px',
        alignItems: 'flex-start', boxShadow: '0 16px 30px rgba(0,0,0,.35)' });
      const av = el('div', null, box, Object.assign({ width: '64px', height: '64px', borderRadius: '50%', background: c('accent'), color: c('ink'), flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }, font('head')), (Cm.author || 'П')[0].toUpperCase());
      const col = el('div', null, box, {});
      el('div', null, col, Object.assign({ fontSize: '28px', color: '#6b6b6b', marginBottom: '4px' }, font('body')), Cm.author || 'подписчик');
      const tx = el('div', null, col, Object.assign({ fontSize: '46px', lineHeight: '1.15', maxWidth: '700px' }, font('body')), Cm.text);
      return { L, g, box, tx, lab };
    },
    update(st, t) {
      if (t < Cm.s || t >= Cm.e) return false;
      const p = E.outCubic(prog(t, Cm.s, 0.3)), q = E.inCubic(prog(t, Cm.e - 0.15, 0.15));
      st.g.style.transform = `translateY(${(40 * (1 - p) - 20 * q).toFixed(1)}px) scale(${lerp(0.92, 1, p).toFixed(3)})`;
      st.g.style.opacity = (Math.min(1, p * 2) * (1 - q)).toFixed(3);
      return true;
    },
    fast(st, t) { return fastWin(t, Cm.s, Cm.e); },
    boxes(st) { return [{ el: st.box, text: Cm.text }]; },
  };
}

// ---------------------------------------------------------------- 12. Стрелка и выноска: линия прорисовывается, наконечник; рамка вокруг области
function arrow(A, ctx) {
  init(ctx);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const s = sv('svg', { width: 1080, height: 1920, style: 'position:absolute;left:0;top:0;overflow:visible' }, L);
      const [x0, y0] = A.from, [x1, y1] = A.to;
      const bend = A.bend ?? 0.25;
      const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend;
      const col = A.color || c('line') || c('accent');
      const path = sv('path', { d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}`, fill: 'none', stroke: col, 'stroke-width': A.width || 9, 'stroke-linecap': 'round' }, s);
      const L0 = path.getTotalLength();
      const ang = Math.atan2(y1 - my, x1 - mx), hl = 34;
      const head = sv('path', { d: `M ${x1 - hl * Math.cos(ang - 0.5)} ${y1 - hl * Math.sin(ang - 0.5)} L ${x1} ${y1} L ${x1 - hl * Math.cos(ang + 0.5)} ${y1 - hl * Math.sin(ang + 0.5)}`,
        fill: 'none', stroke: col, 'stroke-width': A.width || 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
      path.setAttribute('stroke-dasharray', L0);
      return { L, path, L0, head };
    },
    update(st, t) {
      if (t < A.s || t >= A.e) return false;
      const p = E.inOutCubic(prog(t, A.s, A.draw || 0.35));
      st.path.setAttribute('stroke-dashoffset', (st.L0 * (1 - p)).toFixed(1));
      st.head.style.opacity = p >= 0.98 ? 1 : 0;
      st.L.style.opacity = (1 - prog(t, A.e - 0.15, 0.15)).toFixed(3);
      return true;
    },
    fast() { return false; },
    boxes() { return []; },
  };
}
function callout(Co, ctx) {
  init(ctx);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const [x0, y0, x1, y1] = Co.box;
      const s = sv('svg', { width: 1080, height: 1920, style: 'position:absolute;left:0;top:0;overflow:visible' }, L);
      const r = Co.round ?? 18;
      const rect = sv('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: r, fill: 'none', stroke: c('accent'), 'stroke-width': 6,
        style: `filter: drop-shadow(0 0 8px ${c('accent')})` }, s);
      const per = 2 * (x1 - x0 + y1 - y0);
      rect.setAttribute('stroke-dasharray', per);
      let lab = null;
      if (Co.label) {
        lab = skin(L, 'tag');
        Object.assign(lab.box.style, { position: 'absolute', left: px(x0), top: px(y1 + 14) });
        el('div', null, lab.content, Object.assign({ fontSize: '40px', whiteSpace: 'nowrap' }, font('body')), Co.label);
      }
      return { L, rect, per, lab };
    },
    update(st, t) {
      if (t < Co.s || t >= Co.e) return false;
      st.rect.setAttribute('stroke-dashoffset', (st.per * (1 - E.inOutCubic(prog(t, Co.s, 0.3)))).toFixed(1));
      if (st.lab) applyMotion(st.lab.box, t, Co.s + 0.2, Co.e, { rot: -2 });
      st.L.style.opacity = (1 - prog(t, Co.e - 0.15, 0.15)).toFixed(3);
      return true;
    },
    fast() { return false; },
    boxes(st) { return st.lab ? [{ el: st.lab.box, text: Co.label }] : []; },
  };
}

// ---------------------------------------------------------------- 13. Стикер: свободная надпись
function sticker(Sk, ctx) {
  init(ctx);
  ctx.sfx(Sk.s, 'pop', Sk.id);
  return {
    mount(root) {
      const L = el('div', null, root, { position: 'absolute', left: 0, top: 0 });
      const S = skin(L, Sk.variant === 'paper' ? 'main' : Sk.variant === 'tag' ? 'tag' : 'accent');
      el('div', null, S.content, Object.assign({ fontSize: px(Sk.size || 64), lineHeight: '1', whiteSpace: 'nowrap' }, font('head')), caseOf(Sk.text));
      const r = S.box.getBoundingClientRect();
      Object.assign(S.box.style, { position: 'absolute', left: px(clamp((Sk.x ?? 540) - r.width / 2, SAFE.x0, SAFE.x1 - r.width)), top: px((Sk.y ?? 1100) - r.height / 2) });
      return { L, S };
    },
    update(st, t) {
      if (t < Sk.s || t >= Sk.e) return false;
      applyMotion(st.S.box, t, Sk.s, Sk.e, { rot: Sk.rotate ?? -4, ph: 0.5 });
      setShine(st.S, t, Sk.s + 0.4);
      return true;
    },
    fast(st, t) { return fastWin(t, Sk.s, Sk.e); },
    boxes(st) { return [{ el: st.S.box, text: Sk.text }]; },
  };
}

export default {
  name: 'base',
  css: [],
  fonts: [],
  elements: { hook, question: hook, lead, block, sphere: block, loop, list, cta, answer: cta, emotion, accent, captions, progress, counter,
    reaction, comment, arrow, callout, sticker },
};
