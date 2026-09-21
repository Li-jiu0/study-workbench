# -*- coding: utf-8 -*-
"""R88-M6续 v3：精准识别「功能性 UI 图标混进 emoji」（只读）"""
import os, re, json
ROOT = r'D:\下载的文件\学习工作台'
EMOJI = re.compile('[\U0001F300-\U0001FAFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]')
SKIP_FILES = {'assets/icon-map.js', 'assets/common.css', '朋友圈发布.html', 'assets/xt-profile.js'}

def iter_targets():
    for fn in os.listdir(ROOT):
        if fn.lower().endswith('.html'):
            yield fn
    for dp, dns, fns in os.walk(os.path.join(ROOT, 'assets')):
        dns[:] = [d for d in dns if d != 'node_modules']
        for fn in fns:
            if fn.lower().endswith('.js'):
                yield os.path.relpath(os.path.join(dp, fn), ROOT)

# UI 结构标记（可交互控件/列表项/菜单项/工具条）
UI_STRUCT = re.compile(r'(<button|<a\s|onclick=|role="button"|class="[^"]*(?:btn|tab|nav|menu|item|chip|icon|entry|toolbar|action|fn|tool|bar|cell|row)[^"]*")')
# emoji 出现在图标位：行首空白后、或紧跟 > / " / ' / 全角空格
ICON_POS = re.compile(r'(?:^|[>"\'])\s*[\U0001F300-\U0001FAFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]')
CONTENTISH = ('data-', '/data/', 'emoji/manifest', 'quest', 'topic-express', 'comm-cases', 'roleplay', 'iv-prep', 'iv-after', 'ppt-tips', 'ppt-class', 'mini-')

func, unsure, deco = [], [], []
for rel in sorted(set(iter_targets())):
    if rel.replace('\\', '/') in SKIP_FILES:
        continue
    p = os.path.join(ROOT, rel)
    raw = open(p, 'rb').read()
    lone = raw.count(b'\n') - raw.count(b'\r\n')
    text = raw.decode('utf-8', 'replace')
    for i, l in enumerate((text.split('\r\n') if lone == 0 else text.split('\n')), 1):
        if not EMOJI.search(l):
            continue
        s = l.strip()
        if s.startswith(('//', '/*', '*', '<!--')):
            continue  # 注释
        ems = ''.join(ch for ch in l if EMOJI.match(ch))
        rec = {'file': rel.replace('\\', '/'), 'line': i, 'emoji': ems, 'text': s[:170]}
        if any(seg in rel for seg in CONTENTISH):
            deco.append(rec); continue
        ui = bool(UI_STRUCT.search(l))
        ip = bool(ICON_POS.search(l))
        # 行较长且含大段中文散文 → 多半是文案，不是图标位
        zh = len(re.findall('[\u4e00-\u9fff]', l))
        if ui and ip and zh <= 14:
            func.append(rec)
        elif ui and ip:
            unsure.append(rec)
        elif ui or ip:
            unsure.append(rec)
        else:
            deco.append(rec)

def dump(name, arr):
    o = ['===== %s (%d) =====' % (name, len(arr))]
    for r in arr:
        o.append('%s:%d  %s' % (r['file'], r['line'], r['text']))
    return '\n'.join(o)

open(os.path.join(ROOT, 'tools', 'm6b3.txt'), 'w', encoding='utf-8').write(
    dump('FUNCTIONAL-UI(高置信)', func) + '\n\n' + dump('UNSURE(存疑)', unsure) + '\n\n===== DECORATIVE(计数) =====\n%d\n' % len(deco))
print('done')
