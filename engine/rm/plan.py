"""Таймлайн (шкала основы, якоря на слова и склейки) → plan.json (шкала выхода со стоп-кадром, всё числами).

Схема таймлайна — reference/timeline-schema.md. plan.json читают все три стиля одинаково.
"""
import os
import re

from .common import H, W, die, ffprobe_json, load_json, log, save_json, style_conf, tl_path
from .typo import lint as typo_lint
from .typo import typo

PUNCT_END = re.compile(r'[.,!?:;—»]$')
FUNC = {'в', 'на', 'по', 'и', 'с', 'у', 'то', 'он', 'им', 'ему', 'как', 'а', 'ты', 'мы', 'к', 'о', 'из', 'за', 'до', 'от', 'но', 'же'}
DIGIT_WORDS = {'ноль': 0, 'один': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7,
               'восемь': 8, 'девять': 9, 'десять': 10, 'первая': 1, 'первый': 1, 'вторая': 2, 'второй': 2, 'третья': 3, 'третий': 3,
               'четвёртый': 4, 'четвертый': 4, 'четвёртая': 4, 'четвертая': 4}


def norm(s):
    return re.sub(r'[^\w-]+', '', str(s).lower().replace('ё', 'е')).strip('-')


def clean_upper(w):
    s = w.replace('«', '').replace('»', '').replace('"', '')
    s = re.sub(r'[.,!?:;]+$', '', s)
    return s.upper()


class Resolver:
    def __init__(self, words, cuts, total, fps):
        self.words, self.cuts, self.total, self.fps = words, cuts, total, fps
        self.errs = []

    def t(self, v, where, default=None):
        if v is None:
            if default is None:
                self.errs.append('%s: время не задано' % where)
                return 0.0
            return default
        if isinstance(v, (int, float)):
            return float(v)
        if v == 'END':
            return self.total
        if isinstance(v, dict):
            off = float(v.get('offset', 0)) + float(v.get('offset_f', 0)) / self.fps
            edge = 'end' if v.get('edge') == 'end' else 'start'
            if 'cut' in v:
                k = int(v['cut'])
                if not 0 <= k < len(self.cuts):
                    self.errs.append('%s: склейки №%d нет (всего %d)' % (where, k, len(self.cuts)))
                    return 0.0
                return self.cuts[k] + off
            if 'w' in v:
                i = int(v['w'])
                if not 0 <= i < len(self.words):
                    self.errs.append('%s: слова №%d нет' % (where, i))
                    return 0.0
                return self.words[i][edge] + off
            if 'word' in v:
                key = norm(v['word'])
                after = self.t(v['after'], where) if 'after' in v else -1
                hits = [w for w in self.words if w['start'] >= after - 1e-6 and
                        (norm(w['w']) == key or (len(key) >= 4 and norm(w['w']).startswith(key)))]
                k = int(v.get('occurrence', 1))
                if len(hits) < k:
                    cand = sorted({w['w'] for w in self.words if key[:3] in norm(w['w'])})[:8]
                    self.errs.append('%s: слово «%s» (#%d) не найдено; похожие: %s' % (where, v['word'], k, cand))
                    return 0.0
                return hits[k - 1][edge] + off
        self.errs.append('%s: непонятное время %r' % (where, v))
        return 0.0


def group_words(words, cfg, breaks, cuts):
    """Карточки субтитров: до max_words слов и max_chars знаков, разрыв на пунктуации, паузе, заглавной;
    висячий предлог уходит в следующую карточку; одиночный предлог прилипает к следующей."""
    mw, mc, pause = cfg.get('max_words', 3), cfg.get('max_chars', 18), cfg.get('pause', 0.35)
    txt = lambda idx: ' '.join(clean_upper(words[k]['w']) for k in idx)
    out, cur = [], []
    for i, w in enumerate(words):
        if cur:
            prev = words[cur[-1]]
            if (len(cur) == mw or len(txt(cur + [i])) > mc or PUNCT_END.search(prev['w'])
                    or w['start'] - prev['end'] > pause or w['w'][:1].isupper() or i in breaks):
                hang = (cfg.get('hang', True) and len(cur) > 1 and clean_upper(prev['w']).lower() in FUNC
                        and not re.search(r'[.,!?:;]$', prev['w']) and not w['w'][:1].isupper())
                if hang:
                    out.append(cur[:-1])
                    cur = [cur[-1]]
                else:
                    out.append(cur)
                    cur = []
                if len(txt(cur + [i])) > mc or len(cur) == mw:
                    out.append(cur)
                    cur = []
        cur.append(i)
    if cur:
        out.append(cur)
    res = []
    for g in out:
        if res and len(res[-1]) == 1 and clean_upper(words[res[-1][0]]['w']).lower() in FUNC:
            res[-1] = res[-1] + g
        else:
            res.append(g)
    if cfg.get('split_on_cuts'):
        seg = lambda t: sum(1 for c in cuts if t >= c - 1e-6)
        sp = []
        for g in res:
            parts = {}
            for k in g:
                parts.setdefault(seg(words[k]['start']), []).append(k)
            sp += [parts[k] for k in sorted(parts)]
        res = sp
    return [g for g in res if g]


