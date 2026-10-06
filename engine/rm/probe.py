"""Разведка исходников: ffprobe (размер, к/с, поворот, HDR-метки, звук) + лист кадров на каждый файл."""
import os

from .common import ffprobe_json, log, run

HDR_TRC = {'arib-std-b67': 'HLG', 'smpte2084': 'PQ'}


def info(path):
    j = ffprobe_json(path, '-show_streams', '-show_format')
    v = next((s for s in j.get('streams', []) if s.get('codec_type') == 'video'), None)
    a = next((s for s in j.get('streams', []) if s.get('codec_type') == 'audio'), None)
    out = {'file': path, 'duration': float(j.get('format', {}).get('duration', 0) or 0)}
    if v:
        rot = 0
        for sd in v.get('side_data_list', []) or []:
            if 'rotation' in sd:
                rot = int(sd['rotation'])
        rot = rot or int((v.get('tags') or {}).get('rotate', 0) or 0)
        num, den = (v.get('r_frame_rate') or '0/1').split('/')
        w, h = int(v.get('width', 0)), int(v.get('height', 0))
        if abs(rot) in (90, 270):
            w, h = h, w
        out.update(codec=v.get('codec_name'), size=[w, h], fps=round(float(num) / float(den or 1), 3), rotation=rot,
                   pix_fmt=v.get('pix_fmt'), color_transfer=v.get('color_transfer'), color_primaries=v.get('color_primaries'),
                   color_space=v.get('color_space'), hdr=HDR_TRC.get(v.get('color_transfer')), frames=int(v.get('nb_frames', 0) or 0))
    if a:
        out['audio'] = {'codec': a.get('codec_name'), 'sr': int(a.get('sample_rate', 0) or 0), 'channels': a.get('channels')}
    return out


def in_matrix(meta):
    """Матрица входа для пересчёта в BT.709: у HDR айфона метки bt2020 — без пересчёта Meta не перекодирует ролик."""
    cs = (meta.get('color_space') or '').lower()
    return 'bt2020' if cs.startswith('bt2020') or meta.get('hdr') else 'bt709'


def sheet(path, out_jpg, every=15, cols=10, rows=3, width=180, meta=None):
    meta = meta or info(path)
    m = in_matrix(meta)
    vf = (f"select='not(mod(n\\,{every}))',scale={width}:-2:in_color_matrix={m}:out_color_matrix=bt709,"
          f"drawtext=text='%{{pts\\:hms}}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile={cols}x{rows}")
    try:
        run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', vf, '-frames:v', '1', '-q:v', '3', out_jpg])
    except Exception:
        vf = f"select='not(mod(n\\,{every}))',scale={width}:-2,tile={cols}x{rows}"     # ffmpeg без drawtext
        run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', vf, '-frames:v', '1', '-q:v', '3', out_jpg])
    return out_jpg


def main(a):
    if a.sheets:
        os.makedirs(a.sheets, exist_ok=True)
    rows = []
    for p in a.files:
        m = info(p)
        rows.append(m)
        warn = []
        if m.get('hdr'):
            warn.append('HDR %s → на выходе нужен пересчёт в BT.709 (cut делает сам)' % m['hdr'])
        if m.get('rotation'):
            warn.append('поворот %d° (ffmpeg развернёт сам)' % m['rotation'])
        if m.get('fps') and abs(m['fps'] - round(m['fps'])) > 0.01:
            warn.append('дробные к/с %.3f — сетка кадров пересчитается к целым' % m['fps'])
        if not m.get('audio'):
            warn.append('нет звука')
        print('%s  %s %sx%s %.3f к/с %.2f с  %s  звук %s%s' % (
            os.path.basename(p), m.get('codec'), *(m.get('size') or ['?', '?']), m.get('fps') or 0, m['duration'],
            m.get('color_transfer') or '-', (m.get('audio') or {}).get('sr', '-'), ('  ⚠ ' + '; '.join(warn)) if warn else ''))
        if a.sheets:
            jpg = os.path.join(a.sheets, os.path.splitext(os.path.basename(p))[0] + '_sheet.jpg')
            sheet(p, jpg, meta=m)
            log('  лист кадров: ' + jpg)
    if a.json:
        import json
        json.dump(rows, open(a.json, 'w'), ensure_ascii=False, indent=1)
