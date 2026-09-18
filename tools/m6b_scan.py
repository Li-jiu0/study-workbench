# -*- coding: utf-8 -*-
"""R88-M6续：全树 emoji 残留扫描（只读，不落盘改动）
- 区段：\U0001F300-\U0001FAFF, \u2600-\u27BF, \u2190-\u21FF, \u2B00-\u2BFF, \uFE0F
- 跳过：assets/icon-map.js、assets/common.css（注释=映射文档）、朋友圈发布.html（M3）、assets/xt-profile.js（M5）
- 扫描：*.html 顶层 + assets/*.js
- 输出：逐条 file:line + 片段 + 自动初判
"""
import os, re, json

ROOT = r'D:\下载的文件\学习工作台'
EMOJI = re.compile('[\U0001F300-\U0001FAFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]')

SKIP_FILES = {
    'assets/icon-map.js', 'assets/common.css', '朋友圈发布.html', 'assets/xt-profile.js',
}
# 备份 / 临时目录不扫
SKIP_DIR_PARTS = ('备份', '.tmp_eng', '.qa', 'tools', 'node_modules', '.git')

def iter_targets():
    # 顶层 html
    for fn in os.listdir(ROOT):
        if fn.lower().endswith('.html'):
            yield fn
    # assets/*.js
    ad = os.path.join(ROOT, 'assets')
    for dp, dns, fns in os.walk(ad):
        dns[:] = [d for d in dns if d not in ('node_modules',)]
        for fn in fns:
            if fn.lower().endswith('.js'):
                yield os.path.relpath(os.path.join(dp, fn), ROOT)

# 功能定位线索（该行像是 UI 图标的位置）
FUNC_HINTS = [
    'data-icon', 'class="nav-icon"', 'btn', 'button', ' onclick=', 'title="',
    'nav-item', 'tab', 'menu', 'panel', 'chip', 'fn"', 'icon', 'entry', 'close',
    '<span', '<div', '<a ', 'placeholder=',
]

hits = []
for rel in sorted(set(iter_targets())):
    if rel.replace('\\', '/') in SKIP_FILES:
        continue
    p = os.path.join(ROOT, rel)
    try:
        raw = open(p, 'rb').read()
    except Exception:
        continue
    lone = raw.count(b'\n') - raw.count(b'\r\n')
    eol = 'CRLF' if lone == 0 and b'\r\n' in raw else ('LF' if lone > 0 else '?')
    text = raw.decode('utf-8', 'replace')
    lines = text.split('\r\n') if lone == 0 else text.split('\n')
    for i, l in enumerate(lines, 1):
        if EMOJI.search(l):
            # 提取该行所有 emoji 字符
            ems = ''.join(ch for ch in l if EMOJI.match(ch))
            stripped = l.strip()
            is_comment = stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*') or stripped.startswith('<!--')
            hint = any(h in l for h in FUNC_HINTS)
            hits.append({
                'file': rel.replace('\\', '/'), 'line': i, 'emoji': ems,
                'comment': is_comment, 'ui_hint': hint, 'eol': eol,
                'text': stripped[:150],
            })

with open(os.path.join(ROOT, 'tools', 'm6b_hits.json'), 'w', encoding='utf-8') as f:
    json.dump(hits, f, ensure_ascii=False, indent=1)

# 汇总
total = len(hits)
by_file = {}
for h in hits:
    by_file.setdefault(h['file'], []).append(h)
summ = ['TOTAL HITS = %d, FILES = %d' % (total, len(by_file))]
for f in sorted(by_file):
    non_comment = sum(1 for h in by_file[f] if not h['comment'])
    summ.append('  %-38s hits=%d nonComment=%d eol=%s' % (f, len(by_file[f]), non_comment, by_file[f][0]['eol']))
with open(os.path.join(ROOT, 'tools', 'm6b_summary.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(summ) + '\n')
