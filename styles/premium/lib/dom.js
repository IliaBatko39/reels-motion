export function el(tag, cls, parent, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (parent) parent.appendChild(e);
  return e;
}
export const px = v => Math.round(v * 100) / 100 + 'px';
export function show(e, on) { const v = on ? '' : 'none'; if (e.style.display !== v) e.style.display = v; }
// подгонка кегля: уменьшать size шагом 2, пока ширина > maxW (и size > minSize)
export function fitFont(e, size, minSize, maxW) {
  e.style.fontSize = size + 'px';
  while (e.scrollWidth > maxW && size > minSize) { size -= 2; e.style.fontSize = size + 'px'; }
  return size;
}
export const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
