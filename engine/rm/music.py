"""Музыка синтезом — без файлов и лицензий. Пресеты (style.json → audio.music.preset):
  pad   — тёплый пэд Am9–Fmaj7–Cmaj7–G6 + мягкий саб-пульс на долю и тихий тик (премиум);
  beat  — лёгкий бит: бочка, клэп, хэт, саб, плак-аккорды Am–F–C–G (стикер);
  pulse — ритмичная подложка: бочка с «насосом» пэда, бас восьмыми, хэт на офбит (кинетика);
  none  — без музыки.
Всё детерминированно (фиксированное зерно). Возврат — стерео float32 (n, 2) с частотой SR.
"""
import numpy as np
from scipy.signal import butter, sosfilt

from .loud import SR, integrated

NOTE = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'lowpass', fs=SR, output='sos'), x, axis=0)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'highpass', fs=SR, output='sos'), x, axis=0)


def pad(dur, start=0.0, bpm=96):
    rng = np.random.default_rng(7)
    n = int(dur * SR)
    t = np.arange(n) / SR
    beat = 60 / bpm
    chord_len = 8 * beat
    chords = [[45, 57, 60, 64, 67, 71], [41, 53, 57, 60, 64, 69], [48, 55, 59, 64, 67, 72], [43, 55, 59, 62, 64, 71]]
    saw = lambda f, tt, ph=0.0: 2 * ((f * tt + ph) % 1.0) - 1
    out = np.zeros((n, 2))
    for ci in range(int(dur / chord_len) + 2):
        t0 = ci * chord_len - 0.4
        i0, i1 = max(0, int(t0 * SR)), min(n, int((t0 + chord_len + 1.2) * SR))
        if i0 >= n:
            break
        tt = t[i0:i1] - t0
        envl = np.minimum(1, tt / 0.9) * np.clip((chord_len + 1.2 - tt) / 1.2, 0, 1)
        seg = np.zeros((i1 - i0, 2))
        for m in chords[ci % 4]:
            f = NOTE(m)
            for dc, pan in ((-7, 0.25), (0, 0.5), (7, 0.75)):
                v = saw(f * 2 ** (dc / 1200), tt, rng.random()) * (0.5 if m < 50 else 0.28)
                seg[:, 0] += v * np.sqrt(1 - pan)
                seg[:, 1] += v * np.sqrt(pan)
        out[i0:i1] += seg * envl[:, None]
    flt = np.zeros_like(out)
    zi = None
    for i in range(0, n, 1024):
        fc = 900 + 450 * np.sin(2 * np.pi * (i / SR) / 9.0)
        sos = butter(2, fc, 'lowpass', fs=SR, output='sos')
        seg, zi = sosfilt(sos, out[i:i + 1024], axis=0, zi=zi if zi is not None else np.zeros((sos.shape[0], 2, 2)))
        flt[i:i + 1024] = seg
    padv = flt * 0.5
    pulse = np.zeros(n)
    k = 0
    while True:
        tb = start + k * beat
        if tb >= dur:
            break
        i0 = int(tb * SR)
        L = min(n - i0, int(0.35 * SR))
        tt = np.arange(L) / SR
        f = 48 + 40 * np.exp(-tt / 0.03)
        pulse[i0:i0 + L] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.16) * (1.0 if k % 2 == 0 else 0.7) * np.minimum(1, tt / 0.004)
        ti = int((tb + beat / 2) * SR)
        if ti < n:
            Lt = min(n - ti, int(0.03 * SR))
            nz = sosfilt(butter(2, [6000, 12000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(Lt))
            pulse[ti:ti + Lt] += nz * np.exp(-np.arange(Lt) / SR / 0.008) * 0.25
        k += 1
    mix = padv + 0.55 * pulse[:, None]
    fi, fo = int(0.4 * SR), int(min(1.6, dur / 3) * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None] ** 2
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return mix.astype(np.float32)


def beat(dur, start=0.0, bpm=104):
    rng = np.random.default_rng(1234)
    spb = 60 / bpm
    n = int(dur * SR)
    out = np.zeros((n, 2))

    def put(sig, t, pan=0.0, g=1.0):
        i = int(round(t * SR))
        if i >= n:
            return
        m = min(len(sig), n - i)
        out[i:i + m, 0] += sig[:m] * g * np.sqrt((1 - pan) / 2) * np.sqrt(2)
        out[i:i + m, 1] += sig[:m] * g * np.sqrt((1 + pan) / 2) * np.sqrt(2)

    tk = np.arange(int(0.35 * SR)) / SR
    f = 50 + 90 * np.exp(-tk / 0.03)
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk / 0.12)
    tc = np.arange(int(0.18 * SR)) / SR
    clap = sosfilt(butter(2, [900, 4000], 'bandpass', fs=SR, output='sos'), rng.standard_normal(len(tc))) * np.exp(-tc / 0.05)
    th = np.arange(int(0.05 * SR)) / SR
    hat = sosfilt(butter(4, 7000, 'highpass', fs=SR, output='sos'), rng.standard_normal(len(th))) * np.exp(-th / 0.012)
    chords = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]
    tp = np.arange(int(0.28 * SR)) / SR
    lpf = butter(2, 2200, 'lowpass', fs=SR, output='sos')
    bi, t = 0, start
    while t < dur:
        bar, pos = divmod(bi, 4)
        ch = chords[bar % 4]
        if pos in (0, 2):
            put(kick, t, 0, 0.9)
        if pos in (1, 3):
            put(clap, t, 0.1, 0.35)
        put(hat, t + spb / 2, 0.35, 0.18)
        put(hat, t, -0.35, 0.08)
        if pos in (0, 2):
            ts = np.arange(int(spb * 0.9 * SR)) / SR
            put(np.sin(2 * np.pi * NOTE(ch[0] - 24) * ts) * np.minimum(1, ts / 0.01) * np.exp(-ts / 0.35), t, 0, 0.45)
        pl = sum(np.sign(np.sin(2 * np.pi * NOTE(m) * tp)) * 0.33 for m in ch) * np.exp(-tp / 0.07)
        put(sosfilt(lpf, pl), t + spb / 2, -0.15 if pos % 2 else 0.15, 0.12)
        bi += 1
        t = start + bi * spb
    fo = int(min(1.2, dur / 3) * SR)
    out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    fi = int(0.08 * SR)
    i0 = int(start * SR)
    out[i0:i0 + fi] *= np.linspace(0, 1, len(out[i0:i0 + fi]))[:, None]
    return out.astype(np.float32)


