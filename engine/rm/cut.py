"""Сборка основы по раскладке (EDL): резы по сетке кадров, звук без щелчков, слова в шкале основы, этапы, стоп-кадр.

EDL (JSON, пути — относительно файла EDL):
{
  "fps": 30,
  "sources": {"take1": "src/take1.mov", ...},
  "stt": "stt",                                  # папка с распознаванием <имя>.json (формат fal chunks)
  "segments": [{"src": "take1", "in": 2.32, "out": 10.44, "stage": "hook+lead"}, ...],
  "splits": {"hook+lead": {"word": "зарабатывает", "edge": "end"}},   # этап из двух частей — граница по слову
  "freeze": {"src": "take1", "t": 2.95, "fingertip": [0.54, 0.60]},  # кадр с жестом (доли кадра), необязательно
  "retime": {"take1": {"Вот": [2.40, 2.50]}},                     # поправка границ слова (время исходника)
  "replace": {"лейбор": "лейбор-кост,", "-кост,": null},          # правка текста; null — выбросить фрагмент
  "override": [{"src": "take3", "in": 20.21, "out": 22.0, "words": [["Можем", 20.27, 20.71], ...]}]
}
Выход в --out: base.mov (1080×1920, H.264 BT.709, PCM 48 кГц), words.json, beats.json, freeze.png, cut_report.json.
"""
import json
import os
import subprocess

import numpy as np

from .common import H, SR, W, count_frames, die, log, run, save_json
from .probe import in_matrix, info


def fr(x, fps):
    return int(round(x * fps))


# ---------------------------------------------------------------- огибающая звука
_ENV = {}


