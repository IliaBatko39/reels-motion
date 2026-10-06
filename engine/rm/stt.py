"""Распознавание речи по словам через fal whisper (fal-ai/whisper). Ключ — только из переменной окружения FAL_KEY.

Без ключа шаг не выполняется: печатается понятная ошибка, код выхода 2. Остальной конвейер от ключа не зависит —
слова можно положить готовым JSON того же формата: {"text": "...", "chunks": [{"timestamp": [s, e], "text": " слово"}]}.
"""
import base64
import json
import os
import subprocess
import urllib.error
import urllib.request

from .common import die, log

ENDPOINT = 'https://fal.run/fal-ai/whisper'
LONG_WORD = 1.2      # слово длиннее — внутри почти всегда спрятан повтор или оговорка


def fal_key():
    k = os.environ.get('FAL_KEY', '').strip()
    if not k:
        die('нет переменной окружения FAL_KEY — распознавание пропущено. Задайте ключ fal в переменной окружения FAL_KEY '
            'или положите слова готовым JSON в формате fal chunks.', 2)
    return k


def audio_mp3(path, start=None, end=None, tempo=None):
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None:
        cmd += ['-ss', '%.3f' % start]
    cmd += ['-i', path]
    if end is not None:
        cmd += ['-t', '%.3f' % (end - (start or 0))]
    af = ['aresample=24000']
    if tempo:
        af.append('atempo=%g' % tempo)
    cmd += ['-vn', '-ac', '1', '-af', ','.join(af), '-b:a', '64k', '-f', 'mp3', '-']
    return subprocess.run(cmd, capture_output=True, check=True).stdout


def transcribe(mp3, level='word', lang='ru', timeout=300):
    body = json.dumps({'audio_url': 'data:audio/mpeg;base64,' + base64.b64encode(mp3).decode(), 'task': 'transcribe',
                       'language': lang, 'chunk_level': level}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={'Authorization': 'Key ' + fal_key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        die('fal whisper ответил %s: %s' % (e.code, e.read()[:300].decode('utf-8', 'replace')))


def report(name, j):
    ch = j.get('chunks', [])
    print('== %s: %d фрагм.' % (name, len(ch)))
    print((j.get('text') or '').strip())
    long = [(c['text'].strip(), c['timestamp'][0], c['timestamp'][1]) for c in ch
            if c['timestamp'][1] is not None and c['timestamp'][1] - c['timestamp'][0] > LONG_WORD]
    for w, s, e in long:
        print('  ⚠ длинное слово «%s» %.2f–%.2f (%.2f с) — проверить замедленной перерасшифровкой: --slow %.2f:%.2f'
              % (w, s, e, e - s, max(0, s - 0.3), e + 0.3))
    print()


def main(a):
    os.makedirs(a.out, exist_ok=True)
    if a.slow:
        if len(a.files) != 1:
            die('--slow — для одного файла')
        s, e = (float(x) for x in a.slow.split(':'))
        src = a.files[0]
        name = os.path.splitext(os.path.basename(src))[0]
        j = transcribe(audio_mp3(src, s, e, tempo=0.5), a.level, a.lang)
        for c in j.get('chunks', []):             # шкала замедленной ×2 → шкала исходника
            t0, t1 = c['timestamp']
            c['timestamp'] = [round(s + t0 / 2, 3), None if t1 is None else round(s + t1 / 2, 3)]
        out = os.path.join(a.out, '%s_slow_%.2f_%.2f.json' % (name, s, e))
        json.dump(j, open(out, 'w'), ensure_ascii=False, indent=1)
        report(name + ' (×2 замедленно, время исходника)', j)
        for c in j.get('chunks', []):
            print('  %7.2f–%7s  %s' % (c['timestamp'][0], '%.2f' % c['timestamp'][1] if c['timestamp'][1] is not None else '?', c['text'].strip()))
        log('→ ' + out)
        return
    for src in a.files:
        name = os.path.splitext(os.path.basename(src))[0]
        out = os.path.join(a.out, name + '.json')
        if os.path.exists(out) and not a.force:
            j = json.load(open(out, encoding='utf-8'))
        else:
            j = transcribe(audio_mp3(src), a.level, a.lang)
            json.dump(j, open(out, 'w'), ensure_ascii=False, indent=1)
        report(name, j)
        log('→ ' + out)
