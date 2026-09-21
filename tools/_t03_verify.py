# -*- coding: utf-8 -*-
import os, re, json
base = r'D:\下载的文件\学习工作台'
js = open(os.path.join(base, r'assets\ai-settings.js'), 'rb').read().decode('utf-8')
html = open(os.path.join(base, r'ai-settings.html'), 'rb').read().decode('utf-8')

def hits(txt, pat):
    out = []
    for i, ln in enumerate(txt.split('\n'), 1):
        if re.search(pat, ln):
            out.append(i)
    return out

rep = {}
# 契约字面量
for name, pat in [
    ('catSchema', r'catSchema'),
    ('hideUnavailable', r'hideUnavailable'),
    ('lastSort', r'lastSort'),
    ('xt:health-changed', r"xt:health-changed"),
    ('#setSortCat', r'id="setSortCat"'),
    ('#setSortCatInner', r'id="setSortCatInner"'),
    ('#setUsageRoot', r'id="setUsageRoot"'),
    ('#setHideUnavail', r'id="setHideUnavail"'),
]:
    rep[name] = {'js': hits(js, pat), 'html': hits(html, pat)}

# 结构计数：从 JS 源码里抽 BUILTIN_CATS / CAT_OF_TYPE / ALL_TYPE_KEYS / FAMILY_ORDER 块
def count_block(src, start_marker, end_marker):
    i = src.find(start_marker)
    if i < 0: return -1, ''
    j = src.find(end_marker, i)
    if j < 0: return -1, ''
    return src.count(',', i, j), src[i:j]

# BUILTIN_CATS: 数 '{ key' 出现次数
i = js.find('var BUILTIN_CATS = [')
j = js.find('];', i)
bc_block = js[i:j]
rep['BUILTIN_CATS_entries'] = bc_block.count('{ key:')

i = js.find('var CAT_OF_TYPE = {')
j = js.find('};', i)
cot = js[i:j]
rep['CAT_OF_TYPE_keys'] = len(re.findall(r"[A-Za-z_'0-9]+\s*:", cot))

i = js.find('var ALL_TYPE_KEYS = [')
j = js.find('];', i)
rep['ALL_TYPE_KEYS'] = re.findall(r"'([a-z0-9_]+)'", js[i:j])

i = js.find('var RESERVED_KEYS =')
rep['RESERVED_KEYS_line'] = js[i:js.find('\n', i)].strip()

i = js.find('var FAMILY_ORDER =')
rep['FAMILY_ORDER_line'] = js[i:js.find('\n', i)].strip()

# html: 3 个 cap script 顺序
order = []
for f in ['ai-cap-translate.js', 'ai-cap-video.js', 'ai-cap-3d.js', 'ai-settings.js']:
    order.append((f, html.find(f)))
rep['html_script_order'] = order

# #setUsageRoot 是否 #setPanelAbout 首子元素（markup 中 setUsageRoot 在 setAboutList 之前）
ia = html.find('id="setPanelAbout"')
iu = html.find('id="setUsageRoot"')
ib = html.find('id="setAboutList"')
rep['usageRoot_first'] = (ia >= 0 and iu > ia and ib > iu)

# 是否残留 R72-15 清洗（delete s.catModels.translate）
rep['legacy_translate_cleanup'] = hits(js, r"delete s\.catModels\.translate")

# 是否残留旧的 CHIP_HIDDEN_TYPE translate
rep['chip_hidden_translate'] = hits(js, r"CHIP_HIDDEN_TYPE = \{ translate")

with open(os.path.join(base, 'tools', '_t03_verify_out.json'), 'w', encoding='utf-8') as w:
    w.write(json.dumps(rep, ensure_ascii=False, indent=1))
print('done')
