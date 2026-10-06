"""Стоп-кадр + основа + камера + накладки + переходы → video.mp4 (H.264 yuv420p BT.709, без звука).

Камера и переходы — данные стиля (style.json: camera, transitions), моменты — из плана:
  масштаб плана (маскирует склейки внутри локации), панч-ин на ключевых словах, тряска на ударе,
  whip на швах этапов (до или после накладок), вспышка (сплошной цвет или радиальный засвет), вспышка на выходе из стоп-кадра.
У стиля premium под стеклянными плашками видео размывается («матовое стекло», camera.frost).
"""
import json
import math
import os
import subprocess

import cv2
import numpy as np
from PIL import Image

from .common import H, W, die, heavy_lock, load_json, log, tl_path
from . import styles as S


def clamp(x, a=0.0, b=1.0):
    return min(b, max(a, x))


EASE = {
    'outCubic': lambda p: 1 - (1 - p) ** 3,
    'inOutCubic': lambda p: 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2,
    'linear': lambda p: p,
}


def ease(name):
    n, _, arg = str(name).partition(':')
    if n == 'outBack':
        s = float(arg or 1.70158)
        return lambda p: 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2
    return EASE.get(n, EASE['outCubic'])


def seam_times(plan, sel):
    out = []
    for spec in sel or []:
        kind, _, idx = spec.partition(':')
        for sm in plan.get('seams', []):
            if sm['kind'] == kind and (idx == '' or int(idx) == sm['i']):
                out.append(sm['t'])
    return sorted(set(out))


