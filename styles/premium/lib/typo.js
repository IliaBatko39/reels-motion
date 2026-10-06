// Типографика накладок (то же в tools/typo.py; resolve.py применяет заранее, здесь — идемпотентно).
const NB = ' ';
const SHORT = ['в','к','с','у','о','и','а','но','на','за','по','до','из','от','не','ни','что','как','для','без','при'];
const UNITS = ['%','₽','мин','с','ч','км','млн','тыс.'];
export function typo(s) {
  if (s == null) return s;
  s = String(s);
  let open = true;
  s = s.replace(/"/g, () => { const q = open ? '«' : '»'; open = !open; return q; });
  s = s.replace(/(\d)-(\d)/g, '$1–$2');
  s = s.replace(/ - /g, ' — ');
  s = s.replace(/ —/g, NB + '—');
  s = s.replace(/[кК]эшбэк/g, m => (m[0] === 'К' ? 'К' : 'к') + 'ешбэк');
  const shortRe = new RegExp('(^|[\\s' + NB + '(«])(' + SHORT.join('|') + ') ', 'giu');
  s = s.replace(shortRe, (m, a, w) => a + w + NB);
  s = s.replace(shortRe, (m, a, w) => a + w + NB);
  const unitRe = new RegExp('(\\d) (' + UNITS.map(u => u.replace('.', '\\.')).join('|') + ')(?![\\p{L}])', 'gu');
  s = s.replace(unitRe, '$1' + NB + '$2');
  s = s.replace(/(\d) (\d{3})(?!\d)/g, '$1' + NB + '$2');
  return s;
}
