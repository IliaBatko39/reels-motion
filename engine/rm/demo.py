"""Синтетический проект без чужого видео: фон-заглушка (градиент, мягкий свет, силуэт), тишина вместо голоса,
слова с таймингами, стоп-кадр, таймлайн шаблона А или Б. Нужен для демо (проверка установки), теста и превью стилей.

  reel.py demo --style sticker --out /tmp/demo         → полный конвейер: plan → render → compose → audio → finalize → qa → sheet
"""
import json
import os
import subprocess

import numpy as np

from .common import H, SR, W, log, run

FPS = 30

# текст демо и тайминги слов (секунды основы); написание — как в субтитрах
SCRIPT_A = [
    ('Вот', 0.10), ('три', 0.30), ('правила', 0.52), ('сильного', 0.95), ('рилса.', 1.40),
    ('Это', 2.05), ('хук,', 2.25), ('ритм', 2.75), ('и', 3.15), ('призыв.', 3.30),
    ('Хук', 4.10), ('цепляет', 4.40), ('за', 4.85), ('секунду.', 5.00),
    ('Ритм', 6.00), ('держит', 6.35), ('до', 6.75), ('конца.', 6.92),
    ('Призыв', 7.95), ('ведёт', 8.40), ('дальше.', 8.75),
    ('Пиши', 9.60), ('«демо»', 9.95), ('в', 10.45), ('комментариях.', 10.55),
]
SCRIPT_B = [
    ('Какой', 0.10), ('стиль', 0.40), ('выбрать', 0.75), ('для', 1.20), ('рилса?', 1.38),
    ('Ого,', 2.05), ('частый', 2.55), ('вопрос.', 2.95),
    ('Без', 3.70), ('стиля', 3.95), ('ролик', 4.35), ('теряется', 4.70), ('в', 5.20), ('ленте,', 5.30),
    ('время', 6.10), ('уходит', 6.50), ('на', 6.90), ('переделки,', 7.05),
    ('деньги', 8.10), ('уходят', 8.55), ('в', 8.95), ('пустоту.', 9.05),
    ('Ответ:', 10.05), ('свой', 10.50), ('стиль.', 10.80),
]
CUTS_A = [4.0, 7.8]
CUTS_B = [3.6, 7.9]


def words_of(script, total):
    out = []
    for i, (w, s) in enumerate(script):
        nxt = script[i + 1][1] if i + 1 < len(script) else total - 0.2
        e = min(nxt - 0.04, s + 0.12 + 0.07 * len(w))
        out.append({'w': w, 'start': round(s, 3), 'end': round(e, 3)})
    return out


def background(path, dur, cuts, seed=3, src_video=None):
    """Фон: тёмный градиент, медленный блик, силуэт «говорящей головы»; на склейках меняется крупность и тон."""
    n = int(round(dur * FPS))
    if src_video:
        run(['ffmpeg', '-v', 'error', '-y', '-i', src_video, '-t', '%.3f' % dur, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
             '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-f', 'mov', path + '.v.mov'])
    else:
        yy, xx = np.mgrid[0:H // 4, 0:W // 4].astype(np.float32)
        yy *= 4
        xx *= 4
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W // 4, H // 4), '-r', str(FPS), '-i', '-',
                                '-vf', 'scale=%d:%d:flags=bicubic,format=yuv420p' % (W, H), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-f', 'mov', path + '.v.mov'], stdin=subprocess.PIPE)
        tones = [(38, 44, 70), (64, 40, 52), (30, 58, 60), (60, 52, 34)]
        for f in range(n):
            t = f / FPS
            k = sum(1 for c in cuts if t >= c)
            z = 1.0 if k % 2 == 0 else 1.1
            top = np.array(tones[k % len(tones)], np.float32)
            g = (yy / H)[..., None]
            img = top * (1 - g) + np.array([12, 12, 16], np.float32) * g
            lx, ly = W * (0.3 + 0.4 * np.sin(t * 0.6 + k)), H * 0.25
            img += 70 * np.exp(-(((xx - lx) / 420) ** 2 + ((yy - ly) / 420) ** 2))[..., None]
            cx, cy = W / 2, H * 0.33
            head = (((xx - cx) / (125 * z)) ** 2 + ((yy - cy - 6 * np.sin(t * 2.1)) / (150 * z)) ** 2) < 1
            body = (((xx - cx) / (380 * z)) ** 2 + ((yy - (cy + 560 * z)) / (420 * z)) ** 2) < 1
            img[head | body] = img[head | body] * 0.25 + np.array([18, 16, 20], np.float32) * 0.75
            enc.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
        enc.stdin.close()
        enc.wait()
    # звук — тишина: голоса в демо нет, слышны SFX и музыка стиля
    run(['ffmpeg', '-v', 'error', '-y', '-i', path + '.v.mov', '-f', 'lavfi', '-i', 'anullsrc=r=%d:cl=stereo' % SR, '-map', '0:v', '-map', '1:a',
         '-t', '%.4f' % (n / FPS), '-c:v', 'copy', '-c:a', 'pcm_s16le', path])
    os.remove(path + '.v.mov')
    run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', "select='eq(n\\,0)'", '-vsync', '0', '-frames:v', '1',
         os.path.join(os.path.dirname(path), 'freeze.png')])
    return n


