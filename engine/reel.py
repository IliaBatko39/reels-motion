#!/usr/bin/env python3
"""reels-motion — рилс с говорящей головой: сырые клипы → основа → моушн-оформление в выбранном стиле → готовый файл.

Подкоманды (у каждой есть --help):
  probe      разведка исходников: размер, к/с, поворот, HDR, листы кадров
  stt        fal whisper по словам (ключ — FAL_KEY в окружении); --slow a:b — замедленная перерасшифровка ×2
  cut        основа по раскладке EDL: резы по сетке кадров, слова в шкале основы, этапы, стоп-кадр; --scan — огибающая
  words      таблица слов основы с номерами (для якорей и акцентов), длинные слова
  faces      рамка лица по планам основы
  plan       таймлайн → plan.json (проверка якорей и времени чтения)
  styles     список стилей; --preview — лист с ключевым кадром каждого
  style-new  заготовка нового стиля:  style-new <имя> --from <стиль>
  style-test тест стиля на 3–4 с:     style-test <имя> [--project таймлайн]
  render     накладки в стиле:        render <таймлайн> --style <имя>
  compose    основа + камера + накладки + переходы → video.mp4
  audio      голос, SFX, музыка → master.wav
  finalize   мукс, ТГ-версия, обложка
  qa         приёмка: кадры, цвет, LUFS/TP, зоны, лицо, SFX; --stt — обратная расшифровка
  sheet      листы кадров для просмотра глазами
  build      plan → render → compose → audio → finalize → qa → sheet одной командой
  demo       синтетическое демо без чужого видео — проверка установки
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rm.common import die, load_json, log  # noqa: E402


def tl_load(path):
    if not os.path.exists(path):
        die('нет таймлайна %s' % path)
    return load_json(path), os.path.abspath(path)


def work_of(a):
    return os.path.abspath(a.work or os.path.join(os.path.dirname(os.path.abspath(a.timeline)), 'work', a.style))


def cmd_plan(a):
    from rm import plan
    tl, f = tl_load(a.timeline)
    a.work = work_of(a)
    return plan.main(a, tl, f)


def cmd_render(a):
    from rm import plan, render
    tl, f = tl_load(a.timeline)
    a.work = work_of(a)
    a.verbose = False
    plan.main(a, tl, f)
    render.run_render(a.style, a.work, a.frames, a.png_dir, a.until, a.bg, a.no_blur, a.lock)


def cmd_compose(a):
    from rm import compose
    tl, f = tl_load(a.timeline)
    compose.run_compose(tl, f, a.style, work_of(a), a.frames, a.png_dir, a.until, a.out, a.crf, a.lock)


def cmd_audio(a):
    from rm import audio
    tl, f = tl_load(a.timeline)
    audio.run_audio(tl, f, a.style, work_of(a))


def cmd_finalize(a):
    from rm import finalize
    work = work_of(a)
    finalize.run_finalize(work, a.out or os.path.join(work, 'out'), a.name, a.lock, not a.no_tg)


def cmd_qa(a):
    from rm import qa
    work = work_of(a)
    ok = qa.run_qa(work, a.out or os.path.join(work, 'out'), a.name, a.stt, a.style)
    sys.exit(0 if ok else 1)


def cmd_sheet(a):
    from rm import sheet
    work = work_of(a)
    out = a.out or os.path.join(work, 'out')
    sheet.run_sheet(a.video or os.path.join(out, a.name + '.mp4'), work, os.path.join(out, 'sheets'), a.step)


def cmd_build(a):
    from rm import audio, compose, finalize, plan, qa, render, sheet
    tl, f = tl_load(a.timeline)
    a.work = work_of(a)
    a.verbose = False
    out = a.out or os.path.join(a.work, 'out')
    plan.main(a, tl, f)
    render.run_render(a.style, a.work, lock=a.lock)
    compose.run_compose(tl, f, a.style, a.work, lock=a.lock)
    audio.run_audio(tl, f, a.style, a.work)
    finalize.run_finalize(a.work, out, a.name, a.lock)
    ok = qa.run_qa(a.work, out, a.name, a.stt, a.style)
    sheet.run_sheet(os.path.join(out, a.name + '.mp4'), a.work, os.path.join(out, 'sheets'))
    sys.exit(0 if ok else 1)


def cmd_words(a):
    ws = load_json(a.words)
    if isinstance(ws, dict):
        ws = [{'w': c['text'].strip(), 'start': c['timestamp'][0], 'end': c['timestamp'][1]} for c in ws['chunks']]
    for i, w in enumerate(ws):
        d = w['end'] - w['start']
        print('%4d  %7.3f–%7.3f  %s%s' % (i, w['start'], w['end'], w['w'], '   ⚠ %.2f с — скрытый повтор?' % d if d > 1.2 else ''))


def cmd_faces(a):
    from rm import faces
    tl, f = tl_load(a.timeline)
    faces.main(a, tl, f)


def cmd_styles(a):
    from rm import stylecmd
    stylecmd.cmd_styles(a)


def cmd_style_new(a):
    from rm import stylecmd
    stylecmd.cmd_new(a)


def cmd_style_test(a):
    from rm import stylecmd
    stylecmd.cmd_test(a)


def cmd_demo(a):
    from rm import demo
    demo.main(a)


def main():
    ap = argparse.ArgumentParser(prog='reel.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--lock', help='файл блокировки тяжёлых шагов (или переменная REEL_LOCK)')
    sp = ap.add_subparsers(dest='cmd', required=True)

    p = sp.add_parser('probe', help='разведка исходников')
    p.add_argument('files', nargs='+')
    p.add_argument('--sheets', help='папка для листов кадров')
    p.add_argument('--json', help='сохранить сводку в JSON')
    p.set_defaults(fn=lambda a: __import__('rm.probe', fromlist=['main']).main(a))

    p = sp.add_parser('stt', help='fal whisper по словам (FAL_KEY в окружении)')
    p.add_argument('files', nargs='+')
    p.add_argument('--out', required=True)
    p.add_argument('--level', default='word', choices=['word', 'segment'])
    p.add_argument('--lang', default='ru')
    p.add_argument('--slow', help='окно a:b (с) — замедленная ×2 перерасшифровка: скрытые повторы и потерянные слова')
    p.add_argument('--force', action='store_true')
    p.set_defaults(fn=lambda a: __import__('rm.stt', fromlist=['main']).main(a))

    p = sp.add_parser('cut', help='основа по раскладке (EDL)')
    p.add_argument('edl', nargs='?')
    p.add_argument('--out')
    p.add_argument('--force', action='store_true', help='собрать, даже если рез попадает в речь')
    p.add_argument('--verbose', action='store_true')
    p.add_argument('--scan', nargs='+', metavar='FILE:A:B', help='только огибающая: речь и тихие точки в окне')
    p.set_defaults(fn=lambda a: __import__('rm.cut', fromlist=['main']).scan(a) if a.scan else __import__('rm.cut', fromlist=['main']).main(a))

    p = sp.add_parser('words', help='слова основы с номерами')
    p.add_argument('words')
    p.set_defaults(fn=cmd_words)

    p = sp.add_parser('faces', help='рамка лица по планам')
    p.add_argument('timeline')
    p.add_argument('--out')
    p.set_defaults(fn=cmd_faces)

    def common(p, style=True):
        p.add_argument('timeline')
        if style:
            p.add_argument('--style', required=True, help='имя стиля (reel.py styles)')
        p.add_argument('--work', help='рабочая папка (по умолчанию <папка таймлайна>/work/<стиль>)')

    p = sp.add_parser('plan', help='таймлайн → plan.json')
    common(p)
    p.add_argument('--verbose', action='store_true')
    p.set_defaults(fn=cmd_plan)

    p = sp.add_parser('render', help='накладки в стиле → overlay.mov')
    common(p)
    p.add_argument('--frames', help='только кадры: 0,15,30 или 0-90 → PNG в --png-dir')
    p.add_argument('--png-dir')
    p.add_argument('--until', type=float, help='рендер первых N секунд')
    p.add_argument('--bg', choices=['grey', 'black', 'white'])
    p.add_argument('--no-blur', action='store_true')
    p.set_defaults(fn=cmd_render)

    p = sp.add_parser('compose', help='→ video.mp4')
    common(p)
    p.add_argument('--frames', help='диапазон a-b → JPEG в --png-dir')
    p.add_argument('--png-dir')
    p.add_argument('--until', type=float)
    p.add_argument('--out')
    p.add_argument('--crf', type=int, default=16)
    p.set_defaults(fn=cmd_compose)

    p = sp.add_parser('audio', help='→ master.wav')
    common(p)
    p.set_defaults(fn=cmd_audio)

    for nm, fn in (('finalize', cmd_finalize), ('qa', cmd_qa), ('sheet', cmd_sheet), ('build', cmd_build)):
        p = sp.add_parser(nm)
        common(p)
        p.add_argument('--out', help='папка выдачи (по умолчанию <work>/out)')
        p.add_argument('--name', default='reel')
        if nm == 'finalize':
            p.add_argument('--no-tg', action='store_true')
        if nm in ('qa', 'build'):
            p.add_argument('--stt', action='store_true', help='обратная расшифровка через fal (FAL_KEY)')
        if nm == 'sheet':
            p.add_argument('--video')
            p.add_argument('--step', type=float, default=0.25)
        p.set_defaults(fn=fn)

    p = sp.add_parser('styles', help='список стилей и превью')
    p.add_argument('--preview', action='store_true', help='лист: ключевые кадры каждого стиля')
    p.add_argument('--out', help='куда положить лист превью')
    p.add_argument('--only', help='через запятую — какие стили показать')
    p.set_defaults(fn=cmd_styles)

    p = sp.add_parser('style-new', help='заготовка нового стиля')
    p.add_argument('name')
    p.add_argument('--from', dest='src', default='base', help='от какого стиля оттолкнуться')
    p.add_argument('--dir', help='куда положить (по умолчанию REEL_STYLE_HOME или ~/.reels-motion/styles)')
    p.add_argument('--keep-components', action='store_true', help='оставить компоненты исходного стиля (иначе — базовые по токенам)')
    p.add_argument('--description', default='')
    p.set_defaults(fn=cmd_style_new)

    p = sp.add_parser('style-test', help='тест стиля на 3–4 с: стоп-кадр с плашкой, лид, субтитры, призыв')
    p.add_argument('name')
    p.add_argument('--project', help='таймлайн проекта: фон берётся из его основы и стоп-кадра')
    p.add_argument('--out', help='папка теста')
    p.set_defaults(fn=cmd_style_test)

    p = sp.add_parser('demo', help='синтетическое демо: проверка установки')
    p.add_argument('--style', default='sticker')
    p.add_argument('--out', required=True)
    p.add_argument('--template', default='A', choices=['A', 'B'])
    p.set_defaults(fn=cmd_demo)

    a = ap.parse_args()
    if a.lock:
        os.environ['REEL_LOCK'] = a.lock
    a.fn(a)


if __name__ == '__main__':
    main()
