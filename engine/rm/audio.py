"""Звук: голос (только гигиена) + SFX синтезом ровно на кадрах появлений + музыка синтезом с sidechain под голос → мастер.

Всё по стилю (style.json → audio): фильтр голоса, пресет и уровень музыки, sidechain, палитра SFX (уровни к голосу), мастер.
Итог: master.wav (голос + SFX + музыка) и master_nomusic.wav (под трендовый звук в приложении): −14 LUFS, true peak ≤ −1 dBTP.
"""
import json
import os
import subprocess

import numpy as np
import soundfile as sf

from .common import SR, die, ebur, load_json, log, run, save_json, tl_path
from .compose import seam_times
from .loud import integrated, momentary_max
from . import music as M
from . import sfx as X
from . import styles as S

CEIL = -8.0          # ни одно событие не громче «голос − 8 дБ»


def voice_track(base, flt, hold, dur):
    raw_path = base + '.voice.tmp.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-i', base, '-vn', '-ac', '2', '-ar', str(SR), '-af', flt, '-c:a', 'pcm_f32le', raw_path])
    x, _ = sf.read(raw_path, always_2d=True)
    os.remove(raw_path)
    if hold > 0:
        k = min(len(x), 240)                     # вход живого звука после тишины стоп-кадра — 5 мс без щелчка
        x[:k] *= np.linspace(0, 1, k)[:, None]
        x = np.concatenate([np.zeros((int(round(hold * SR)), 2)), x])
    n = int(round(dur * SR))
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), 2))])
    return x.astype(np.float32)


def events(plan, style, meta):
    au = style.get('audio', {})
    ev = [dict(e) for e in meta.get('SFX', [])]
    tr = style.get('transitions', {})
    for key in ('whip', 'flash'):
        c = tr.get(key) or {}
        if c.get('sfx'):
            for t in seam_times(plan, c.get('at')):
                ev.append({'t': t, 'type': c['sfx'], 'layer': key, 'gain_db': c.get('gain_db')})
    if plan.get('hold_f') and au.get('freeze_accent'):
        ev.append({'t': 0.0, 'type': au['freeze_accent'], 'layer': 'freeze', 'gain_db': au.get('freeze_accent_db', -13)})
    return sorted(ev, key=lambda e: e['t'])


def sfx_stem(plan, style, meta, n, vI, fps):
    rel = dict(style.get('audio', {}).get('sfx', {}))
    out = np.zeros((n, 2), np.float32)
    evs = events(plan, style, meta)
    for k, e in enumerate(evs):
        kind = e['type']
        if kind not in X.ANCHOR:
            log('неизвестный SFX %r — пропущен' % kind)
            continue
        x, anchor = X.synth(kind, np.random.default_rng(X.seed_of('%s:%s:%d' % (e.get('layer'), kind, k))), e.get('dur'))
        gdb = e.get('gain_db') if e.get('gain_db') is not None else rel.get(kind, -16)
        gdb = min(gdb, CEIL)
        x = x * 10 ** ((vI + gdb - momentary_max(x)) / 20)
        frame = round(e['t'] * fps)
        s0 = int(round(frame / fps * SR)) - anchor
        a, b = max(0, s0), min(n, s0 + len(x))
        if b > a:
            out[a:b] += x[a - s0:b - s0]
        e.update({'frame': frame, 'anchor': X.ANCHOR[kind], 'rel_db': gdb})
    return out, evs


def master(src, dst, lufs, tp, limit):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', f'loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    m = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
    gain = 0.0
    for _ in range(3):
        ln = (f"loudnorm=I={lufs}:TP={tp}:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
        run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af',
             f'{ln},volume={gain:.3f}dB,alimiter=limit={limit}:attack=2:release=40:level=false,aresample={SR},aformat=channel_layouts=stereo',
             '-ar', str(SR), '-ac', '2', '-c:a', 'pcm_s24le', dst])
        I, TP = ebur(dst)
        if I is None or abs(I - lufs) <= 0.25:
            break
        gain += lufs - I                       # alimiter съел часть громкости — догоняем
    return {'I': I, 'TP': TP, 'extra_gain_db': round(gain, 2)}