def timeline_a(total):
    return {
        'version': 1, 'template': 'A', 'fps': FPS, 'base': 'base.mov', 'words': 'words.json', 'cuts': CUTS_A,
        'freeze': {'image': 'freeze.png', 'hold': 0.5, 'fingertip': [583, 1152]},
        'hook': {'kicker': 'ВОТ', 'number': '3', 'lines': ['ПРАВИЛА', 'РИЛСА'], 'sub': ['которые держат', 'зрителя'],
                 'end': {'word': 'рилса', 'edge': 'end', 'offset': 0.2}, 'number_at': {'word': 'три'}, 'accent_at': {'word': 'сильного'}},
        'lead': {'title': '3 ПРАВИЛА', 'items': [
            {'qual': 'первое', 'term': 'ХУК', 'dir': 'up', 'at_qual': {'word': 'это'}, 'at_term': {'word': 'хук'}},
            {'qual': 'второе', 'term': 'РИТМ', 'dir': 'up', 'at_qual': {'word': 'ритм', 'offset': -0.15}, 'at_term': {'word': 'ритм'}},
            {'qual': 'третье', 'term': 'ПРИЗЫВ', 'dir': 'up', 'at_qual': {'word': 'и'}, 'at_term': {'word': 'призыв'}}]},
        'blocks': [
            {'num': 1, 'term': 'ХУК', 'expl': ['цепляет за секунду'], 'start': {'cut': 0}},
            {'num': 2, 'term': 'РИТМ', 'expl': ['держит до конца'], 'start': 6.0},
            {'num': 3, 'term': 'ПРИЗЫВ', 'expl': ['ведёт дальше'], 'start': {'cut': 1}}],
        'loops': [{'text': 'А ритм?', 'start': 4.9, 'end': 6.0}],
        'cta': {'word': 'ДЕМО', 'caption': 'пиши в комментариях', 'caption_at': {'word': 'пиши'}, 'word_at': {'word': 'демо'}, 'start': 9.5},
        'elements': [{'type': 'reaction', 'kind': 'fire', 'at': {'word': 'конца'}, 'x': 820, 'y': 1020}],
        'camera': {'shot_scale': [1.0, 1.0, 1.0], 'punches': [{'at': {'word': 'секунду'}, 'until': 5.7}], 'shake': {'word': 'демо'}},
        'captions': {'accents': ['хук', 'ритм', 'призыв', 'секунду'], 'suppress': [[0, {'word': 'хук', 'occurrence': 2, 'offset': -0.1}], [{'word': 'пиши'}, 'END']]},
    }


def timeline_b(total):
    return {
        'version': 1, 'template': 'B', 'fps': FPS, 'base': 'base.mov', 'words': 'words.json', 'cuts': CUTS_B,
        'freeze': {'image': 'freeze.png', 'hold': 0.5},
        'question': {'lines': ['КАКОЙ СТИЛЬ', 'ВЫБРАТЬ?'], 'number': '?', 'end': {'word': 'рилса', 'edge': 'end', 'offset': 0.2}},
        'emotion': {'words': ['ОГО,', 'ЧАСТЫЙ', 'ВОПРОС'], 'accent': 2, 'start': {'word': 'ого'}, 'end': {'cut': 0},
                    'at': [{'word': 'ого'}, {'word': 'частый'}, {'word': 'вопрос'}]},
        'spheres': [
            {'num': 1, 'name': 'ЛЕНТА', 'text': ['ролик теряется'], 'start': {'cut': 0}},
            {'num': 2, 'name': 'ВРЕМЯ', 'text': ['уходит на переделки'], 'start': {'word': 'время'}},
            {'num': 3, 'name': 'ДЕНЬГИ', 'text': ['уходят в пустоту'], 'start': {'cut': 1}}],
        'answer': {'text': 'СВОЙ СТИЛЬ', 'at': {'word': 'свой'}, 'start': {'word': 'ответ'}},
        'elements': [{'type': 'comment', 'author': 'подписчик', 'text': 'Какой стиль выбрать для рилса?', 'at': 0.0, 'end': {'word': 'рилса', 'edge': 'end'}, 'y': 1180},
                     {'type': 'reaction', 'kind': 'wow', 'at': {'word': 'ого'}, 'x': 800, 'y': 760}],
        'camera': {'punches': [{'at': {'word': 'ого'}, 'until': {'cut': 0}, 'scale': 1.1}], 'shake': {'word': 'свой'}},
        'captions': {'accents': ['ленте', 'время', 'деньги', 'стиль'], 'suppress': [[0, {'word': 'частый', 'edge': 'end'}], [{'word': 'ответ'}, 'END']]},
    }


