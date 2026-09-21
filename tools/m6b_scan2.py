# -*- coding: utf-8 -*-
"""R88-M6续 v2：精准识别「功能性 UI 图标混进 emoji」
判定：一行同时满足
  (A) 处于可交互 UI 结构：<button / class含btn|tab|nav|menu|item|fn|chip|icon|entry|toolbar|action / onclick= / role="button" / <a
  (B) emoji 出现在「行首或紧跟标签/空白」的图标位（近似：emoji 前后是 > 或 " 或行首 或空格+中文）
  (C) 非注释行、非纯装饰
"""
import os, re, json
ROOT = r'D:\下载的文件\学习工作台'
EMOJI = re.compile('[\U0001F300-\U0001FAFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]')
SKIP_FILES = {'assets/icon-map.js', 'assets/common.css', '朋友圈发布.html', 'assets/xt-profile.js'}

def iter_targets():
    for fn in os.listdir(ROOT):
        if fn.lower().endswith('.html'):
            yield fn
    ad = os.path.join(ROOT, 'assets')
    for dp, dns, fns in os.walk(ad):
        dns[:] = [d for d in dns if d != 'node_modules']
        for fn in fns:
            if fn.lower().endswith('.js'):
                yield os.path.relpath(os.path.join(dp, fn), ROOT)

UI_STRUCT = re.compile(r'(<button|onclick=|<a\s|role="button"|class="[^"]*(btn|tab|nav|menu|item|chip|icon|entry|toolbar|action|fn|bar)[^"]*"|title=")')
# icon-position: emoji at start of visible text, or right after a tag/quote/space (not mid-sentence)
ICON_POS = re.compile(r'(>|"|\']|\s|^)\s*[\U0001F300-\U0001FAFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]')

functional, decorative, unsure = [], [], []
for rel in sorted(set(iter_targets())):
    if rel.replace('\\', '/') in SKIP_FILES:
        continue
    p = os.path.join(ROOT, rel)
    raw = open(p, 'rb').read()
    lone = raw.count(b'\n') - raw.count(b'\r\n')
    text = raw.decode('utf-8', 'replace')
    lines = text.split('\r\n') if lone == 0 else text.split('\n')
    for i, l in enumerate(lines, 1):
        if not EMOJI.search(l):
            continue
        s = l.strip()
        is_comment = s.startswith(('//', '/*', '*', '<!--'))
        if is_comment:
            continue
        if s.lower().endswith(('.js', '.html', '.css')) or rel.endswith('.js') and False:
            pass
        has_ui = bool(UI_STRUCT.search(l))
        has_iconpos = bool(ICON_POS.search(l))
        ems = ''.join(ch for ch in l if EMOJI.match(ch))
        rec = {'file': rel.replace('\\', '/'), 'line': i, 'emoji': ems, 'text': s[:160]}
        # 数据/内容类文件排除（纯内容文案）
        contentish = any(seg in rel for seg in ('data-', 'data/', 'emoji/manifest', 'quest', 'topic-express', 'comm-cases', 'roleplay', 'iv-prep', 'iv-after', 'ppt-tips', 'ppt-class'))
        if contentish:
            decorative.append(rec)
        elif has_ui and has_iconpos and not rel.endswith('.js') is False:
            functional.append(rec)
        elif has_ui and has_iconpos:
            functional.append(rec)
        elif has_ui:
            unsure.append(rec)
        else:
            decorative.append(rec)

with open(os.path.join(ROOT, 'tools', 'm6b2.json'), 'w', encoding='utf-8') as f:
    json.dump({'functional': functional, 'unsure': unsure, 'decorative_count': len(decorative)}, f, ensure_ascii=False, indent=1)

def dump(name, arr):
    out = ['== %s (%d) ==' % (name, len(arr))]
    for r in arr:
        out.append('%s:%d [%s] %s' % (r['file'], r['line'], r['emoji'], r['text']))
    return '\n'.join(out)
open(os.path.join(ROOT, 'tools', 'm6b2_functional.txt'), 'w', encoding='utf-8').write(
    dump('FUNCTIONAL(UI)', functional) + '\n\n' + dump('UNSURE', unsure) + '\n\n== DECORATIVE count = %d ==\n' % len(decorative))
print('done', len(functional), len(unsure), len(decorative))
