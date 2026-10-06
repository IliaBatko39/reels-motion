"""SFX синтезом (numpy/scipy, без файлов и лицензий): pop, click, whoosh, swoosh_down, swish, riser, hit, ping.

synth(kind, rng, dur) → (стерео float32 (n, 2), индекс сэмпла «момента»): атака, пик или конец — см. ANCHOR.
"""
import numpy as np
from scipy.signal import butter, sosfilt

from .loud import SR

# где у звука «момент»: onset — атака; peak — пик огибающей; end — конец (райзер кончается ровно на шве)
ANCHOR = {'pop': 'onset', 'click': 'onset', 'hit': 'onset', 'whoosh': 'peak', 'swoosh_down': 'peak', 'riser': 'end', 'ping': 'onset', 'swish': 'peak'}
KINDS = tuple(ANCHOR)


def seed_of(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


def norm_peak(x, db=-1.0):
    return x * (10 ** (db / 20) / (np.abs(x).max() + 1e-12))


def bandnoise(rng, n, lo, hi):
    sos = butter(4, [lo, hi], 'bandpass', fs=SR, output='sos')
    return sosfilt(sos, rng.standard_normal(n))


def sweep_sine(f0, f1, n, kind='exp'):
    t = np.arange(n) / SR
    T = n / SR
    if kind == 'exp':
        k = np.log(f1 / f0) / T
        ph = 2 * np.pi * f0 * (np.exp(k * t) - 1) / k
    else:
        ph = 2 * np.pi * (f0 * t + (f1 - f0) * t ** 2 / (2 * T))
    return np.sin(ph)


def synth(kind, rng, dur=None):
    """→ (stereo float32 (n,2), индекс сэмпла «момента» по ANCHOR)."""
    if kind == 'pop':
        n = int(0.08 * SR); t = np.arange(n) / SR
        body = sweep_sine(600, 180, int(0.06 * SR))
        body = np.concatenate([body, np.zeros(n - len(body))])
        click = np.zeros(n); m = int(0.002 * SR); click[:m] = bandnoise(rng, m, 2000, 6000) * 10 ** (-12 / 20)
        att = np.minimum(1, t / 0.001)
        x = (body * np.exp(-t / 0.018) + click) * att
        mono, anchor = x, 0
    elif kind == 'click':
        n = int(0.015 * SR); t = np.arange(n) / SR
        nz = np.zeros(n); m = int(0.006 * SR); nz[:m] = bandnoise(rng, m, 2000, 6000)
        s = np.zeros(n); m2 = int(0.010 * SR); s[:m2] = np.sin(2 * np.pi * 1200 * t[:m2])
        mono, anchor = (0.6 * nz + s) * np.exp(-t / 0.003), 0
    elif kind == 'ping':
        # стеклянный акцент: два мягких синуса (1320 + 1980 Гц) с быстрым спадом + низ 330 Гц
        n = int(0.6 * SR); t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 1320 * t) * np.exp(-t / 0.16) + 0.45 * np.sin(2 * np.pi * 1980 * t) * np.exp(-t / 0.09)
             + 0.5 * np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.22))
        mono, anchor = x * np.minimum(1, t / 0.002), 0
    elif kind in ('whoosh', 'swoosh_down', 'swish'):
        L = {'whoosh': 0.35, 'swoosh_down': 0.30, 'swish': 0.28}[kind]
        f0, f1, pk = {'whoosh': (400, 5000, 0.6), 'swoosh_down': (5000, 600, 0.3), 'swish': (1500, 7000, 0.55)}[kind]
        n = int(L * SR)
        noise = rng.standard_normal(n)
        out = np.zeros(n); blk = 256; zi = None
        for i in range(0, n, blk):
            x = i / n
            fc = f0 * (f1 / f0) ** x
            bw = fc / 1.2
            lo, hi = max(40, fc - bw / 2), min(SR / 2 - 100, fc + bw / 2)
            sos = butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')
            seg, zi = sosfilt(sos, noise[i:i + blk], zi=zi if zi is not None else np.zeros((sos.shape[0], 2)))
            out[i:i + blk] = seg
        x = np.arange(n) / n
        # огибающая sin(π·u^a) с пиком на pk
        a = np.log(0.5) / np.log(pk)
        envl = np.sin(np.pi * np.clip(x, 0, 1) ** a)
        mono = out * envl
        anchor = int(pk * n)
        pan = np.linspace(-0.3, 0.3, n)
        st = np.stack([mono * np.sqrt((1 - pan) / 2), mono * np.sqrt((1 + pan) / 2)], 1) * np.sqrt(2)
        return norm_peak(st).astype(np.float32), anchor
    elif kind == 'riser':
        d = float(np.clip(dur or 0.9, 0.6, 1.2))
        n = int(d * SR); t = np.arange(n) / SR; x = t / d
        f = 200 * (1200 / 200) ** x
        saw = 2 * ((np.cumsum(f) / SR) % 1.0) - 1
        src = 0.5 * rng.standard_normal(n) + 0.5 * saw
        out = np.zeros(n); zi = None
        for i in range(0, n, 256):
            fc = 800 * (8000 / 800) ** (i / n)
            sos = butter(2, fc, 'lowpass', fs=SR, output='sos')
            seg, zi = sosfilt(sos, src[i:i + 256], zi=zi if zi is not None else np.zeros((sos.shape[0], 2)))
            out[i:i + 256] = seg
        envl = x ** 2.2
        m = int(0.01 * SR); envl[-m:] *= np.linspace(1, 0, m)
        mono, anchor = out * envl, n - 1
    elif kind == 'hit':
        n = int(0.25 * SR); t = np.arange(n) / SR
        sub = sweep_sine(90, 45, n) * np.exp(-t / 0.07)
        nz = np.zeros(n); m = int(0.03 * SR)
        sos = butter(4, 3000, 'lowpass', fs=SR, output='sos')
        nz[:m] = sosfilt(sos, rng.standard_normal(m)) * np.exp(-t[:m] / 0.01) * 10 ** (-6 / 20)
        mid = np.sin(2 * np.pi * 160 * t) * np.exp(-t / 0.04) * 10 ** (-8 / 20)
        mono, anchor = (sub + nz + mid) * np.minimum(1, t / 0.001), 0
    else:
        raise ValueError(kind)
    mono = norm_peak(mono)
    return np.stack([mono, mono], 1).astype(np.float32), anchor