def timeline_test():
    """4 с: стоп-кадр с плашкой → лид → субтитры → призыв (для style-test и превью)."""
    return {
        'version': 1, 'template': 'A', 'fps': FPS, 'base': 'base.mov', 'words': 'words.json', 'cuts': [],
        'freeze': {'image': 'freeze.png', 'hold': 0.5, 'fingertip': [583, 1152]},
        'hook': {'kicker': 'ВОТ', 'number': '3', 'lines': ['ПРАВИЛА', 'РИЛСА'], 'sub': ['которые держат', 'зрителя'], 'end': 1.25,
                 'number_at': 0.3, 'accent_at': 0.9},
        'lead': {'title': '3 ПРАВИЛА', 'items': [
            {'qual': 'первое', 'term': 'ХУК', 'at_qual': 1.3, 'at_term': 1.4},
            {'qual': 'второе', 'term': 'РИТМ', 'at_qual': 1.6, 'at_term': 1.7}], 'end': 2.6},
        'cta': {'word': 'ТЕСТ', 'caption': 'пиши в комментариях', 'caption_at': 2.75, 'word_at': 3.0},
        'camera': {'punches': [{'at': 3.0, 'until': 'END'}], 'shake': 3.0},
        'captions': {'accents': ['стиль'], 'suppress': [[0, 1.25], [2.7, 'END']]},
    }


SCRIPT_TEST = [('Вот', 0.1), ('три', 0.3), ('правила', 0.5), ('рилса.', 0.9), ('Хук', 1.3), ('и', 1.55), ('ритм', 1.7),
               ('держат', 2.0), ('стиль.', 2.3), ('Пиши', 2.75), ('«тест».', 3.0)]


def make_project(out, template='A', project_tl=None):
    os.makedirs(out, exist_ok=True)
    if template == 'test':
        total, script, tl, cuts = 3.6, SCRIPT_TEST, timeline_test(), []
    elif template == 'B':
        total, script, cuts = 11.6, SCRIPT_B, CUTS_B
        tl = timeline_b(total)
    else:
        total, script, cuts = 11.6, SCRIPT_A, CUTS_A
        tl = timeline_a(total)
    src = None
    if project_tl:
        from .common import load_json, tl_path
        ptl = load_json(project_tl)
        src = tl_path(project_tl, ptl['base'])
        tl['cuts'] = []
    background(os.path.join(out, 'base.mov'), total, cuts, src_video=src)
    if project_tl:
        fz = (load_json(project_tl).get('freeze') or {})
        if fz.get('image'):
            import shutil
            shutil.copy(tl_path(project_tl, fz['image']), os.path.join(out, 'freeze.png'))
            if fz.get('fingertip'):
                tl['freeze']['fingertip'] = fz['fingertip']
    json.dump(words_of(script, total), open(os.path.join(out, 'words.json'), 'w'), ensure_ascii=False, indent=0)
    if not project_tl:          # лицо силуэта известно по построению — faces.json без детектора
        bounds = [0.0] + list(cuts) + [total]
        segs = []
        for k in range(len(bounds) - 1):
            z = 1.0 if k % 2 == 0 else 1.1
            cx, cy = W / 2, H * 0.33
            med = [round(cx - 125 * z), round(cy - 156 * z), round(cx + 125 * z), round(cy + 156 * z)]
            segs.append({'seg': k, 't0': bounds[k], 't1': bounds[k + 1], 'n': 0, 'approx': False, 'med': med,
                         'box': [med[0] - 15, med[1] - 20, med[2] + 15, med[3] + 20], 'center': [cx, cy]})
        json.dump({'freeze': segs[0]['box'], 'segments': segs}, open(os.path.join(out, 'faces.json'), 'w'), indent=1)
        tl['faces'] = 'faces.json'
    p = os.path.join(out, 'timeline.json')
    json.dump(tl, open(p, 'w'), ensure_ascii=False, indent=1)
    log('проект: %s (%.1f с, шаблон %s)' % (p, total, template))
    return p


def main(a):
    import time
    from . import audio, compose, finalize, plan, qa, render, sheet
    from .common import load_json
    t0 = time.time()
    out = os.path.abspath(a.out)
    tlp = make_project(out, a.template)
    tl = load_json(tlp)
    work = os.path.join(out, 'work', a.style)

    class A:
        pass
    pa = A()
    pa.style, pa.work, pa.verbose = a.style, work, False
    plan.main(pa, tl, tlp)
    render.run_render(a.style, work)
    compose.run_compose(tl, tlp, a.style, work)
    audio.run_audio(tl, tlp, a.style, work)
    res = finalize.run_finalize(work, out, 'demo_' + a.style)
    ok = qa.run_qa(work, out, 'demo_' + a.style)
    sheet.run_sheet(res['master.wav'], work, os.path.join(out, 'sheets'))
    print('демо готово за %.0f с: %s' % (time.time() - t0, res['master.wav']))
    if not ok:
        raise SystemExit(1)
