"""Выдача: мукс видео и мастера → <name>.mp4 (AAC 256k, faststart), <name>_nomusic.mp4, <name>_tg.mp4 (≤ 6 Мбит/с), обложка.

Каждый файл пишется во временное имя и переименовывается в конце: недописанный файл никто не возьмёт и не отправит.
Мукс — без -frames:v: он обрезает хвост звука.
"""
import os

from .common import heavy_lock, log, run, tmp_then_rename

TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


def run_finalize(work, out, name='reel', lock=None, tg=True):
    os.makedirs(out, exist_ok=True)
    video = os.path.join(work, 'video.mp4')
    res = {}
    for wav, suffix in (('master.wav', ''), ('master_nomusic.wav', '_nomusic')):
        src = os.path.join(work, wav)
        if not os.path.exists(src):
            continue
        dst = os.path.join(out, name + suffix + '.mp4')
        tmp = tmp_then_rename(dst)
        run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', src, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
             '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-f', 'mp4', tmp])
        os.replace(tmp, dst)
        res[wav] = dst
    main = os.path.join(out, name + '.mp4')
    if tg:
        dst = os.path.join(out, name + '_tg.mp4')
        tmp = tmp_then_rename(dst)
        with heavy_lock(lock):
            run(['ffmpeg', '-v', 'error', '-y', '-i', main, '-map', '0:v', '-map', '0:a', '-c:v', 'libx264', '-preset', 'medium',
                 '-crf', '20', '-maxrate', '5500k', '-bufsize', '11000k', '-pix_fmt', 'yuv420p', '-threads', '4',
                 '-vf', 'scale=in_color_matrix=bt709:out_color_matrix=bt709', *TAGS, '-c:a', 'aac', '-b:a', '192k',
                 '-movflags', '+faststart', '-f', 'mp4', tmp])
        os.replace(tmp, dst)
        res['tg'] = dst
    cover = os.path.join(out, name + '_cover.jpg')
    tmp = tmp_then_rename(cover)
    run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', "select='eq(n\\,0)',scale=in_color_matrix=bt709:in_range=tv", '-vsync', '0',
         '-frames:v', '1', '-q:v', '2', '-f', 'image2', tmp])
    os.replace(tmp, cover)
    res['cover'] = cover
    for k, v in res.items():
        log('%s → %s' % (k, v))
    return res
