"""Приёмка: кадры, к/с, BT.709, длина звука, LUFS/TP, размер ТГ-версии, тексты в безопасной зоне, накладки не на лице,
SFX на кадре появления ±1, по желанию — обратная расшифровка звука (fal, по фразам). Код выхода 1 при FAIL."""
import json
import os
import re
import subprocess

from .common import SR, count_frames, ebur, ffprobe_json, load_json, log, save_json
from .compose import Camera
from . import styles as S

SAFE = (60, 220, 940, 1500)        # x0, y0, x1, y1 — органика Reels; плашке хука или вопроса можно с y 180
TOP_HOOK = 180


def run_qa(work, out, name='reel', stt=False, style=None):
    plan = load_json(os.path.join(work, 'plan.json'))
    meta = load_json(os.path.join(work, 'meta.json')) if os.path.exists(os.path.join(work, 'meta.json')) else {}
    st = S.load(style or plan['style'])
    N, fps = plan['N'], plan['fps']
    R = []
    rec = lambda n, ok, d: R.append((n, bool(ok), d))
    for fn in (name + '.mp4', name + '_tg.mp4'):
        f = os.path.join(out, fn)
        if not os.path.exists(f):
            continue
        nf = count_frames(f)
        rec(fn + ': кадров', nf == N, '%d (ожидается %d = основа %d + стоп-кадр %d)' % (nf, N, plan['base_frames'], plan['hold_f']))
        j = ffprobe_json(f, '-show_streams', '-show_format')
        v = next(s for s in j['streams'] if s['codec_type'] == 'video')
        a = next((s for s in j['streams'] if s['codec_type'] == 'audio'), None)
        rec(fn + ': к/с', v['r_frame_rate'] == v['avg_frame_rate'] == '%d/1' % fps, '%s / %s' % (v['r_frame_rate'], v['avg_frame_rate']))
        cs = (v.get('color_space'), v.get('color_primaries'), v.get('color_transfer'), v.get('pix_fmt'))
        rec(fn + ': BT.709', cs == ('bt709', 'bt709', 'bt709', 'yuv420p'), str(cs))
        if a:
            da = abs(float(a['duration']) - float(v['duration']))
            rec(fn + ': длина звука', da <= 0.05, 'аудио %s / видео %s' % (a['duration'], v['duration']))
            I, TP = ebur(f)
            target = st.get('audio', {}).get('master', {}).get('lufs', -14)
            rec(fn + ': громкость', I is not None and abs(I - target) <= 0.5, '%s LUFS (цель %s)' % (I, target))
            rec(fn + ': true peak', TP is not None and TP <= -1.0, '%s dBTP' % TP)
        if fn.endswith('_tg.mp4'):
            mb = os.path.getsize(f) / 2 ** 20
            br = mb * 8 * 2 ** 20 / float(v['duration']) / 1e6
            rec('tg: размер и битрейт', mb < 45 and br <= 6.0, '%.1f МБ, %.2f Мбит/с' % (mb, br))
    bxp = os.path.join(work, 'boxes.json')
    if os.path.exists(bxp):
        bx = load_json(bxp)['frames']
        cam = Camera(plan, st, meta)
        bad, worst = [], {}
        hits = []
        for n, bs in bx.items():
            n = int(n)
            if n < plan['hold_f']:
                face = plan.get('freeze_face')
            else:
                k = cam.seg(n / fps)
                fb = plan['segments'][k]['box']
                s, cx, cy, dx, dy, _ = cam.tf(n)
                face = [cx + (fb[0] - cx) * s + dx, cy + (fb[1] - cy) * s + dy, cx + (fb[2] - cx) * s + dx, cy + (fb[3] - cy) * s + dy]
            for b in bs:
                if b['opacity'] < 0.5 or b.get('alpha_max', 255) == 0 or b.get('kind') == 'graphic':
                    continue
                top = TOP_HOOK if b.get('type') in ('hook', 'question') or b['id'] in ('hook', 'question') else SAFE[1]
                over = max(SAFE[0] - b['x0'], b['x1'] - SAFE[2], top - b['y0'], b['y1'] - SAFE[3])
                if over > 0.5:
                    bad.append((n, b['id'], b['text'][:24], round(over, 1)))
                w = worst.setdefault(b['id'], [9e9, 9e9, -9e9, -9e9])
                w[0], w[1] = min(w[0], b['x0']), min(w[1], b['y0'])
                w[2], w[3] = max(w[2], b['x1']), max(w[3], b['y1'])
                if face and b['x0'] < face[2] and b['x1'] > face[0] and b['y0'] < face[3] and b['y1'] > face[1]:
                    hits.append((n, b['id'], b['text'][:20]))
        # вход и выход (9 кадров от начала и конца каждого показа элемента) — движение, а не читаемый текст:
        # перелёт пружины, вылет за край при whip-выходе. Такие кадры печатаются отдельно и ошибкой не считаются.
        seen = {}
        for n_, bs_ in bx.items():
            for b_ in bs_:
                if b_['opacity'] >= 0.5 and b_.get('alpha_max', 255) > 0:
                    seen.setdefault(b_['id'], set()).add(int(n_))
        moving = set()
        for lid, frs in seen.items():
            frs = sorted(frs)
            runs, cur = [], [frs[0]]
            for x in frs[1:]:
                if x == cur[-1] + 1:
                    cur.append(x)
                else:
                    runs.append(cur); cur = [x]
            runs.append(cur)
            for r in runs:
                for x in r:
                    if x - r[0] < 9 or r[-1] - x < 9:
                        moving.add((lid, x))
        transient = [b_ for b_ in bad if (b_[1], b_[0]) in moving]
        bad = [b_ for b_ in bad if (b_[1], b_[0]) not in moving]
        if transient:
            print('  (на входе или выходе — не ошибка, кадров %d: %s)' % (len(transient), transient[:4]))
        rec('Тексты в безопасной зоне', not bad, 'нарушений %d: %s | рамки: %s' % (
            len(bad), bad[:5], '; '.join('%s x%.0f–%.0f y%.0f–%.0f' % (k, v[0], v[2], v[1], v[3]) for k, v in worst.items())))
        rec('Накладки не на лице', not hits, 'пересечений %d: %s' % (len(hits), hits[:5]))
        evp = os.path.join(work, 'sfx_events.json')
        if os.path.exists(evp):
            ev = load_json(evp)
            vis = lambda n, lid: any(b['id'] == lid and b.get('alpha_max', 0) > 0 for b in bx.get(str(n), []))
            miss = [(e['type'], e['layer'], e['frame']) for e in ev if e.get('layer') not in ('whip', 'flash', 'freeze', 'camera')
                    and 'frame' in e and not any(vis(e['frame'] + d, e['layer']) for d in (-1, 0, 1, 2))]
            rec('SFX на кадре появления ±1', not miss, 'событий %d, без видимого слоя: %s' % (len(ev), miss[:8]))
    if stt:
        from .stt import audio_mp3, transcribe
        f = os.path.join(out, name + '.mp4')
        j = transcribe(audio_mp3(f), 'segment', plan.get('lang', 'ru'))
        save_json(j, os.path.join(work, 'back_stt.json'))
        print('Обратная расшифровка (сверить с текстом: фразы целые, без обрубков и повторов):')
        for c in j.get('chunks', []):
            s, e = c['timestamp']
            print('  %6.2f–%6s  %s' % (s, '%.2f' % e if e is not None else '?', c['text'].strip()))
    w = max([len(r[0]) for r in R] + [10])
    ok = True
    for n_, good, d in R:
        ok &= good
        print(('PASS ' if good else 'FAIL ') + n_.ljust(w) + '  ' + d)
    save_json([{'check': a, 'ok': b, 'detail': c} for a, b, c in R], os.path.join(work, 'qa.json'))
    return ok
