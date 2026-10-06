"""Общее: пути, запуск команд, ffprobe, блокировка тяжёлых шагов, чтение таймлайна."""
import contextlib
import fcntl
import json
import os
import re
import subprocess
import sys

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(ENGINE)
STYLES = os.path.join(ROOT, 'styles')
FONTS = os.path.join(ROOT, 'fonts')
PRESETS = ('base', 'premium', 'sticker', 'kinetic')
W, H = 1080, 1920
SR = 48000


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def die(msg, code=1):
    log('ОШИБКА: ' + msg)
    sys.exit(code)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def ffprobe_json(path, *args):
    r = subprocess.run(['ffprobe', '-v', 'error', *args, '-of', 'json', path], capture_output=True, text=True)
    if r.returncode:
        die('ffprobe не прочитал %s: %s' % (path, r.stderr.strip()[:300]))
    return json.loads(r.stdout or '{}')


def count_frames(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    return int(out.split(',')[0]) if out else 0


def ebur(path):
    """Интегральная громкость и true peak готового файла (ffmpeg ebur128)."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    tail = r[r.rindex('Summary:'):] if 'Summary:' in r else r
    i = re.search(r'I:\s+(-?[\d.]+) LUFS', tail)
    p = re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail)
    return (float(i.group(1)) if i else None), (float(p.group(1)) if p else None)


@contextlib.contextmanager
def heavy_lock(path=None):
    """Тяжёлые шаги (Chromium, x264) — по одному на машину. Путь — --lock или REEL_LOCK; без них блокировки нет."""
    path = path or os.environ.get('REEL_LOCK')
    if not path:
        yield
        return
    with open(path, 'a') as f:
        log('жду блокировку %s …' % path)
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json(obj, path, indent=1):
    tmp = path + '.part'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def style_conf(style):
    """Полный стиль с учётом наследования (engine/rm/styles.py)."""
    from .styles import load
    return load(style)


def tl_path(tl_file, p):
    """Путь из таймлайна — относительно папки таймлайна; ~ раскрывается."""
    if p is None:
        return None
    p = os.path.expanduser(p)
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(tl_file)), p))


def tmp_then_rename(final):
    """Временное имя рядом с итоговым: пишем туда, в конце os.replace — недописанный файл никто не возьмёт."""
    d, n = os.path.split(final)
    root, ext = os.path.splitext(n)
    return os.path.join(d, '.%s.part%s' % (root, ext))
