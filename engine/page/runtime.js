// Рантайм страницы: plan.json (что и когда) + style.json (как выглядит) → элементы → window.setTime(t).
// Кадр — чистая функция времени. Стиль — данные: токены + карта «тип элемента → модуль компонентов».
// Модуль компонентов (базовый engine/page/base/base.js или модуль стиля) экспортирует:
//   { name, css: [...], fonts: [...], defs: '<svg>…</svg>', elements: { <тип>(spec, ctx) → компонент } }
// Компонент: { mount(root) → st, update(st, t) → видим?, fast(st, t) → нужен смаз?, boxes(st, t) → [{el, text}] }.
import * as lib from './lib.js';

const FALLBACK = { question: ['hook'], sphere: ['block'], answer: ['cta'], comment: [], counter: ['progress'] };

// plan.json → упорядоченный список элементов {type, id, ...}
export function specsFromPlan(P, ST) {
  const S = [];
  const push = (type, o, extra) => o && S.push(Object.assign({ type, id: o.id || type }, o, extra || {}));
  push('hook', P.hook);
  push('question', P.question);
  if (P.lead && P.lead.items && P.lead.items.length) push('lead', Object.assign({ id: 'lead' }, P.lead));
  (P.blocks || []).forEach((b, i) => push('block', b, { index: i, count: P.blocks.length }));
  (P.spheres || []).forEach((b, i) => push('sphere', b, { index: i, count: P.spheres.length }));
  (P.loops || []).forEach(l => push('loop', l));
  (P.lists || []).forEach(l => push('list', l));
  if (P.emotion) push('emotion', Object.assign({ id: 'emotion' }, P.emotion));
  if (P.cta) push('cta', Object.assign({ id: 'cta' }, P.cta));
  if (P.answer) push('answer', Object.assign({ id: 'answer' }, P.answer));
  (P.elements || []).forEach((e, i) => push(e.type, Object.assign({ id: e.id || (e.type + (i + 1)) }, e)));
  // постоянные элементы стиля (style.json → extras), например полоска прогресса или счётчик блоков
  for (const x of (ST && ST.extras) || []) if (!S.some(s => s.type === x)) push(x, { id: x });
  if (P.captions && P.captions.length) push('captions', { id: 'caps' });
  return S;
}

function cssVars(stage, tokens) {
  const walk = (o, pre) => {
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, pre + k + '-');
      else if (typeof v === 'string' || typeof v === 'number') stage.style.setProperty('--' + pre + k, String(v));
    }
  };
  walk(tokens || {}, '');
}

async function boot() {
  const q = new URLSearchParams(location.search);
  const P = await (await fetch(q.get('plan'))).json();
  const ST = await (await fetch(q.get('style'))).json();
  const stage = document.getElementById('stage');
  if (q.get('bg')) stage.classList.add('bg-' + q.get('bg'));
  cssVars(stage, ST.tokens);
  // модули компонентов, их CSS и SVG-defs
  const mods = {};
  for (const [name, url] of Object.entries(ST.modules)) {
    const m = (await import(url)).default;
    mods[name] = m;
    for (const c of m.css || []) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = new URL(c, new URL(url, location.href)).href;
      document.head.appendChild(l);
      await new Promise(r => { l.onload = r; l.onerror = r; });
    }
    if (m.defs) document.getElementById('defs').insertAdjacentHTML('beforeend', m.defs);
  }
  // свои шрифты стиля
  for (const f of (ST.tokens && ST.tokens.fonts && ST.tokens.fonts.faces) || []) {
    const ff = new FontFace(f.family, `url(${f.url})`, { weight: String(f.weight || 400), style: f.style || 'normal' });
    document.fonts.add(await ff.load());
  }
  const fams = new Set(['900 80px Inter']);
  for (const m of Object.values(mods)) for (const f of m.fonts || []) fams.add(f);
  for (const f of (ST.tokens && ST.tokens.fonts && ST.tokens.fonts.check) || []) fams.add(f);
  await Promise.all([...fams].map(f => document.fonts.load(f, 'АЯаяQ09№→—')));
  await document.fonts.ready;
  const miss = [...fams].filter(f => !document.fonts.check(f, 'Аа'));
  if (miss.length) throw new Error('шрифты не загрузились: ' + miss.join(', '));

  const SFX = [], CAM = { whips: [], flashes: [] };
  const ctx = {
    plan: P, style: ST, tokens: ST.tokens || {}, motion: ST.motion || {}, fps: P.fps, lib,
    sfx: (t, type, layer, extra) => SFX.push(Object.assign({ t: +(+t).toFixed(4), type, layer }, extra || {})),
  };
  const pick = type => {
    const chain = [type, ...(FALLBACK[type] || [])];
    for (const ty of chain) {
      const name = (ST.components || {})[ty] || (ST.components || {})['*'] || 'base';
      const m = mods[name];
      if (m && m.elements && m.elements[ty]) return [name, m.elements[ty]];
    }
    for (const ty of chain) if (mods.base && mods.base.elements[ty]) return ['base', mods.base.elements[ty]];
    return [null, null];
  };
  const items = [];
  for (const spec of specsFromPlan(P, ST)) {
    const [name, factory] = pick(spec.type);
    if (!factory) { console.warn('нет компонента для типа ' + spec.type); continue; }
    const wrap = lib.el('div', 'layer s-' + name, stage);
    wrap.dataset.layer = spec.id;
    const C = factory(spec, ctx);
    const st = C.mount(wrap);
    items.push({ id: spec.id, type: spec.type, mod: name, C, st, wrap });
  }
  SFX.sort((a, b) => a.t - b.t);
  window.SFX = SFX;
  window.CAM = CAM;
  window.ELEMENTS = items.map(i => ({ id: i.id, type: i.type, module: i.mod }));
  window.T = { fps: P.fps, N: P.N, duration: P.duration };
  window.setTime = t => {
    let n = 0;
    for (const it of items) {
      const v = !!it.C.update(it.st, t);
      lib.show(it.wrap, v);
      if (v) n++;
    }
    return n;
  };
  // смаз нужен, если элемент был виден на прошлом вызове setTime и в момент t он во входе/выходе
  window.fastAt = t => items.some(it => (it.C.fastAlways || it.wrap.style.display !== 'none') && it.C.fast && it.C.fast(it.st, t));
  window.layoutBoxes = t => {
    const out = [];
    for (const it of items) {
      if (it.wrap.style.display === 'none' || !it.C.boxes) continue;
      for (const b of it.C.boxes(it.st, t)) {
        if (!b.el || b.el.style.display === 'none') continue;
        const r = b.el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        let op = 1;
        for (let e = b.el; e && e !== stage; e = e.parentElement) {
          if (e.style && e.style.display === 'none') { op = 0; break; }
          const o = parseFloat(getComputedStyle(e).opacity); op *= isNaN(o) ? 1 : o;
        }
        if (b.opacity != null) op = Math.min(op, b.opacity);
        if (op <= 0.001) continue;
        out.push({ id: it.id, type: it.type, kind: b.kind || 'text', text: b.text || '', x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, opacity: +op.toFixed(3) });
      }
    }
    return out;
  };
  window.setTime(0);
  window.sceneReady = true;
}

boot().catch(e => { console.error('boot: ' + (e && e.stack || e)); window.bootError = String(e && e.message || e); });
