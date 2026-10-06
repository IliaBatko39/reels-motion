"""Стили — данные. Папка стиля: style.json (+ по желанию свой модуль компонентов и CSS).

Где ищутся стили (первый найденный выигрывает):
  1. каталоги из REEL_STYLES (через «:»),
  2. ~/.reels-motion/styles — свои стили пользователя, обновление скилла их не трогает,
  3. styles/ в папке скилла — пресеты base, premium, sticker, kinetic.

style.json может наследовать другой стиль ("extends") — глубокое слияние, дочерний перекрывает.
"components" — какой модуль рисует какой тип элемента: имя стиля с модулем, "base" или "./путь.js" внутри своего стиля.
"""
import copy
import json
import os
import re

from .common import ENGINE, ROOT, STYLES, die

USER_STYLES = os.path.expanduser('~/.reels-motion/styles')


def search_dirs():
    out = [d for d in os.environ.get('REEL_STYLES', '').split(os.pathsep) if d]
    out += [USER_STYLES, STYLES]
    return [os.path.abspath(os.path.expanduser(d)) for d in out]


def all_styles():
    seen = {}
    for d in search_dirs():
        if not os.path.isdir(d):
            continue
        for n in sorted(os.listdir(d)):
            if n not in seen and os.path.exists(os.path.join(d, n, 'style.json')):
                seen[n] = os.path.join(d, n)
    return seen


def find(name):
    p = all_styles().get(name)
    if not p:
        die('стиль «%s» не найден. Есть: %s. Каталоги: %s' % (name, ', '.join(all_styles()), ', '.join(search_dirs())))
    return p


def merge(a, b):
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def raw(name):
    with open(os.path.join(find(name), 'style.json'), encoding='utf-8') as f:
        return json.load(f)


def load(name, _seen=None):
    """style.json с учётом extends (без вычисления модулей)."""
    _seen = _seen or []
    if name in _seen:
        die('стили наследуют друг друга по кругу: %s' % ' → '.join(_seen + [name]))
    s = raw(name)
    parent = s.get('extends')
    if parent:
        s = merge(load(parent, _seen + [name]), {k: v for k, v in s.items() if k != 'extends'})
    s['name'] = name
    return s


def slug(x):
    return re.sub(r'[^a-z0-9_-]+', '-', x.lower()).strip('-') or 'x'


def resolve(name):
    """→ стиль для страницы: токены, моушн, карта компонентов и URL модулей (их отдаёт сервер рендера)."""
    s = load(name)
    comps = dict(s.get('components') or {})
    modules = {'base': '/engine/page/base/base.js'}
    mapped = {}
    for typ, val in comps.items():
        if val == 'base':
            mapped[typ] = 'base'
        elif val.startswith('./'):
            key = slug(name + '-' + os.path.splitext(os.path.basename(val))[0])
            modules[key] = '/styles/%s/%s' % (name, val[2:])
            mapped[typ] = key
        else:
            mod = load(val).get('module')
            if not mod:
                die('стиль «%s»: компоненты «%s» берутся из стиля «%s», но у него нет своего модуля (поле module)' % (name, typ, val))
            owner = val
            # модуль ищем в папке стиля, где он объявлен (с учётом наследования)
            while 'module' not in raw(owner) and raw(owner).get('extends'):
                owner = raw(owner)['extends']
            modules[slug(val)] = '/styles/%s/%s' % (owner, mod)
            mapped[typ] = slug(val)
    s['components'] = mapped
    s['modules'] = modules
    return s


def style_path_for_url(url_path):
    """/styles/<имя>/… → реальный путь (для HTTP-сервера рендера)."""
    m = re.match(r'^/styles/([^/]+)/(.*)$', url_path)
    if not m:
        return None
    d = all_styles().get(m.group(1))
    if not d:
        return None
    return os.path.join(d, os.path.normpath(m.group(2)).lstrip('/'))


def list_styles():
    rows = []
    for n, d in all_styles().items():
        s = raw(n)
        where = 'пресет' if os.path.dirname(d) == STYLES else d
        rows.append((n, s.get('title', ''), s.get('description', ''), where))
    return rows


def new_style(name, src, dest_root=None, description=''):
    """Заготовка нового стиля: style.json, который наследует src и раскрывает все токены для правки."""
    if not re.match(r'^[a-z0-9][a-z0-9_-]*$', name):
        die('имя стиля — латиница, цифры, «-» и «_»: %r' % name)
    dest_root = os.path.abspath(os.path.expanduser(dest_root or os.environ.get('REEL_STYLE_HOME') or USER_STYLES))
    d = os.path.join(dest_root, name)
    if os.path.exists(os.path.join(d, 'style.json')):
        die('стиль уже есть: %s' % d)
    os.makedirs(d, exist_ok=True)
    full = load(src)
    tpl = {
        'title': name,
        'description': description or 'Новый стиль на основе «%s». Поменяйте токены; "components" — какой модуль рисует элемент.' % src,
        'extends': src,
        'components': {'*': 'base'} if src != 'base' else {},
        'tokens': full.get('tokens', {}),
        'motion': full.get('motion', {}),
        'captions': full.get('captions', {}),
        'camera': full.get('camera', {}),
        'transitions': full.get('transitions', {}),
        'audio': full.get('audio', {}),
    }
    with open(os.path.join(d, 'style.json'), 'w', encoding='utf-8') as f:
        json.dump(tpl, f, ensure_ascii=False, indent=2)
    return d


def engine_url_ok():
    return os.path.exists(os.path.join(ENGINE, 'page', 'base', 'base.js')) and os.path.isdir(ROOT)
