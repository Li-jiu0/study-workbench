# -*- coding: utf-8 -*-
"""R87 收口体检：HTML 结构配对 + 行尾 + 损坏签名。只看不改。"""
import io, os, re, time

ROOT = r'D:\下载的文件\学习工作台'
T0 = time.mktime(time.strptime('2026-09-18 15:00:00', '%Y-%m-%d %H:%M:%S'))

out = []

# ---------- 1) 本批改动过的文件（按 mtime，§8.7 唯一可靠判据） ----------
changed = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in
                   {'tools', '备份', '.git', '.workbuddy', 'node_modules', '__pycache__',
                    'server', '.venv', 'uploads', '.tmp_eng', '_w2t1_img', '_tmp_l3_qa'}]
    for n in filenames:
        p = os.path.join(dirpath, n)
        try:
            st = os.stat(p)
        except OSError:
            continue
        if st.st_mtime >= T0:
            rel = os.path.relpath(p, ROOT)
            if '.bak-pre-r' in rel or rel.startswith('tools'):
                continue
            changed.append((time.strftime('%H:%M:%S', time.localtime(st.st_mtime)), rel, st.st_size))

changed.sort()
out.append('=== 本批落盘文件（mtime >= 15:00，排除 tools/ 与备份）共 %d 个 ===' % len(changed))
for t, rel, sz in changed:
    out.append('  %s  %-42s %d B' % (t, rel, sz))

# ---------- 2) HTML 结构配对（§1 四项）----------
out.append('')
out.append('=== HTML 结构配对检查 ===')
htmls = sorted([r for _, r, _ in changed if r.lower().endswith('.html')])
out.append('本批改动过的 HTML 数 = %d' % len(htmls))
bad = []
for rel in htmls:
    p = os.path.join(ROOT, rel)
    raw = io.open(p, 'rb').read()
    t = raw.decode('utf-8', 'ignore')

    crlf = raw.count(b'\r\n')
    lone = raw.count(b'\n') - crlf

    c_open, c_close = t.count('<!--'), t.count('-->')
    nd = len(re.findall(r'<div[\s>]', t))
    ed = t.count('</div>')
    so, sc = len(re.findall(r'<script[\s>]', t)), t.count('</script>')
    yo, yc = len(re.findall(r'<style[\s>]', t)), t.count('</style>')
    ho, hc = len(re.findall(r'<head[\s>]', t)), t.count('</head>')
    bo, bc = len(re.findall(r'<body[\s>]', t)), t.count('</body>')

    # 损坏签名：版本号后紧跟引号+属性（正常应为 ?v=xxx">）
    broken = re.findall(rb'\.js\?v=[0-9A-Za-z._]+"[^>\s]', raw)
    dbljs = len(re.findall(rb'\.js\.js\?v=', raw))
    # 非属性命中：assets/xxx.js?v= 前 40 字符内没有 src=/href=
    nonattr = 0
    for m in re.finditer(rb'assets/[A-Za-z0-9_.\-]+\.(?:js|css)\?v=', raw):
        seg = raw[max(0, m.start() - 40):m.start()]
        if not re.search(rb'(?:src|href)\s*=\s*["\']', seg):
            nonattr += 1

    probs = []
    if c_open != c_close: probs.append('注释 %d/%d' % (c_open, c_close))
    if nd != ed: probs.append('div %d/%d' % (nd, ed))
    if so != sc: probs.append('script %d/%d' % (so, sc))
    if yo != yc: probs.append('style %d/%d' % (yo, yc))
    if ho != hc: probs.append('head %d/%d' % (ho, hc))
    if bo != bc: probs.append('body %d/%d' % (bo, bc))
    if broken: probs.append('损坏签名 %d 处: %r' % (len(broken), broken[:2]))
    if dbljs: probs.append('js.js 双后缀 %d 处' % dbljs)
    if nonattr: probs.append('非属性命中 %d 处' % nonattr)
    if lone: probs.append('loneLF=%d（本页应为 CRLF）' % lone)

    if probs:
        bad.append(rel)
        out.append('  [X] %-34s %s' % (rel, ' | '.join(probs)))
    else:
        out.append('  [OK] %-34s CRLF=%d loneLF=0 注释/div/script/style/head/body 全平衡' % (rel, crlf))

# ---------- 3) assets/*.js 行尾 + 破坏性扫描 ----------
out.append('')
out.append('=== assets/*.js 行尾（本批改动的）===')
for _, rel, _ in changed:
    if rel.startswith('assets' + os.sep) and rel.endswith('.js'):
        raw = io.open(os.path.join(ROOT, rel), 'rb').read()
        crlf = raw.count(b'\r\n')
        lone = raw.count(b'\n') - crlf
        out.append('  %-34s CRLF=%-6d loneLF=%-6d 判定=%s' % (rel, crlf, lone,
                   'CRLF' if crlf and not lone else ('LF' if lone and not crlf else 'MIXED!!')))

# ---------- 4) 全站（不只本批）损坏签名兜底 ----------
out.append('')
out.append('=== 全站 48 页兜底扫描（js.js / 损坏签名 / 非属性命中）===')
tot_dbl = tot_broken = tot_nonattr = 0
for n in sorted(os.listdir(ROOT)):
    if not n.endswith('.html') or '.bak' in n:
        continue
    raw = io.open(os.path.join(ROOT, n), 'rb').read()
    a = len(re.findall(rb'\.js\.js\?v=', raw))
    b = len(re.findall(rb'\.js\?v=[0-9A-Za-z._]+"[^>\s]', raw))
    na = 0
    for m in re.finditer(rb'assets/[A-Za-z0-9_.\-]+\.(?:js|css)\?v=', raw):
        seg = raw[max(0, m.start() - 40):m.start()]
        if not re.search(rb'(?:src|href)\s*=\s*["\']', seg):
            na += 1
    tot_dbl += a; tot_broken += b; tot_nonattr += na
    if a or b or na:
        out.append('  [!] %-30s js.js=%d 损坏=%d 非属性=%d' % (n, a, b, na))
out.append('  全站合计：js.js=%d  损坏签名=%d  非属性命中=%d' % (tot_dbl, tot_broken, tot_nonattr))

out.append('')
out.append('结论：结构异常页 = %d 个 %s' % (len(bad), ('-> ' + ', '.join(bad)) if bad else '(全部通过)'))

io.open(os.path.join(ROOT, 'tools', '_r87_gatecheck.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok  abnormal_html=%d' % len(bad))