class Camera:
    def __init__(self, plan, style, meta):
        self.p, self.fps = plan, plan['fps']
        self.cam = style.get('camera', {})
        tr = style.get('transitions', {})
        self.hold_f = plan['hold_f']
        self.whip = tr.get('whip') or {}
        self.whips = [round(t * self.fps) for t in sorted(set(seam_times(plan, self.whip.get('at'))
                                                               + list((meta.get('CAM') or {}).get('whips', []))))]
        self.wtab = {int(k): v for k, v in (self.whip.get('table') or {}).items()}
        self.flash = tr.get('flash') or {}
        self.flashes = sorted(set(seam_times(plan, self.flash.get('at')) + list((meta.get('CAM') or {}).get('flashes', []))))
        self.ff = tr.get('freeze_flash')
        col = self.flash.get('color', '#FFF6E0').lstrip('#')
        self.fcol = np.array([int(col[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
        self.radial = None
        if self.flash.get('radial'):
            self.radial = radial_image(self.flash['radial'])
        ffc = ((self.ff or {}).get('color') or self.flash.get('color', '#FFF6E0')).lstrip('#')
        self.ffcol = np.array([int(ffc[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
        sh = self.cam.get('shake') or {}
        self.shake = sh
        self.shake_f = round(plan['camera']['shake'] * self.fps) + int(sh.get('offset_f', 0)) if plan['camera'].get('shake') is not None else None
        self.pe = ease(self.cam.get('punch_ease', 'outCubic'))

    def seg(self, t):
        k = 0
        for i, s in enumerate(self.p['segments']):
            if t >= s['t0'] - 1e-6:
                k = i
        return k

    def tf(self, n):
        """→ (scale, cx, cy, dx, dy, blur_px) для кадра основы (n ≥ hold_f)."""
        t = n / self.fps
        k = self.seg(t)
        sg = self.p['segments'][k]
        cx, cy = sg['center']
        s = sg.get('scale', 1.0)
        c = self.cam
        lead = c.get('punch_lead_f', 0) / self.fps
        nfr = c.get('punch_frames', 5)
        rel = c.get('punch_release', 0)
        dx = dy = 0.0
        for a, b, sc in self.p['camera']['punches']:
            if a - lead <= t < b:
                s *= 1 + (sc - 1) * self.pe(clamp((t - a + lead) / (nfr / self.fps)))
            elif rel and b <= t < b + rel:
                s *= 1 + (sc - 1) * (1 - EASE['inOutCubic'](clamp((t - b) / rel)))
        ps = c.get('punch_shake')
        if ps:
            for a, b, sc in self.p['camera']['punches']:
                if self.shake_f is not None and abs(round(a * self.fps) - self.shake_f) <= 6:
                    continue
                kk = round((t - a) * self.fps)
                if 0 <= kk < ps.get('frames', 2):
                    d = 1 - kk / ps.get('frames', 2)
                    dx += ps.get('amp', 5) * d * math.sin(kk * 2.9 + .7)
                    dy += ps.get('amp', 5) * .6 * d * math.cos(kk * 3.7 + .2)
        blur = 0
        if self.wtab and not self.whip.get('post') and not self.whip.get('zoom'):
            for w in self.whips:
                d = n - w
                if d in self.wtab:
                    dx, blur = self.wtab[d]
                    s = max(s, self.whip.get('min_scale', 1.0))
        if self.shake_f is not None:
            sh = self.shake
            kk = n - self.shake_f
            if sh.get('kind') == 'table':
                tab = {int(x): v for x, v in sh.get('table', {}).items()}
                if kk in tab:
                    dx, dy = tab[kk]
                    s = s * sh.get('scale', 1.02)
            elif sh.get('kind') == 'sine':
                tau = kk / self.fps
                if 0 <= tau < sh.get('dur', 0.1):
                    A, dec = sh.get('amp', 7), sh.get('decay', 14)
                    dx += A * math.sin(2 * math.pi * 14 * tau + 0.6) * math.exp(-dec * tau)
                    dy += 0.6 * A * math.sin(2 * math.pi * 11 * tau + 1.7) * math.exp(-dec * tau)
                    s *= sh.get('scale', 1.02)
            elif sh.get('kind') == 'decay':
                fr = sh.get('frames', 3)
                if 0 <= kk < fr:
                    d = 1 - kk / fr
                    dx += sh.get('amp', 11) * d * math.sin(kk * 2.9 + .7)
                    dy += sh.get('amp', 11) * .6 * d * math.cos(kk * 3.7 + .2)
        return s, cx, cy, dx, dy, blur

    def pre_whip(self, img, n):
        """whip в стиле «зум + сдвиг + смаз» отдельным проходом до накладок (whip.zoom)."""
        if not self.whip.get('zoom') or self.whip.get('post'):
            return img
        for w in self.whips:
            d = n - w
            if d in self.wtab:
                dx, L = self.wtab[d]
                z = self.whip['zoom']
                M = np.float32([[z, 0, -(z - 1) / 2 * W + dx], [0, z, -(z - 1) / 2 * H]])
                img = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                return cv2.blur(img, (int(L), 1))
        return img

    def post(self, img, n):
        t = n / self.fps
        out = img
        if self.whip.get('post'):
            for w in self.whips:
                d = n - w
                if d in self.wtab:
                    dx, L = self.wtab[d]
                    out = cv2.warpAffine(out, np.float32([[1, 0, dx], [0, 1, 0]]), (W, H), borderMode=cv2.BORDER_REFLECT)
                    out = cv2.blur(out, (int(L), 1))
                    break
        a = 0.0
        fl = self.flash
        if fl.get('table'):
            tab = {int(k): v for k, v in fl['table'].items()}
            for at in self.flashes:
                d = n - round(at * self.fps)
                if d in tab:
                    a = max(a, tab[d])
        else:
            rf = fl.get('rise_f', 2)
            for at in self.flashes:
                d = t - at
                if -rf / self.fps <= d < 0:
                    a = max(a, fl.get('peak', 0.9) * EASE['outCubic'](clamp(1 + d * self.fps / rf)))
                elif 0 <= d <= fl.get('dur', 0.25):
                    a = max(a, fl.get('peak', 0.9) * math.exp(-d / fl.get('tau', 0.07)))
        if a >= 0.01:
            if self.radial is not None:
                al = self.radial[:, :, 3:4] * a
                out = np.round(out.astype(np.float32) * (1 - al) + self.radial[:, :, :3] * al).clip(0, 255).astype(np.uint8)
            else:
                out = np.round(out.astype(np.float32) * (1 - a) + self.fcol * a).clip(0, 255).astype(np.uint8)
        if self.ff and self.hold_f:
            tab = {int(k): v for k, v in self.ff.get('table', {}).items()}
            d = n - self.hold_f
            if d in tab:
                out = np.round(out.astype(np.float32) * (1 - tab[d]) + self.ffcol * tab[d]).clip(0, 255).astype(np.uint8)
        return out


def radial_image(spec):
    """CSS radial-gradient(rx% ry% at cx% cy%, стопы) → RGBA float (H, W, 4), альфа 0…1."""
    rx, ry = spec.get('size', [0.9, 0.6])
    cx, cy = spec.get('at', [0.5, 0.4])
    stops = spec['stops']          # [[pos, [r,g,b,a]], ...]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - cx * W) / (rx * W)) ** 2 + ((yy - cy * H) / (ry * H)) ** 2)
    out = np.zeros((H, W, 4), np.float32)
    pos = np.array([s[0] for s in stops], np.float32)
    for ch in range(4):
        vals = np.array([s[1][ch] for s in stops], np.float32)
        out[:, :, ch] = np.interp(r, pos, vals)
    return out


def frost(fr, o, y0, y1, x0, x1):
    """Матовое стекло: под полупрозрачными частями накладки (альфа ≈ 0,3–0,52 и выше) видео размыто."""
    A = o[y0:y1, x0:x1, 3].astype(np.float32) / 255.0
    m = np.clip((A - 0.30) / 0.22, 0, 1)
    if m.max() <= 0:
        return np.array(fr, copy=True)
    m = m * m * (3 - 2 * m)
    pad = 48
    Y0, Y1, X0, X1 = max(0, y0 - pad), min(H, y1 + pad), max(0, x0 - pad), min(W, x1 + pad)
    roi = fr[Y0:Y1, X0:X1]
    sm = cv2.resize(roi, ((X1 - X0) // 4 or 1, (Y1 - Y0) // 4 or 1), interpolation=cv2.INTER_AREA)
    sm = cv2.GaussianBlur(sm, (0, 0), 4.5)
    bl = cv2.resize(sm, (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_LINEAR)[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0].astype(np.float32)
    out = np.array(fr, copy=True)
    out[y0:y1, x0:x1] = np.round(fr[y0:y1, x0:x1].astype(np.float32) * (1 - m[..., None]) + bl * m[..., None]).clip(0, 255).astype(np.uint8)
    return out


def over(img, ov, use_frost):
    A = ov[:, :, 3]
    rows = np.flatnonzero(A.any(axis=1))
    if not len(rows):
        return img
    cols = np.flatnonzero(A[rows[0]:rows[-1] + 1].any(axis=0))
    y0, y1, x0, x1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
    out = frost(img, ov, y0, y1, x0, x1) if use_frost else np.array(img, copy=True)
    al = ov[y0:y1, x0:x1, 3:4].astype(np.float32) / 255.0
    out[y0:y1, x0:x1] = np.round(out[y0:y1, x0:x1].astype(np.float32) * (1 - al) + ov[y0:y1, x0:x1, :3].astype(np.float32) * al).clip(0, 255).astype(np.uint8)
    return out


def apply_cam(img, s, cx, cy, dx, dy, blur, interp):
    if s == 1.0 and dx == 0 and dy == 0 and blur == 0:
        return img
    M = np.array([[s, 0, cx - s * cx + dx], [0, s, cy - s * cy + dy]], np.float32)
    out = cv2.warpAffine(img, M, (W, H), flags=interp, borderMode=cv2.BORDER_REFLECT)
    if blur:
        out = cv2.blur(out, (int(blur) | 1, 1))
    return out


def run_compose(tl, tlfile, style, work, frames=None, png_dir=None, until=None, out=None, crf=16, lock=None, no_overlay=False):
    plan = load_json(os.path.join(work, 'plan.json'))
    st = S.load(style)
    meta = load_json(os.path.join(work, 'meta.json')) if os.path.exists(os.path.join(work, 'meta.json')) else {}
    cam = Camera(plan, st, meta)
    interp = cv2.INTER_LANCZOS4 if st.get('camera', {}).get('interp') == 'lanczos' else cv2.INTER_CUBIC
    use_frost = bool(st.get('camera', {}).get('frost'))
    N, ff = plan['N'], plan['hold_f']
    lo, hi = 0, N
    if frames:
        lo, hi = [int(x) for x in frames.split('-')]
        hi += 1
    if until is not None:
        hi = min(hi, int(round(until * plan['fps'])))
    base = tl_path(tlfile, tl['base'])
    fz_path = plan.get('freeze_image')
    frz = np.ascontiguousarray(np.asarray(Image.open(fz_path).convert('RGB').resize((W, H)))) if ff else None
    fb = W * H * 3
    bp = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', base, '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-'],
                          stdout=subprocess.PIPE, bufsize=fb * 2)
    ovp = None
    ovf = os.path.join(work, 'overlay.mov')
    if not no_overlay:
        if not os.path.exists(ovf):
            die('нет overlay.mov — сначала render')
        ovp = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', ovf, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], stdout=subprocess.PIPE, bufsize=W * H * 8)
    enc = None
    target = out or os.path.join(work, 'video.mp4')
    tmp = os.path.join(os.path.dirname(target), '.' + os.path.basename(target) + '.part.mp4')
    with heavy_lock(lock):
        if not png_dir:
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(plan['fps']), '-i', '-',
                                    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium',
                                    '-crf', str(crf), '-threads', '4', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                                    '-color_range', 'tv', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
        else:
            os.makedirs(png_dir, exist_ok=True)
        written = 0
        for n in range(hi):
            if n < ff:
                b = frz
            else:
                raw = bp.stdout.read(fb)
                if len(raw) < fb:
                    die('основа кончилась на кадре %d' % n)
                b = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
            ov = None
            if ovp:
                ovr = ovp.stdout.read(W * H * 4)
                if len(ovr) < W * H * 4:
                    die('накладки кончились на кадре %d (рендер короче?)' % n)
                ov = np.frombuffer(ovr, np.uint8).reshape(H, W, 4)
            if n < lo:
                continue
            img = b if n < ff else apply_cam(b, *cam.tf(n), interp)
            if n >= ff:
                img = cam.pre_whip(img, n)
            if ov is not None:
                img = over(img, ov, use_frost)
            img = cam.post(img, n)
            if enc:
                enc.stdin.write(np.ascontiguousarray(img).tobytes())
            else:
                Image.fromarray(img).save(os.path.join(png_dir, 'v%05d.jpg' % n), quality=92)
            written += 1
            if n % 150 == 0:
                log('compose: кадр %d/%d' % (n, hi))
        for p in (bp, ovp):
            if p:
                p.kill()
        if enc:
            enc.stdin.close()
            if enc.wait():
                die('x264 не дописал видео')
            os.replace(tmp, target)
    log('compose: записано кадров %d' % written)
    if not frames and until is None and written != N:
        die('кадров %d ≠ %d' % (written, N))
    json.dump({'frames': written, 'whips': cam.whips, 'flashes': cam.flashes}, open(os.path.join(work, 'compose.json'), 'w'))
    return target
