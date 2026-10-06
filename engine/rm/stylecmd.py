"""Команды стилей: styles (список и превью), style-new (заготовка), style-test (тест на 3–4 с)."""
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .common import FONTS, H, W, die, load_json, log
from . import styles as S

PREVIEW_T = (0.0, 2.85, 3.95)           # стоп-кадр с плашкой · лид с субтитрами · призыв (тестовый проект, шкала выхода)


def _font(sz):
    try:
        return ImageFont.truetype(os.path.join(FONTS, 'Inter-Bold.otf'), sz)
    except Exception:
        return ImageFont.load_default()


def _base_frame(proj, plan, n):
    if n < plan['hold_f']:
        return np.asarray(Image.open(plan['freeze_image']).convert('RGB').resize((W, H))).astype(np.float32)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(proj, 'base.mov'), '-vf', "select='eq(n\\,%d)'" % (n - plan['hold_f']),
                          '-vsync', '0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)


def keyframes(style, proj, times=PREVIEW_T, lock=None):
    """Кадры стиля на тестовом проекте: накладки поверх фона, без камеры. → [PIL.Image]."""
    from . import plan as PL, render as RD
    tlp = os.path.join(proj, 'timeline.json')
    tl = load_json(tlp)
    work = os.path.join(proj, 'work', style)
    os.makedirs(work, exist_ok=True)
    plan = PL.build(tl, tlp, style)
    from .common import save_json
    save_json(plan, os.path.join(work, 'plan.json'))
    frames = [min(plan['N'] - 1, int(round(t * plan['fps']))) for t in times]
    png = os.path.join(work, 'png')
    RD.run_render(style, work, ','.join(map(str, frames)), png, lock=lock)
    out = []
    for n in frames:
        bg = _base_frame(proj, plan, n)
        o = np.asarray(Image.open(os.path.join(png, 'f%05d.png' % n)).convert('RGBA')).astype(np.float32)
        a = o[:, :, 3:4] / 255
        out.append(Image.fromarray((bg * (1 - a) + o[:, :, :3] * a).astype(np.uint8)))
    return out


def sheet_of(rows, out, tw=300):
    th = int(tw * H / W)
    cols = max(len(r[1]) for r in rows)
    lab = 62
    img = Image.new('RGB', (cols * tw, len(rows) * (th + lab)), (18, 18, 20))
    d = ImageDraw.Draw(img)
    for i, (title, ims) in enumerate(rows):
        y = i * (th + lab)
        d.text((10, y + 8), title, fill=(255, 220, 0), font=_font(26))
        for j, im in enumerate(ims):
            img.paste(im.resize((tw, th), Image.LANCZOS), (j * tw, y + lab))
    img.save(out, quality=88)
    return out


def cache_project(root=None):
    from .demo import make_project
    root = root or os.path.join(os.environ.get('XDG_CACHE_HOME', os.path.expanduser('~/.cache')), 'reels-motion', 'preview')
    if not os.path.exists(os.path.join(root, 'timeline.json')):
        make_project(root, 'test')
    return root


def cmd_styles(a):
    rows = S.list_styles()
    for n, title, desc, where in rows:
        print('%-12s %s — %s%s' % (n, title, desc[:110] + ('…' if len(desc) > 110 else ''), '' if where == 'пресет' else '  [%s]' % where))
    print('\nКаталоги стилей: ' + ', '.join(S.search_dirs()))
    if not a.preview:
        return
    names = [x for x in (a.only.split(',') if a.only else [r[0] for r in rows]) if x]
    proj = cache_project(os.path.join(a.out, 'project') if a.out else None)
    shots = []
    for n in names:
        log('превью: %s …' % n)
        shots.append(('%s — %s' % (n, S.raw(n).get('title', '')), keyframes(n, proj)))
    out = os.path.join(a.out or proj, 'styles_preview.jpg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet_of(shots, out)
    print('Превью стилей (стоп-кадр с плашкой · лид · призыв): ' + out)


def cmd_new(a):
    d = S.new_style(a.name, a.src, a.dir, a.description)
    if a.keep_components:
        p = os.path.join(d, 'style.json')
        s = load_json(p)
        s.pop('components', None)
        json.dump(s, open(p, 'w'), ensure_ascii=False, indent=2)
    print('Стиль создан: %s/style.json' % d)
    print('Дальше: поправьте tokens / motion / captions / camera / transitions / audio и запустите  reel.py style-test %s' % a.name)
    if a.dir and os.path.abspath(a.dir) not in S.search_dirs():
        print('Папка вне путей поиска — добавьте её: export REEL_STYLES=%s' % os.path.abspath(a.dir))


def cmd_test(a):
    """Тест 3–4 с: стоп-кадр с плашкой → лид → субтитры → призыв. Видео + лист кадров через 0,25 с."""
    from . import audio, compose, finalize, plan as PL, render as RD, sheet as SH
    from .demo import make_project
    S.find(a.name)
    out = os.path.abspath(a.out or os.path.join(os.getcwd(), 'style-test-' + a.name))
    tlp = make_project(out, 'test', a.project)
    tl = load_json(tlp)
    work = os.path.join(out, 'work', a.name)

    class Args:
        pass
    pa = Args()
    pa.style, pa.work, pa.verbose = a.name, work, False
    PL.main(pa, tl, tlp)
    RD.run_render(a.name, work)
    compose.run_compose(tl, tlp, a.name, work)
    audio.run_audio(tl, tlp, a.name, work)
    res = finalize.run_finalize(work, out, 'test_' + a.name, tg=False)
    sheets = SH.run_sheet(res['master.wav'], work, os.path.join(out, 'sheets'), step=0.25, events=False)
    print('Тест стиля «%s»: %s' % (a.name, res['master.wav']))
    print('Кадры через 0,25 с: ' + ', '.join(sheets))
    print('Покажите кадры пользователю. Полный рендер — только после его «ок».')
