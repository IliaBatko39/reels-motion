// Стиль «premium» — премиум-минимал: тёмное стекло с тонкой светлой обводкой, тёплый акцент, контурные цифры,
// раскрытие из-под маски по словам и буквам, мягкие пружины. Под стеклом compose размывает видео (camera.frost).
// Компоненты — components.js (контракт mount(root, layer, ctx) / update / fast / boxes); здесь — привязка к plan.json.
import V1 from './components.js';

const F = 1 / 30;

// компонент premium → компонент рантайма
function wrap(C, L, pctx) {
  return {
    mount(root) { root.style.zIndex = String(L.z || 30); return C.mount(root, L, pctx); },
    update(st, t) { return C.update(st, t, pctx); },
    fast(st, t) { return C.fast ? C.fast(st, t) : false; },
    boxes(st, t) { return (C.boxes ? C.boxes(st, t, pctx) : []).filter(b => b.opacity == null || b.opacity > 0); },
  };
}

function pctxOf(ctx) {
  const P = ctx.plan;
  if (!ctx._premium) {
    const blocks = (P.template === 'B' ? P.spheres : P.blocks) || [];
    ctx._premium = { fps: P.fps, duration: P.duration, stages: blocks.map(b => ({ kind: 'block', start: b.s, end: b.e })) };
  }
  return ctx._premium;
}

// конец заголовка блока: 3,07 с, а если в блоке начинается список — 2,13 с (список занимает место)
function titleEnd(P, b) {
  const lists = (P.lists || []).filter(L => L.s >= b.s && L.s < b.e);
  return Math.min(b.e, b.s + (lists.length ? 2.13 : 3.07));
}

const two = n => (String(n).length < 2 ? '0' + n : String(n));

function hook(h, ctx) {
  const P = ctx.plan;
  const lines = h.kicker || h.number ? [[h.kicker, h.number].filter(Boolean).join(' '), ...h.lines] : h.lines;
  const tip = P.tip && h.pointer !== false ? [P.tip[0] - 18, P.tip[1] - 3] : null;
  ctx.sfx(h.s, 'ping', h.id);
  return wrap(V1.glass_hook, { id: h.id, start: h.s, end: h.e, z: 30, params: { tip, lines, sub: h.sub, hold: P.hold } }, pctxOf(ctx));
}

function block(b, ctx) {
  const P = ctx.plan;
  const S = b.s + 0.04, E = titleEnd(P, b);
  return wrap(V1.block_title, { id: b.id, start: S, end: E, z: 30, params: { num: two(b.num), term: b.term.toUpperCase(), sub: b.expl.join(' ') } }, pctxOf(ctx));
}

function cta(c, ctx) {
  const S = c.tag_t - F, tw = c.word_t - F;
  ctx.sfx(tw, 'hit', c.id);
  return wrap(V1.cta_glass, { id: c.id, start: S, end: ctx.plan.duration + 1, z: 30,
    params: { word: c.word.toUpperCase(), caption: c.caption || ' ', t_word: tw } }, pctxOf(ctx));
}

export default {
  name: 'premium',
  css: ['premium.css'],
  fonts: ['900 76px Inter', '800 40px Inter', '700 40px Inter'],
  elements: {
    hook,
    question: hook,
    lead(L, ctx) {
      const P = ctx.plan;
      const blocks = (P.template === 'B' ? P.spheres : P.blocks) || [];
      const rows = L.items.map((it, i) => ({ num: two(i + 1), pre: (it.qual || '').toUpperCase(), term: it.term.toUpperCase(), t_pre: it.q_t, t_term: it.t_t }));
      for (const r of rows) ctx.sfx(r.t_pre, 'click', L.id);
      const end = blocks.length ? blocks[0].s : L.e;
      return wrap(V1.reason_list, { id: L.id, start: rows[0].t_pre, end, z: 30, params: { rows } }, pctxOf(ctx));
    },
    progress(spec, ctx) {
      const P = ctx.plan;
      const start = spec.s != null ? spec.s : (P.hook || P.question || { e: 0 }).e;
      const loops = (P.loops || []).map(l => {
        const blocks = P.blocks || [];
        const next = blocks.findIndex(b => b.s >= l.e - 1e-3);
        return { start: l.s, end: l.e, next };
      });
      ctx.sfx(start, 'swish', spec.id);
      const arm = P.lead ? P.lead.items.map(i => i.t_t) : null;
      return wrap(V1.seg_bar, { id: spec.id, start, end: P.duration + 1, z: 50, params: { arm, loops } }, pctxOf(ctx));
    },
    block,
    sphere: block,
    loop(l, ctx) {
      ctx.sfx(l.e, 'riser', l.id, { dur: Math.min(1.2, l.e - l.s) });
      return wrap(V1.loop_pill, { id: l.id, start: l.s, end: l.e, z: 30, params: { text: l.text } }, pctxOf(ctx));
    },
    list(L, ctx) {
      const P = ctx.plan;
      const b = ((P.template === 'B' ? P.spheres : P.blocks) || []).find(x => L.s >= x.s && L.s < x.e);
      const te = b ? titleEnd(P, b) : -1;
      const items = L.items.map((it, i) => ({ label: it.text.toUpperCase(), icon: it.icon in ICONS ? it.icon : 'check', t: Math.max(it.t, te + 3 * F * i) }));
      return wrap(V1.chip_stack, { id: L.id, start: items[0].t, end: L.e, z: 30, params: { items } }, pctxOf(ctx));
    },
    cta,
    answer: cta,
    captions(spec, ctx) {
      const P = ctx.plan;
      const cards = P.captions.map(c => ({ start: c.s, end: c.e,
        words: c.words.map(i => ({ text: P.words[i].text, accent: P.words[i].acc, start: P.words[i].s })) }));
      return wrap(V1.captions_v1, { id: 'caps', start: 0, end: P.duration + 1, z: 40, params: { cards, suppress: P.captions_suppress } }, pctxOf(ctx));
    },
  },
};

const ICONS = { heart: 1, globe: 1, phone: 1, grid: 1, tag: 1, gift: 1, check: 1, star: 1 };
