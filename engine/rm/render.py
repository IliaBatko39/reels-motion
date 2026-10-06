"""Страница стиля → overlay.mov (qtrle ARGB, прозрачный фон) + boxes.json (рамки текстов по кадрам) + meta.json (SFX, камера).

Кадр = window.setTime(t) — чистая функция времени. Размытие в движении: на кадрах, где window.fastAt(t), снимается
4 подкадра в пределах затвора (shutter из style.json) и усредняется в предумноженной альфе. Только на входах и выходах,
CSS filter: blur на весь кадр не используется.

Один Chromium на процесс; закрываем только свой (PID — в work/chromium.pid).
"""
import http.server
import io
import json
import os
import socketserver
import subprocess
import threading
import time
import urllib.parse

import numpy as np
from PIL import Image

from .common import H, ROOT, W, die, heavy_lock, log, save_json
from . import styles as S

SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FONT_ARGS = ['--font-render-hinting=none', '--disable-lcd-text']


class _Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.json': 'application/json', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2'}
    work = None

    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if p.startswith('/work/'):
            return os.path.join(self.work, os.path.normpath(p[len('/work/'):]).lstrip('/'))
        if p.startswith('/styles/'):
            r = S.style_path_for_url(p)
            if r:
                return r
        return os.path.join(ROOT, os.path.normpath(p).lstrip('/'))

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class _Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Page:
    """Страница стиля в одном Chromium. Контекстный менеджер."""

    def __init__(self, style, work, bg=None, timeout=120):
        self.style, self.work, self.bg, self.timeout = style, os.path.abspath(work), bg, timeout
        self.errs, self.pid = [], None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        handler = type('H', (_Handler,), {'work': self.work})
        self.srv = _Server(('127.0.0.1', 0), handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        save_json(S.resolve(self.style), os.path.join(self.work, 'style.json'))
        url = 'http://127.0.0.1:%d/engine/page/index.html?plan=/work/plan.json&style=/work/style.json' % self.srv.server_address[1]
        if self.bg:
            url += '&bg=' + self.bg
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(args=FONT_ARGS + SWIFTSHADER_ARGS)
        try:
            import psutil
            kids = psutil.Process().children(recursive=True)
            top = [p for p in kids if 'chrom' in (p.name() or '').lower() and 'chrom' not in ((p.parent().name() if p.parent() else '') or '').lower()]
            self.pid = top[0].pid if top else None
            if self.pid:
                open(os.path.join(self.work, 'chromium.pid'), 'w').write(str(self.pid))
        except Exception:
            self.pid = None
        self.pg = self.browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
        self.pg.on('pageerror', lambda e: self.errs.append('pageerror: %s' % e))
        self.pg.on('console', lambda m: m.type == 'error' and self.errs.append('console: %s' % m.text))
        self.pg.goto(url, wait_until='load')
        self.pg.wait_for_function('window.sceneReady === true || !!window.bootError', timeout=self.timeout * 1000)
        be = self.pg.evaluate('window.bootError || null')
        if be or self.errs:
            raise SystemExit('ошибка страницы: %s %s' % (be, self.errs))
        self.meta = self.pg.evaluate('({T: window.T, SFX: window.SFX || [], CAM: window.CAM || {}, ELEMENTS: window.ELEMENTS || []})')
        return self

    def set(self, t):
        n = self.pg.evaluate('t => window.setTime(t)', t)
        if self.errs:
            raise SystemExit('ошибка страницы: %s' % self.errs)
        return n

    def fast(self, t):
        return bool(self.pg.evaluate('t => !!(window.fastAt && window.fastAt(t))', t))

    def boxes(self, t):
        return self.pg.evaluate('t => window.layoutBoxes(t)', t)

    def shot(self):
        png = self.pg.screenshot(type='png', omit_background=not self.bg, caret='hide')
        return np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))

    def __exit__(self, *e):
        try:
            self.browser.close()
        finally:
            self.pw.stop()
            self.srv.shutdown()
            self.srv.server_close()
            if self.pid:
                try:
                    import psutil
                    if psutil.pid_exists(self.pid):
                        psutil.Process(self.pid).kill()
                except Exception:
                    pass
        return False