def lines_of(x):
    if x is None:
        return []
    return list(x) if isinstance(x, list) else [x]


def build(tl, tlfile, style):
    sc = style_conf(style)
    fps = int(tl.get('fps', 30))
    base = tl_path(tlfile, tl['base'])
    if not os.path.exists(base):
        die('нет основы: %s' % base)
    beats = load_json(tl_path(tlfile, tl['beats'])) if tl.get('beats') else {}
    st = (ffprobe_json(base, '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,width,height').get('streams') or [{}])[0]
    if (int(st.get('width', 0)), int(st.get('height', 0))) != (W, H):
        die('основа должна быть %d×%d (сейчас %s×%s) — соберите её командой cut' % (W, H, st.get('width'), st.get('height')))
    nb = int(tl.get('frames') or beats.get('frames') or st.get('nb_frames') or 0)
    if not nb:
        from .common import count_frames
        nb = count_frames(base)
    total = nb / fps
    words = load_json(tl_path(tlfile, tl['words'])) if tl.get('words') else []
    if isinstance(words, dict):      # формат fal chunks
        words = [{'w': c['text'].strip(), 'start': c['timestamp'][0], 'end': c['timestamp'][1]} for c in words.get('chunks', [])]
    cuts = [float(c) for c in (tl.get('cuts') if tl.get('cuts') is not None else beats.get('cuts', []))]
    fz = dict(beats.get('freeze') or {})
    if fz.get('image'):
        fz['image'] = os.path.join(os.path.dirname(tl_path(tlfile, tl['beats'])), fz['image'])
    fz.update({k: (tl_path(tlfile, v) if k == 'image' else v) for k, v in (tl.get('freeze') or {}).items()})
    hold = float(fz.get('hold', 0.5)) if fz.get('image') else 0.0
    hold_f = int(round(hold * fps))
    hold = hold_f / fps
    R = Resolver(words, cuts, total, fps)
    o = lambda tb: round(tb + hold, 4)                   # основа → выход
    T = lambda v, where, default=None: o(R.t(v, where, default))
    warns = []

    plan = {'version': 1, 'style': style, 'template': tl.get('template', 'A'), 'fps': fps, 'size': [W, H],
            'N': nb + hold_f, 'duration': round((nb + hold_f) / fps, 4), 'base_frames': nb, 'hold': hold, 'hold_f': hold_f,
            'cuts': [o(c) for c in cuts], 'tip': fz.get('fingertip') if hold_f else None, 'lang': tl.get('lang', 'ru'),
            'freeze_image': fz.get('image') if hold_f else None}
    if plan['tip'] and plan['tip'][0] <= 1:
        plan['tip'] = [round(plan['tip'][0] * W), round(plan['tip'][1] * H)]

    # слова + субтитры
    cap = tl.get('captions') or {}
    ccfg = dict(sc.get('captions', {}))
    ccfg.update({k: v for k, v in cap.items() if k in ('max_words', 'max_chars', 'pause', 'lead', 'tail', 'split_on_cuts', 'hang')})
    acc_i = {a for a in cap.get('accents', []) if isinstance(a, int)}
    acc_s = {norm(a) for a in cap.get('accents', []) if isinstance(a, str)}
    pw = []
    for i, w in enumerate(words):
        pw.append({'i': i, 'w': clean_upper(w['w']), 'raw': w['w'], 'text': typo(w['w']).replace('"', ''),
                   's': o(w['start']), 'e': o(w['end']), 'acc': i in acc_i or norm(w['w']) in acc_s})
    plan['words'] = pw
    sup = []
    for k, pair in enumerate(cap.get('suppress', [])):
        sup.append([T(pair[0], 'captions.suppress[%d]' % k), T(pair[1], 'captions.suppress[%d]' % k)])
    caps = []
    if not cap.get('off'):
        gs = group_words(words, ccfg, set(cap.get('breaks', [])), cuts)
        lead, tail = ccfg.get('lead', 0.04), ccfg.get('tail', 0.30)
        for gi, g in enumerate(gs):
            s = words[g[0]]['start'] - lead
            nxt = words[gs[gi + 1][0]]['start'] - lead if gi + 1 < len(gs) else 1e9
            e = min(nxt, words[g[-1]]['end'] + tail)
            if ccfg.get('split_on_cuts'):
                c_after = [c for c in cuts if c > words[g[0]]['start'] + 1e-6]
                if c_after:
                    e = min(e, c_after[0])
                c_before = [c for c in cuts if c <= words[g[0]]['start'] + 1e-6]
                if c_before:
                    s = max(s, c_before[-1])
            so, eo = o(s), o(e)
            if any(a <= o(words[g[0]]['start']) < b for a, b in sup):
                continue
            eo = min([eo] + [a for a, b in sup if a > so])
            if eo - so < 1.5 / fps:
                continue
            caps.append({'s': round(so, 4), 'e': round(eo, 4), 'words': g})
    plan['captions'] = caps
    plan['captions_suppress'] = sup

    tpl = plan['template']
    # хук / вопрос
    for key in ('hook', 'question'):
        h = tl.get(key)
        if not h:
            continue
        d = {'id': key, 'kicker': h.get('kicker', ''), 'number': str(h.get('number', '')) if h.get('number') is not None else '',
             'lines': [typo(x) for x in lines_of(h.get('lines'))], 'sub': [typo(x) for x in lines_of(h.get('sub'))],
             's': 0.0, 'e': T(h.get('end'), key + '.end')}
        d['number_at'] = T(h['number_at'], key + '.number_at') if h.get('number_at') is not None else None
        d['accent_at'] = T(h['accent_at'], key + '.accent_at') if h.get('accent_at') is not None else None
        plan[key] = d
    # лид
    if tl.get('lead'):
        L = tl['lead']
        items = []
        for k, it in enumerate(L.get('items', [])):
            items.append({'qual': typo(it.get('qual', '')), 'term': typo(it['term']), 'dir': it.get('dir', 'up'),
                          'q_t': T(it.get('at_qual', it.get('at_term')), 'lead.items[%d].at_qual' % k),
                          't_t': T(it.get('at_term'), 'lead.items[%d].at_term' % k)})
        plan['lead'] = {'title': typo(L.get('title', '')), 'items': items,
                        'e': T(L.get('end'), 'lead.end', default=None if not tl.get('blocks') else R.t(tl['blocks'][0].get('start'), 'blocks[0].start'))}
    # блоки (А) и сферы (Б)
    for key in ('blocks', 'spheres'):
        arr = tl.get(key) or []
        res = []
        for k, b in enumerate(arr):
            s = T(b.get('start'), '%s[%d].start' % (key, k))
            res.append({'id': '%s%d' % (key[0], k + 1), 'num': str(b.get('num', k + 1)), 'term': typo(b.get('term', b.get('name', ''))),
                        'expl': [typo(x) for x in lines_of(b.get('expl', b.get('text')))], 's': s, 'e': None, '_e': b.get('end')})
        plan[key] = res
    # призыв, ответ, эмоция
    if tl.get('cta'):
        c = tl['cta']
        plan['cta'] = {'word': typo(c['word']), 'caption': typo(c.get('caption', '')), 'tag_t': T(c.get('caption_at', c.get('word_at')), 'cta.caption_at'),
                       'word_t': T(c.get('word_at'), 'cta.word_at')}
        plan['cta']['s'] = T(c['start'], 'cta.start') if c.get('start') is not None else plan['cta']['tag_t']
    if tl.get('answer'):
        c = tl['answer']
        plan['answer'] = {'word': typo(c['text']), 'caption': typo(c.get('caption', '')), 'word_t': T(c.get('at'), 'answer.at')}
        plan['answer']['tag_t'] = plan['answer']['word_t']
        plan['answer']['s'] = T(c['start'], 'answer.start') if c.get('start') is not None else plan['answer']['word_t']
    if tl.get('emotion'):
        e = tl['emotion']
        ws = e['words'] if isinstance(e.get('words'), list) else str(e.get('text', '')).split()
        ats = e.get('at') or [None] * len(ws)
        s0 = T(e.get('start'), 'emotion.start')
        plan['emotion'] = {'words': [typo(x) for x in ws], 'accent': e.get('accent', len(ws) - 1), 's': s0,
                           'e': T(e.get('end'), 'emotion.end'),
                           'word_t': [T(a, 'emotion.at[%d]' % k) if a is not None else round(s0 + 0.06 * k, 4) for k, a in enumerate(ats)]}
    # концы блоков: следующий блок → призыв/ответ → конец
    for key in ('blocks', 'spheres'):
        arr = plan[key]
        tail = plan.get('cta', plan.get('answer', {})).get('s', o(total))
        for k, b in enumerate(arr):
            nxt = arr[k + 1]['s'] if k + 1 < len(arr) else tail
            b['e'] = T(b.pop('_e'), '%s.end' % key) if b.get('_e') is not None else nxt
            b.pop('_e', None)
    # петли
    loops = []
    for k, L in enumerate(tl.get('loops') or []):
        loops.append({'id': 'loop%d' % (k + 1), 'text': typo(L['text']), 'kicker': typo(L.get('kicker', '')),
                      'lines': [typo(x) for x in lines_of(L.get('lines'))], 's': T(L.get('start'), 'loops[%d].start' % k),
                      'e': T(L.get('end'), 'loops[%d].end' % k)})
    plan['loops'] = loops
    # списки-чипы
    lists = []
    for k, L in enumerate(tl.get('lists') or []):
        items = [{'text': typo(it['text']), 'icon': it.get('icon', 'check'), 't': T(it.get('at'), 'lists[%d].items[%d].at' % (k, j))}
                 for j, it in enumerate(L.get('items', []))]
        lists.append({'id': 'list%d' % (k + 1), 'items': items, 's': min(i['t'] for i in items) if items else 0,
                      'e': T(L.get('end'), 'lists[%d].end' % k)})
    plan['lists'] = lists
    # свободные элементы: реакции, стикеры, стрелки, выноски, комментарий, акцентное слово, прогресс/счётчик
    DUR = {'reaction': 1.3, 'sticker': 2.0, 'arrow': 2.0, 'callout': 2.5, 'comment': 2.5, 'accent': 1.6}
    els = []
    for k, e in enumerate(tl.get('elements') or []):
        d = dict(e)
        typ = d.get('type')
        if not typ:
            R.errs.append('elements[%d]: нет type' % k)
            continue
        where = 'elements[%d] (%s)' % (k, typ)
        st0 = d.pop('at', None)
        st0 = d.pop('start', None) if st0 is None else st0
        sv = T(st0, where + '.at') if st0 is not None else None
        if d.get('end') is not None:
            ev = T(d.pop('end'), where + '.end')
        else:
            d.pop('end', None)
            ev = round(sv + float(d.pop('dur', DUR.get(typ, 2.0))), 4) if sv is not None else None
        for key in ('from', 'to'):
            if d.get(key) == 'tip':
                d[key] = plan['tip'] or [583, 1152]
        for key in ('text', 'label'):
            if key in d:
                d[key] = typo(d[key])
        d.update({'type': typ, 's': sv, 'e': ev})
        if d['s'] is None:
            d.pop('s'); d.pop('e')
        els.append(d)
    plan['elements'] = els
    # камера
    cam = tl.get('camera') or {}
    pk = sc.get('camera', {}).get('punch_scale', 1.065)
    pun = []
    for k, p in enumerate(cam.get('punches', [])):
        a = T(p.get('at'), 'camera.punches[%d].at' % k)
        seg_end = next((c for c in plan['cuts'] if c > a + 1e-6), plan['duration'])
        b = T(p['until'], 'camera.punches[%d].until' % k) if p.get('until') is not None else seg_end
        pun.append([a, min(b, plan['duration']), float(p.get('scale', pk))])
    plan['camera'] = {'punches': pun, 'shake': T(cam['shake'], 'camera.shake') if cam.get('shake') is not None else None}
    # планы: лицо, масштаб
    faces = load_json(tl_path(tlfile, tl['faces'])) if tl.get('faces') and os.path.exists(tl_path(tlfile, tl['faces'])) else None
    if tl.get('faces') and not faces:
        warns.append('faces.json не найден — центр камеры по умолчанию; запустите reel.py faces')
    bounds = [0.0] + cuts + [total]
    scales = cam.get('shot_scale') or [1.0] * (len(bounds) - 1)
    segs = []
    for k in range(len(bounds) - 1):
        f = faces['segments'][k] if faces and k < len(faces.get('segments', [])) else None
        med = f['med'] if f else [390, 360, 690, 720]
        segs.append({'t0': o(bounds[k]), 't1': o(bounds[k + 1]), 'med': med, 'box': f['box'] if f else med,
                     'center': f['center'] if f else [(med[0] + med[2]) / 2, (med[1] + med[3]) / 2],
                     'scale': float(scales[k]) if k < len(scales) else 1.0})
    plan['segments'] = segs
    plan['freeze_face'] = (faces or {}).get('freeze')
    # швы этапов (для whip и вспышки — решает стиль)
    seams = []
    if tpl == 'A':
        seams += [{'kind': 'block', 'i': k, 't': b['s']} for k, b in enumerate(plan['blocks'])]
        if plan.get('cta'):
            seams.append({'kind': 'cta', 'i': 0, 't': plan['cta']['s']})
    else:
        if plan.get('emotion'):
            seams.append({'kind': 'emotion', 'i': 0, 't': plan['emotion']['s']})
        seams += [{'kind': 'block', 'i': k, 't': b['s']} for k, b in enumerate(plan['spheres'])]
        if plan.get('answer'):
            seams.append({'kind': 'answer', 'i': 0, 't': plan['answer']['s']})
    plan['seams'] = seams
    plan['audio'] = tl.get('audio') or {}

    # линты
    def reading(where, text, s, e):
        n = len([x for x in re.split(r'\s+', text) if x])
        need = 0.3 * n + 0.5
        if e - s < need - 1e-6:
            warns.append('%s: «%s» на экране %.2f с, для %d слов нужно ≥ %.2f с' % (where, text[:40], e - s, n, need))
        for er in typo_lint(text):
            warns.append('%s: %s в «%s»' % (where, er, text[:40]))

    for key in ('hook', 'question'):
        if plan.get(key):
            h = plan[key]
            reading(key, ' '.join([h['kicker'], h['number']] + h['lines'] + h['sub']), h['s'], h['e'])
    for b in plan['blocks'] + plan['spheres']:
        reading(b['id'], b['term'] + ' ' + ' '.join(b['expl']), b['s'], b['e'])
    for L in loops:
        reading(L['id'], L['text'], L['s'], L['e'])
    spoken = ' '.join(norm(w['w']) for w in words)
    for key in ('hook', 'question', 'cta', 'answer'):
        d = plan.get(key)
        if not d:
            continue
        txt = ' '.join(str(x) for x in [d.get('number', ''), d.get('word', '')] + d.get('lines', []) + d.get('sub', []))
        for num in re.findall(r'\d+', txt):
            if num not in spoken and int(num) not in DIGIT_WORDS.values():
                warns.append('%s: цифра %s не найдена в речи — цифры в кадре только из голоса' % (key, num))
    if tpl == 'A':
        for need in ('hook', 'lead', 'blocks', 'cta'):
            if not plan.get(need):
                warns.append('шаблон А без «%s»' % need)
    else:
        for need in ('question', 'emotion', 'spheres', 'answer'):
            if not plan.get(need):
                warns.append('шаблон Б без «%s»' % need)
    if R.errs:
        for e in R.errs:
            log('ОШИБКА: ' + e)
        die('таймлайн не разрешился (%d ошибок)' % len(R.errs))
    plan['warnings'] = warns
    return plan


def main(a, tl, tlfile):
    plan = build(tl, tlfile, a.style)
    os.makedirs(a.work, exist_ok=True)
    out = os.path.join(a.work, 'plan.json')
    save_json(plan, out)
    print('plan.json: стиль %s, шаблон %s, %d кадров (%.2f с, стоп-кадр %d), слов %d, карточек субтитров %d'
          % (plan['style'], plan['template'], plan['N'], plan['duration'], plan['hold_f'], len(plan['words']), len(plan['captions'])))
    for w in plan['warnings']:
        print('  ⚠ ' + w)
    if a.verbose:
        for c in plan['captions']:
            print('  %6.2f–%6.2f  %s' % (c['s'], c['e'], ' '.join(plan['words'][i]['w'] + ('*' if plan['words'][i]['acc'] else '') for i in c['words'])))
    return plan
