# -*- coding: utf-8 -*-
"""对照本批备份，判定 5 处 HTML 结构异常是「本批引入」还是「历史遗留」。只看不改。"""
import io, os, re, glob

ROOT = r'D:\下载的文件\学习工作台'
SUSPECT = ['ai-settings.html', 'blog_wechat.html', '个人中心.html', '关于.html', '工具.html']

def metrics(raw):
    t = raw.decode('utf-8', 'ignore')
    return {
        'comment': (t.count('<!--'), t.count('-->')),
        'div': (len(re.findall(r'<div[\s>]', t)), t.count('</div>')),
        'script': (len(re.findall(r'<script[\s>]', t)), t.count('</script>')),
        'style': (len(re.findall(r'<style[\s>]', t)), t.count('</style>')),
        'head': (len(re.findall(r'<head[\s>]', t)), t.count('</head>')),
        'body': (len(re.findall(r'<body[\s>]', t)), t.count('</body>')),
        'crlf': raw.count(b'\r\n'),
        'loneLF': raw.count(b'\n') - raw.count(b'\r\n'),
        'bytes': len(raw),
    }

out = []
for name in SUSPECT:
    p = os.path.join(ROOT, name)
    bak = p + '.bak-pre-r87-20260918'
    out.append('=' * 78)
    out.append('### %s' % name)
    if not os.path.exists(bak):
        cand = sorted(glob.glob(p + '.bak*'))
        bak = cand[0] if cand else None
        out.append('  ⚠️ 精确备份不存在，改用: %s' % bak)
    if not bak or not os.path.exists(bak):
        out.append('  ❌ 找不到备份，无法差分')
        continue

    cur = metrics(io.open(p, 'rb').read())
    old = metrics(io.open(bak, 'rb').read())
    out.append('  %-10s %-22s %-22s %s' % ('指标', '改前(备份)', '改后(当前)', '判定'))
    for k in ['comment', 'div', 'script', 'style', 'head', 'body']:
        same = '相同(历史遗留)' if old[k] == cur[k] else '★变了(本批引入?)'
        out.append('  %-10s %-22s %-22s %s' % (k, str(old[k]), str(cur[k]), same))
    out.append('  %-10s %-22s %-22s %s' % ('bytes', old['bytes'], cur['bytes'],
               '一致' if old['bytes'] == cur['bytes'] else '变化 %+d' % (cur['bytes'] - old['bytes'])))
    out.append('  %-10s %-22s %-22s %s' % ('行尾 CRLF/loneLF',
               '%d/%d' % (old['crlf'], old['loneLF']), '%d/%d' % (cur['crlf'], cur['loneLF']),
               '一致' if (old['crlf'], old['loneLF']) == (cur['crlf'], cur['loneLF']) else '★变了'))

    # 差分的行级内容：只看本批实际动了什么（判定是否与配对失衡相关）
    a = io.open(bak, 'rb').read().split(b'\r\n')
    b = io.open(p, 'rb').read().split(b'\r\n')
    if len(a) != len(b):
        out.append('  行数：改前 %d → 改后 %d（差 %+d）' % (len(a), len(b), len(b) - len(a)))
    sa = set(x.strip() for x in a if x.strip())
    sb = set(x.strip() for x in b if x.strip())
    added = [x for x in sb - sa]
    removed = [x for x in sa - sb]
    out.append('  新增行 %d 条 / 删除行 %d 条' % (len(added), len(removed)))
    for x in added[:12]:
        out.append('    + %s' % x.decode('utf-8', 'replace')[:150])
    for x in removed[:12]:
        out.append('    - %s' % x.decode('utf-8', 'replace')[:150])

io.open(os.path.join(ROOT, 'tools', '_r87_struct_diff.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