def frame_rgba(pg, t, fast, fps, sub, shutter):
    if fast:
        acc = np.zeros((H, W, 4), np.float32)
        for k in range(sub):
            ts = t + ((k + 0.5) / sub - 0.5) * shutter / fps
            if pg.set(ts) == 0:
                continue
            a = pg.shot().astype(np.float32)
            al = a[:, :, 3:4] / 255.0
            acc[:, :, :3] += a[:, :, :3] * al
            acc[:, :, 3:4] += al
        pg.set(t)
        if acc[:, :, 3].max() <= 0:
            return None
        A = acc[:, :, 3:4] / sub
        rgb = np.where(acc[:, :, 3:4] > 1e-6, acc[:, :, :3] / np.maximum(acc[:, :, 3:4], 1e-6), 0)
        return np.round(np.concatenate([rgb, A * 255.0], 2)).clip(0, 255).astype(np.uint8)
    if pg.set(t) == 0:
        return None
    return pg.shot()


def parse_frames(spec, N):
    out = []
    for part in spec.split(','):
        if '-' in part:
            x, y = part.split('-')
            out += list(range(int(x), min(N, int(y) + 1)))
        elif part:
            out.append(int(part))
    return [n for n in out if 0 <= n < N]


def run_render(style, work, frames_spec=None, png_dir=None, until=None, bg=None, no_blur=False, lock=None):
    sc = S.load(style)
    sub, shutter = sc.get('blur', {}).get('sub', 4), sc.get('blur', {}).get('shutter', 0.5)
    with heavy_lock(lock), Page(style, work, bg) as pg:
        T = pg.meta['T']
        fps, N = T['fps'], int(T['N'])
        save_json(pg.meta, os.path.join(work, 'meta.json'))
        partial = bool(frames_spec)
        if frames_spec:
            frames = parse_frames(frames_spec, N)
        else:
            frames = list(range(N if until is None else min(N, int(round(until * fps)))))
        enc = None
        if not partial:
            out = os.path.join(work, 'overlay.mov')
            tmp = os.path.join(work, '.overlay.part.mov')
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                                    '-c:v', 'qtrle', '-pix_fmt', 'argb', tmp], stdin=subprocess.PIPE)
        if png_dir:
            os.makedirs(png_dir, exist_ok=True)
        blank = np.zeros((H, W, 4), np.uint8)
        boxes, fast_frames, t0 = {}, [], time.time()
        for i, n in enumerate(frames):
            t = n / fps
            fast = (not no_blur) and pg.fast(t)
            img = frame_rgba(pg, t, fast, fps, sub, shutter)
            if fast:
                fast_frames.append(n)
            bx = pg.boxes(t)
            if img is not None:
                for b in bx:
                    x0, y0 = max(0, int(b['x0'])), max(0, int(b['y0']))
                    x1, y1 = min(W, int(np.ceil(b['x1']))), min(H, int(np.ceil(b['y1'])))
                    b['alpha_max'] = int(img[y0:y1, x0:x1, 3].max()) if x1 > x0 and y1 > y0 else 0
            else:
                for b in bx:
                    b['alpha_max'] = 0
            boxes[n] = bx
            fr = img if img is not None else blank
            if enc:
                enc.stdin.write(np.ascontiguousarray(fr).tobytes())
            if png_dir:
                Image.fromarray(fr, 'RGBA').save(os.path.join(png_dir, 'f%05d.png' % n), compress_level=1)
            if i % 150 == 0:
                log('render %s: кадр %d/%d, %.0f с' % (style, i, len(frames), time.time() - t0))
        if enc:
            enc.stdin.close()
            if enc.wait():
                die('ffmpeg не записал overlay.mov')
            os.replace(tmp, out)
        st = {'style': style, 'frames': len(frames), 'fast_frames': len(fast_frames), 'sec': round(time.time() - t0, 1)}
        log(json.dumps(st, ensure_ascii=False))
        name = 'boxes.json' if not partial else 'boxes_partial.json'
        save_json({'fps': fps, 'frames': boxes, 'fast': fast_frames}, os.path.join(png_dir if partial and png_dir else work, name), indent=None)
        save_json(st, os.path.join(work, 'render_stats.json'))
        return st
