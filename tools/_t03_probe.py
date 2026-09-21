# -*- coding: utf-8 -*-
import os, json
base = r'D:\下载的文件\学习工作台'
files = [
    r'assets\ai-settings.js',
    r'ai-settings.html',
    r'assets\ai-service.js',
    r'assets\ai-config.js',
    r'assets\ai-page.js',
    r'assets\xt-aiusage.js',
    r'assets\ai-cap-registry.js',
    r'assets\ai-cap-video.js',
    r'assets\ai-cap-3d.js',
    r'assets\ai-cap-translate.js',
]
out = []
for f in files:
    p = os.path.join(base, f)
    exists = os.path.exists(p)
    if not exists:
        out.append({'file': f, 'exists': False})
        continue
    with open(p, 'rb') as fh:
        b = fh.read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n')
    out.append({'file': f, 'exists': True, 'size': len(b),
                'crlf': crlf, 'lf_total': lf, 'lf_only': lf - crlf,
                'eol': 'CRLF' if crlf > 0 else 'LF'})
with open(os.path.join(base, 'tools', '_t03_probe_out.json'), 'w', encoding='utf-8') as w:
    w.write(json.dumps(out, ensure_ascii=False, indent=1))
print('done')
