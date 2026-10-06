"""Лицо по планам основы: Haar frontalface на каждом 5-м кадре в верхней части кадра → медианная рамка плана.

faces.json: {"freeze": [x0,y0,x1,y1] | null, "segments": [{"seg", "t0", "t1", "n", "med": [...], "box": [...], "center": [cx, cy]}]}
  med — медиана детекций (центр камеры: пунш-ин и масштаб плана — вокруг него);
  box — med + запас 6 % (накладки с непрозрачностью ≥ 0,5 её не пересекают — проверяет qa).
Времена t0/t1 — шкала основы (без стоп-кадра).
"""
import subprocess

import cv2
import numpy as np

from .common import H, W, log, save_json

STEP = 5
TOP = 0.58        # ищем в верхних 58 % кадра: ниже — руки, стол, колени (ложные срабатывания)


def detector():
    return cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')


def detect(gray_half, cas):
    top = int(gray_half.shape[0] * TOP)
    f = cas.detectMultiScale(gray_half[:top], 1.1, 6, minSize=(60, 60))
    if len(f) == 0:
        return None
    x, y, w, h = max(f, key=lambda r: r[2] * r[3])
    return (x * 2, y * 2, (x + w) * 2, (y + h) * 2)


def margin(b, m=0.06):
    x0, y0, x1, y1 = b
    w, h = x1 - x0, y1 - y0
    return [int(round(max(0, x0 - m * w))), int(round(max(0, y0 - m * h))), int(round(min(W, x1 + m * w))), int(round(min(H, y1 + m * h)))]


def run_faces(base, fps, cuts, total_frames, freeze_png=None):
    cas = detector()
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', base, '-vf', f"select='not(mod(n\\,{STEP}))',scale={W // 2}:{H // 2}",
                          '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H // 2, W // 2)
    bounds = [0] + [int(round(c * fps)) for c in cuts] + [total_frames]
    segs = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1]
        bs = [d for i in range(a, b) if i % STEP == 0 and i // STEP < len(frames) for d in [detect(frames[i // STEP], cas)] if d]
        if bs:
            arr = np.array(bs)
            med = [int(v) for v in np.median(arr, 0)]
        else:
            med = [W // 2 - 150, int(H * 0.28) - 180, W // 2 + 150, int(H * 0.28) + 180]
            log('план %d: лицо не найдено — рамка по умолчанию, проверьте глазами' % k)
        segs.append({'seg': k, 't0': round(a / fps, 4), 't1': round(b / fps, 4), 'n': len(bs), 'approx': not bs,
                     'med': med, 'box': margin(med), 'center': [round((med[0] + med[2]) / 2, 1), round((med[1] + med[3]) / 2, 1)]})
        log('план %d %.2f–%.2f: детекций %d, лицо %s' % (k, a / fps, b / fps, len(bs), med))
    fz = None
    if freeze_png:
        g = cv2.cvtColor(cv2.imread(freeze_png), cv2.COLOR_BGR2GRAY)
        d = detect(cv2.resize(g, (W // 2, H // 2)), cas)
        fz = margin(d) if d else None
    return {'freeze': fz, 'segments': segs}


def main(a, tl, tlfile):
    from .common import count_frames, tl_path
    base = tl_path(tlfile, tl['base'])
    fps = tl.get('fps', 30)
    n = count_frames(base)
    fz = tl.get('freeze') or {}
    res = run_faces(base, fps, tl.get('cuts', []), n, tl_path(tlfile, fz.get('image')) if fz.get('image') else None)
    out = a.out or tl_path(tlfile, tl.get('faces') or 'faces.json')
    save_json(res, out)
    print('faces → %s (%d планов)' % (out, len(res['segments'])))