def run_audio(tl, tlfile, style, work):
    plan = load_json(os.path.join(work, 'plan.json'))
    meta = load_json(os.path.join(work, 'meta.json')) if os.path.exists(os.path.join(work, 'meta.json')) else {}
    st = S.load(style)
    au = st.get('audio', {})
    fps, dur = plan['fps'], plan['duration']
    base = tl_path(tlfile, tl['base'])
    v = voice_track(base, au.get('voice', 'highpass=f=80,acompressor=threshold=-21dB:ratio=2.5:attack=8:release=140:makeup=1.5'), plan['hold'], dur)
    n = len(v)
    vI = integrated(v)
    if vI < -60:
        log('голоса почти нет (%.1f LUFS) — уровни SFX и музыки считаются от −23 LUFS' % vI)
        vI = -23.0
    sf.write(os.path.join(work, 'voice.wav'), v, SR, subtype='FLOAT')
    sx, evs = sfx_stem(plan, st, meta, n, vI, fps)
    sf.write(os.path.join(work, 'sfx.wav'), sx, SR, subtype='FLOAT')
    save_json(evs, os.path.join(work, 'sfx_events.json'))
    mus = au.get('music') or {}
    start = plan['hold'] if mus.get('start', 'live') == 'live' else float(mus.get('start', 0))
    m = M.make(mus.get('preset'), dur, start, mus.get('bpm'))
    lufs, tp = au.get('master', {}).get('lufs', -14), au.get('master', {}).get('tp', -1.5)
    limit = au.get('master', {}).get('limit', 0.85)
    res = {'voice_I': round(vI, 2), 'sfx': len(evs)}
    sf.write(os.path.join(work, 'mix_nomusic_raw.wav'), (v + sx).astype(np.float32), SR, subtype='FLOAT')
    res['master_nomusic'] = master(os.path.join(work, 'mix_nomusic_raw.wav'), os.path.join(work, 'master_nomusic.wav'), lufs, tp, limit)
    if m is not None:
        m = m[:n] if len(m) >= n else np.concatenate([m, np.zeros((n - len(m), 2), np.float32)])
        mI = integrated(m)
        m = m * 10 ** ((vI + mus.get('level_lu', -12) - mI) / 20)
        sf.write(os.path.join(work, 'music.wav'), m.astype(np.float32), SR, subtype='FLOAT')
        sc = au.get('sidechain', {})
        run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(work, 'music.wav'), '-i', os.path.join(work, 'voice.wav'), '-filter_complex',
             f"[0:a][1:a]sidechaincompress=threshold={sc.get('threshold', 0.04)}:ratio={sc.get('ratio', 3)}:attack={sc.get('attack', 15)}:"
             f"release={sc.get('release', 300)}:makeup=1[d]", '-map', '[d]', '-c:a', 'pcm_f32le', os.path.join(work, 'music_ducked.wav')])
        md, _ = sf.read(os.path.join(work, 'music_ducked.wav'), always_2d=True)
        md = md[:n] if len(md) >= n else np.concatenate([md, np.zeros((n - len(md), 2))])
        sf.write(os.path.join(work, 'mix_raw.wav'), (v + sx + md).astype(np.float32), SR, subtype='FLOAT')
        res['master'] = master(os.path.join(work, 'mix_raw.wav'), os.path.join(work, 'master.wav'), lufs, tp, limit)
        speech = np.zeros(n, bool)
        for w in plan['words']:
            speech[int(w['s'] * SR):int(w['e'] * SR)] = True
        if speech.any():
            rms = lambda x: 10 * np.log10(np.mean(x ** 2) + 1e-20)
            res['music_under_speech_db'] = round(rms(v[speech].mean(1)) - rms(md[speech].mean(1)), 1)
    else:
        import shutil
        shutil.copy(os.path.join(work, 'master_nomusic.wav'), os.path.join(work, 'master.wav'))
        res['master'] = res['master_nomusic']
    save_json(res, os.path.join(work, 'mix.json'))
    log('audio: ' + json.dumps(res, ensure_ascii=False))
    return res
