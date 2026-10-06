"""Типографика текстов накладок: «ёлочки», неразрывные пробелы после коротких слов и в числах, тире, «кешбэк»."""
import re

NB = ' '
SHORT = ['в', 'к', 'с', 'у', 'о', 'и', 'а', 'но', 'на', 'за', 'по', 'до', 'из', 'от', 'не', 'ни', 'что', 'как',
         'для', 'без', 'при']
UNITS = ['%', '₽', 'мин', 'с', 'ч', 'км', 'млн', 'тыс.']
_short = re.compile(r'(^|[\s' + NB + r'(«])(' + '|'.join(SHORT) + r') ', re.I)
_unit = re.compile(r'(\d) (' + '|'.join(re.escape(u) for u in UNITS) + r')(?![^\W\d_])')


def typo(s):
    if s is None:
        return s
    s = str(s)
    out, open_ = [], True
    for ch in s:
        if ch == '"':
            out.append('«' if open_ else '»')
            open_ = not open_
        else:
            out.append(ch)
    s = ''.join(out)
    s = re.sub(r'(\d)-(\d)', r'\1–\2', s)
    s = s.replace(' - ', ' — ')
    s = s.replace(' —', NB + '—')
    s = re.sub(r'([кК])эшбэк', lambda m: m.group(1) + 'ешбэк', s)
    s = _short.sub(lambda m: m.group(1) + m.group(2) + NB, s)
    s = _short.sub(lambda m: m.group(1) + m.group(2) + NB, s)
    s = _unit.sub(lambda m: m.group(1) + NB + m.group(2), s)
    s = re.sub(r'(\d) (\d{3})(?!\d)', lambda m: m.group(1) + NB + m.group(2), s)
    return s


def lint(s):
    errs = []
    if '"' in s:
        errs.append('прямая кавычка')
    if re.search(r'\d-\d', s):
        errs.append('дефис в диапазоне чисел')
    if re.search(r'кэшбэк', s, re.I):
        errs.append('«кэшбэк» → «кешбэк»')
    return errs
