# -*- coding: utf-8 -*-
"""
R11 页面差异预检：逐页把线上版拉回，两侧都把 ?v=<任意> 归一化后 diff。
目的：确认「本次要覆盖的 44 页」与线上版的差异只来自
      (a) 版本戳（归一化后应消失）与 (b) 今天 R11 有意的内容改动。
若出现「预期改动集之外」的残余差异 → 说明线上有本地没有的内容，覆盖会回退它 → 报警。
"""
import io, os, re, json, urllib.request, urllib.parse, difflib

ROOT = r'D:\下载的文件\学习工作台'
os.chdir(ROOT)
m = json.load(open('tools/_r11_upload_manifest.json', encoding='utf-8'))
pages = sorted(f for f in m['files'] if f.endswith('.html'))

# 今天有意改过内容的页面（git status 显示 M）
EXPECTED_CHANGED = {'个人中心.html', '关于.html', '协议.html', '数据管理.html', '日志.html',
                    '英语.html', '表达.html', '设置.html', '面测.html'}

RX_V = re.compile(rb'\?v=[0-9A-Za-z_.\-]+')

def norm(b):
    return RX_V.sub(b'?v=@', b)

unexpected, changed, same = [], [], []
for pg in pages:
    local = open(pg, 'rb').read()
    try:
        live = urllib.request.urlopen(urllib.request.Request(
            'http://110.42.134.62/' + urllib.parse.quote(pg),
            headers={'User-Agent': 'r11-diff', 'Cache-Control': 'no-cache'}), timeout=25).read()
    except Exception as e:
        unexpected.append((pg, 'FETCH_FAIL %s' % e)); continue
    if norm(live) == norm(local):
        same.append(pg); continue
    if pg in EXPECTED_CHANGED:
        lt = norm(local).decode('utf-8', 'replace').splitlines()
        rt = norm(live).decode('utf-8', 'replace').splitlines()
        d = [x for x in difflib.unified_diff(rt, lt, lineterm='', n=0) if x[:1] in '+-' and x[:3] not in ('+++', '---')]
        changed.append((pg, len(d)))
    else:
        unexpected.append((pg, '内容有差异但不在预期改动集内'))

out = ['页面数=%d' % len(pages),
       '仅戳不同（归一化后一致）: %d' % len(same),
       '预期内容改动页: %s' % changed,
       '★非预期差异: %s' % (unexpected or '无')]
io.open('tools/_r11_page_diff.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
