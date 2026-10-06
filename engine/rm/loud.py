"""Мини-измеритель громкости BS.1770 (K-взвешивание, momentary 400 мс, integrated с гейтами) для 48 кГц.
Сверяется с ffmpeg ebur128 в tests/test_sfx.py."""
import numpy as np
from scipy.signal import lfilter

B1, A1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
B2, A2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
SR = 48000


def kweight(x):
    """x: (n,) или (n, ch) float → K-взвешенный."""
    return lfilter(B2, A2, lfilter(B1, A1, x, axis=0), axis=0)


def _ms_blocks(x, win, hop):
    y = kweight(x)
    if y.ndim == 1:
        y = y[:, None]
    sq = (y ** 2).sum(axis=1)
    c = np.concatenate([[0.0], np.cumsum(sq)])
    starts = np.arange(0, max(1, len(sq) - win + 1), hop)
    return (c[np.minimum(starts + win, len(sq))] - c[starts]) / win, starts


def momentary_max(x, sr=SR):
    """Максимум momentary loudness (окно 400 мс, шаг 10 мс), LUFS."""
    win = int(0.4 * sr)
    if len(x) < win:
        pad = np.zeros((win - len(x),) + x.shape[1:])
        x = np.concatenate([x, pad])
    ms, _ = _ms_blocks(x, win, int(0.01 * sr))
    return float(-0.691 + 10 * np.log10(ms.max() + 1e-20))


def integrated(x, sr=SR):
    win, hop = int(0.4 * sr), int(0.1 * sr)
    ms, _ = _ms_blocks(x, win, hop)
    L = -0.691 + 10 * np.log10(ms + 1e-20)
    g = ms[L > -70]
    if not len(g):
        return -70.0
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(L > -70) & (L > rel)]
    return float(-0.691 + 10 * np.log10(g2.mean()))
