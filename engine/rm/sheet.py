"""Листы кадров для приёмки глазами: весь ролик через 0,25 с + каждый кадр на появлениях накладок и на склейках.

  sheets/every025_NN.jpg — шаг 0,25 с;  sheets/events_NN.jpg — окна ±3 кадра вокруг SFX-событий (появлений) и склеек.
На каждом кадре — номер и время.
"""
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .common import FONTS, load_json, log


def grab(video, frames, w, h):
    sel = '+'.join('eq(n\\,%d)' % n for n in frames)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', "select='%s',scale=%d:%d" % (sel, w, h), '-vsync', '0',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def tiles(video, frames, outdir, tag, fps, cols=6, rows=3, w=270, h=480):
    os.makedirs(outdir, exist_ok=True)
    try:
        font = ImageFont.truetype(os.path.join(FONTS, 'Inter-Bold.otf'), 20)
    except Exception:
        font = ImageFont.load_default()
    per = cols * rows
    paths = []
    for p in range(0, len(frames), per):
        chunk = frames[p:p + per]
        imgs = grab(video, chunk, w, h)
        sh = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
        d = ImageDraw.Draw(sh)
        for i, im in enumerate(imgs):
            x, y = (i % cols) * w, (i // cols) * h
            sh.paste(Image.fromarray(im), (x, y))
            n = chunk[i]
            d.rectangle([x, y, x + 160, y + 26], fill=(0, 0, 0))
            d.text((x + 4, y + 2), '#%d %.2fs' % (n, n / fps), fill=(255, 230, 0), font=font)
        fp = os.path.join(outdir, '%s_%02d.jpg' % (tag, p // per + 1))
        sh.save(fp, quality=84)
        paths.append(fp)
    return paths


def run_sheet(video, work, outdir, step=0.25, events=True):
    plan = load_json(os.path.join(work, 'plan.json'))
    fps, N = plan['fps'], plan['N']
    k = max(1, int(round(step * fps)))
    every = sorted(set(list(range(0, N, k)) + [N - 1]))
    out = tiles(video, every, outdir, 'every%03d' % int(step * 100), fps)
    if events:
        marks = set()
        evp = os.path.join(work, 'sfx_events.json')
        if os.path.exists(evp):
            marks |= {e['frame'] for e in load_json(evp) if 'frame' in e}
        marks |= {round(c * fps) for c in plan['cuts']} | {plan['hold_f']}
        win = sorted({m + d for m in marks for d in range(-3, 4) if 0 <= m + d < N})
        out += tiles(video, win, outdir, 'events', fps)
    for p in out:
        log('лист: ' + p)
    return out