def pulse(dur, start=0.0, bpm=104):
    n = int(dur * SR)
    beat_ = 60 / bpm
    out = np.zeros((n, 2))
    rng = np.random.default_rng(7)
    prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
    pump = np.ones(n)
    kick = np.zeros(n)
    for b in range(int(dur / beat_) + 2):
        s0 = int(b * beat_ * SR)
        if s0 >= n:
            break
        L = min(n - s0, int(0.35 * SR))
        tt = np.arange(L) / SR
        ph = 2 * np.pi * (45 * tt + (110 - 45) * 0.03 * (1 - np.exp(-tt / 0.03)))
        kick[s0:s0 + L] += np.sin(ph) * np.exp(-tt / 0.12) * 0.9
        Lp = min(n - s0, int(beat_ * SR))
        tp = np.arange(Lp) / SR
        pump[s0:s0 + Lp] = np.minimum(pump[s0:s0 + Lp], 0.3 + 0.7 * np.clip(tp / 0.22, 0, 1) ** 1.5)
        h0 = int((b + 0.5) * beat_ * SR)
        if h0 < n:
            Lh = min(n - h0, int(0.06 * SR))
            th = np.arange(Lh) / SR
            hz = hp(rng.standard_normal(Lh), 7000) * np.exp(-th / 0.018) * 0.22
            out[h0:h0 + Lh, 0] += hz * 0.8
            out[h0:h0 + Lh, 1] += hz
    bar = 4 * beat_
    bass = np.zeros(n)
    padv = np.zeros((n, 2))
    for k in range(int(dur / bar) + 1):
        root, ch = prog[k % 4]
        a, b_ = int(k * bar * SR), min(n, int((k + 1) * bar * SR))
        if a >= n:
            break
        tt = np.arange(b_ - a) / SR
        fb = NOTE(root - 12)
        bass[a:b_] = lp(2 * ((fb * tt) % 1) - 1, 420) * np.exp(-((tt % (beat_ / 2)) / 0.16)) * 0.5
        for j, m in enumerate(ch):
            for det, side in ((-0.08, 0), (0.08, 1)):
                fr = NOTE(m + 12) * 2 ** (det / 12)
                padv[a:b_, side] += (2 * ((fr * tt + j * .3) % 1) - 1) * 0.09
        m15 = min(int(0.015 * SR), b_ - a)
        padv[a:a + m15] *= np.linspace(0, 1, m15)[:, None]
        padv[b_ - m15:b_] *= np.linspace(1, 0, m15)[:, None]
    padv = lp(padv, 1500)
    for c in (0, 1):
        out[:, c] += bass + kick + padv[:, c] * pump - bass * (1 - pump) * 0.6
    fi, fo = int(0.05 * SR), int(min(1.0, dur / 3) * SR)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return (out / (np.abs(out).max() + 1e-9) * 0.7).astype(np.float32)


PRESETS = {'pad': pad, 'beat': beat, 'pulse': pulse}


def make(preset, dur, start=0.0, bpm=None):
    if not preset or preset == 'none':
        return None
    f = PRESETS.get(preset)
    if not f:
        raise SystemExit('неизвестный пресет музыки %r (есть: %s, none)' % (preset, ', '.join(PRESETS)))
    kw = {'bpm': bpm} if bpm else {}
    return f(dur, start, **kw)


__all__ = ['make', 'PRESETS', 'integrated']