def envelope(path):
    """RMS окнами 10 мс, дБ."""
    if path not in _ENV:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32)
        w = SR // 100
        e = np.sqrt(np.mean(x[:len(x) // w * w].reshape(-1, w) ** 2, 1) + 1e-12)
        _ENV[path] = 20 * np.log10(e)
    return _ENV[path]


def floor_db(path):
    return float(np.percentile(envelope(path), 15))


def spans(path, a, b, thr=None):
    """Речевые участки в окне [a, b]: уровень выше «пол + 12 дБ» дольше 40 мс."""
    e = envelope(path)
    seg = e[int(a * 100):int(b * 100)]
    t = thr if thr is not None else floor_db(path) + 12
    on = seg > t
    out, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            if j - i >= 4:
                out.append((round(a + i / 100, 2), round(a + j / 100, 2)))
            i = j
        else:
            i += 1
    return t, out


def quiet(path, t, look=0.25):
    """Самая тихая точка в окне t±look → (время, уровень дБ, пол дБ)."""
    e = envelope(path)
    i0, i1 = max(0, int((t - look) * 100)), min(len(e), int((t + look) * 100))
    k = i0 + int(np.argmin(e[i0:i1]))
    return round(k / 100, 2), round(float(e[k]), 1), round(floor_db(path), 1)


def level_at(path, t):
    e = envelope(path)
    k = min(len(e) - 1, max(0, int(t * 100)))
    return float(e[max(0, k - 1):k + 2].max())


# ---------------------------------------------------------------- слова
def load_chunks(path):
    j = json.load(open(path, encoding='utf-8'))
    ch = j.get('chunks', j if isinstance(j, list) else [])
    out = []
    for i, c in enumerate(ch):
        s, e = c['timestamp']
        if e is None:
            e = ch[i + 1]['timestamp'][0] if i + 1 < len(ch) else s + 0.3
        out.append((c['text'].strip(), float(s), float(e)))
    return out


def remap_words(edl, edl_dir, fps):
    stt_dir = os.path.join(edl_dir, edl.get('stt', 'stt'))
    retime, replace = edl.get('retime', {}), edl.get('replace', {})
    over = {(o['src'], float(o['in']), float(o['out'])): o for o in edl.get('override', [])}
    out, t, cache = [], 0.0, {}
    for sg in edl['segments']:
        src, a, b = sg['src'], float(sg['in']), float(sg['out'])
        A, B = fr(a, fps) / fps, fr(b, fps) / fps
        key = (src, a, b)
        if key in over:
            o = over[key]
            ws = [tuple(w) for w in o['words']] if 'words' in o else [(x[0], x[1], x[2]) for x in load_chunks(os.path.join(edl_dir, o['file']))]
        else:
            p = os.path.join(stt_dir, src + '.json')
            if not os.path.exists(p):
                log('нет распознавания %s — слова этого куска пропущены' % p)
                ws = []
            else:
                if p not in cache:
                    cache[p] = load_chunks(p)
                ws = []
                for w, s, e in cache[p]:
                    if w in retime.get(src, {}):
                        s, e = retime[src][w]
                    if w in replace:
                        if replace[w] is None:
                            continue
                        w = replace[w]
                    ws.append((w, s, e))
        for w, s, e in ws:
            if s >= A - 0.02 and e <= B + 0.05:
                out.append({'w': w, 'start': round(t + max(s, A) - A, 3), 'end': round(t + min(e, B) - A, 3), 'src': src,
                            'beat': sg.get('stage', '')})
        t += (fr(b, fps) - fr(a, fps)) / fps
    return out


def norm(s):
    import re
    return re.sub(r'[^\w-]+', '', s.lower().replace('ё', 'е'))


# ---------------------------------------------------------------- сборка
def video_chain(meta, fps):
    m = in_matrix(meta)
    vf = (f'scale={W}:{H}:force_original_aspect_ratio=increase:in_color_matrix={m}:out_color_matrix=bt709,'
          f'crop={W}:{H},setsar=1')
    if not meta.get('fps') or abs(meta['fps'] - fps) > 0.01:
        vf += f',fps={fps}'          # сетка кадров до trim: иначе trim считает кадры исходника
    return vf


def main(a):
    edl_path = os.path.abspath(a.edl)
    edl_dir = os.path.dirname(edl_path)
    edl = json.load(open(edl_path, encoding='utf-8'))
    fps = int(edl.get('fps', 30))
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    srcs = {k: os.path.join(edl_dir, os.path.expanduser(v)) for k, v in edl['sources'].items()}
    for k, p in srcs.items():
        if not os.path.exists(p):
            die('нет исходника %s: %s' % (k, p))
    metas = {k: info(p) for k, p in srcs.items()}
    segs = edl['segments']
    # 1. границы — по звуку: уровень на резе против пола записи
    report = []
    for i, sg in enumerate(segs):
        p = srcs[sg['src']]
        fl = floor_db(p)
        for edge in ('in', 'out'):
            t = float(sg[edge])
            lv = level_at(p, t)
            q = quiet(p, t)
            flag = 'РЕЧЬ' if lv > fl + 12 else 'ок'
            report.append({'seg': i, 'src': sg['src'], 'edge': edge, 't': t, 'level_db': round(lv, 1), 'floor_db': round(fl, 1),
                           'quietest_near': q[0], 'quietest_db': q[1], 'flag': flag})
            if flag != 'ок' or a.verbose:
                log('кусок %d %s %s %.2f: уровень %.1f дБ (пол %.1f) %s; тише всего рядом — %.2f (%.1f дБ)'
                    % (i, sg['src'], edge, t, lv, fl, '⚠ рез в речи' if flag != 'ок' else '', q[0], q[1]))
    save_json(report, os.path.join(out, 'cut_report.json'))
    bad = [r for r in report if r['flag'] != 'ок']
    if bad and not a.force:
        die('%d границ попадают в речь (cut_report.json). Сдвиньте рез в тихую точку или запустите с --force.' % len(bad))
    # 2. видео и звук одним проходом ffmpeg: trim по кадрам, края звука 12 мс
    ins, fc, n_total = [], [], 0
    for i, sg in enumerate(segs):
        m = metas[sg['src']]
        ins += ['-i', srcs[sg['src']]]
        a0, b0 = fr(float(sg['in']), fps), fr(float(sg['out']), fps)
        nf = b0 - a0
        if nf <= 0:
            die('кусок %d: out ≤ in' % i)
        fc.append(f'[{i}:v]{video_chain(m, fps)},trim=start_frame={a0}:end_frame={b0},setpts=PTS-STARTPTS[v{i}];'
                  f'[{i}:a]aresample={SR},aformat=channel_layouts=mono,atrim=start={a0 / fps}:end={b0 / fps},asetpts=PTS-STARTPTS,'
                  f'afade=t=in:d=0.012,afade=t=out:st={nf / fps - 0.012:.4f}:d=0.012[a{i}];')
        n_total += nf
    fc.append(''.join(f'[v{i}][a{i}]' for i in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=1[v][a]')
    base = os.path.join(out, 'base.mov')
    tmp = os.path.join(out, '.base.part.mov')
    run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ''.join(fc), '-map', '[v]', '-map', '[a]',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709',
         '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-c:a', 'pcm_s16le', '-ar', str(SR), tmp])
    got = count_frames(tmp)
    if got != n_total:
        die('кадров в основе %d ≠ раскладке %d' % (got, n_total))
    os.replace(tmp, base)
    total = n_total / fps
    # 3. слова и этапы
    ws = remap_words(edl, edl_dir, fps)
    json.dump(ws, open(os.path.join(out, 'words.json'), 'w'), ensure_ascii=False, indent=0)
    beats, t = [], 0.0
    for sg in segs:
        d = (fr(float(sg['out']), fps) - fr(float(sg['in']), fps)) / fps
        st = sg.get('stage', '')
        if beats and beats[-1]['beat'] == st:
            beats[-1]['end'] = round(t + d, 3)
        else:
            beats.append({'beat': st, 'start': round(t, 3), 'end': round(t + d, 3), 'segments': []})
        beats[-1]['segments'].append({'src': sg['src'], 'src_in': sg['in'], 'src_out': sg['out'], 'start': round(t, 3), 'end': round(t + d, 3)})
        t += d
    for name, anc in (edl.get('splits') or {}).items():
        k = next((i for i, b in enumerate(beats) if b['beat'] == name), None)
        if k is None:
            continue
        key = norm(anc['word'])
        hits = [w for w in ws if norm(w['w']).startswith(key) and beats[k]['start'] <= w['start'] < beats[k]['end']]
        if not hits:
            die('splits: слово «%s» не найдено в этапе %s' % (anc['word'], name))
        tb = hits[anc.get('occurrence', 1) - 1]['end' if anc.get('edge', 'end') == 'end' else 'start']
        p1, p2 = name.split('+', 1)
        b = beats[k]
        beats[k:k + 1] = [dict(b, beat=p1, end=round(tb, 3)), dict(b, beat=p2, start=round(tb, 3))]
    cuts = [round(sum((fr(float(s['out']), fps) - fr(float(s['in']), fps)) for s in segs[:i + 1]) / fps, 4) for i in range(len(segs) - 1)]
    meta = {'fps': fps, 'frames': n_total, 'total': round(total, 3), 'cuts': cuts, 'beats': beats}
    fz = edl.get('freeze')
    if fz:
        m = metas[fz['src']]
        vf = video_chain(m, fps).replace(f',fps={fps}', '')
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(fz['t']), '-i', srcs[fz['src']], '-vf', vf, '-frames:v', '1',
             os.path.join(out, 'freeze.png')])
        ft = fz.get('fingertip')
        meta['freeze'] = {'src': fz['src'], 't': fz['t'], 'image': 'freeze.png',
                          'fingertip': [round(ft[0] * W), round(ft[1] * H)] if ft and ft[0] <= 1 else ft}
    save_json(meta, os.path.join(out, 'beats.json'))
    print('основа: %d кадров = раскладка ✓, %.2f с, слов %d, склеек %d' % (n_total, total, len(ws), len(cuts)))
    for b in beats:
        print('  %-10s %6.2f–%6.2f' % (b['beat'], b['start'], b['end']))
    long = [w for w in ws if w['end'] - w['start'] > 1.2]
    for w in long:
        print('  ⚠ длинное слово «%s» %.2f–%.2f — проверить на скрытый повтор (stt --slow)' % (w['w'], w['start'], w['end']))


def scan(a):
    """reel.py cut --scan SRC:a:b … — речевые участки и самая тихая точка у границ окна."""
    for arg in a.scan:
        p, x, y = arg.rsplit(':', 2)
        thr, s = spans(p, float(x), float(y))
        print('%s %s–%s  порог %.1f дБ  речь: %s' % (os.path.basename(p), x, y, thr, s))
        for t in (float(x), float(y)):
            q = quiet(p, t)
            print('   около %.2f: тише всего %.2f (%.1f дБ, пол %.1f)' % (t, *q))
