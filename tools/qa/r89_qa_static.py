# -*- coding: utf-8 -*-
"""r89_qa_static.py —— R89 静态/源码级独立验证（不依赖团队自测脚本）"""
import os, re, json, sys

BASE = r'D:\下载的文件\学习工作台'
OUT = []


def P(*a):
    s = ' '.join(str(x) for x in a)
    OUT.append(s)


def rd(rel):
    p = os.path.join(BASE, rel.replace('/', os.sep))
    if not os.path.exists(p):
        return None
    return open(p, 'rb').read().decode('utf-8', errors='replace')


def raw(rel):
    p = os.path.join(BASE, rel.replace('/', os.sep))
    return open(p, 'rb').read() if os.path.exists(p) else None


def lineof(text, needle):
    return [i for i, l in enumerate(text.split('\n'), 1) if needle in l]


P('=' * 70)
P('R89 QA 静态验证报告')
P('=' * 70)

# ---------- 0. 行尾与字节 ----------
P('\n### 0. 行尾 / 字节数')
EXPECT = {
    '私聊.html': ('CRLF', 77268),
    'assets/xt-profile.js': ('CRLF', 141938),
    'assets/xt-profile.css': ('CRLF', 39465),
    '地区选择.html': ('CRLF', 19110),
    'assets/xt-region.js': ('LF', 46800),
    'assets/xt-moments.js': ('CRLF', 58723),
    '更新.html': ('CRLF', 23107),
    '更多.html': ('CRLF', 18875),
    '朋友圈发布.html': ('CRLF', 12612),
    'assets/common.css': ('CRLF', 127605),
}
EOL_BAD = []
for f, (want, wantn) in EXPECT.items():
    b = raw(f)
    if b is None:
        P('  MISSING', f)
        EOL_BAD.append(f)
        continue
    crlf = b.count(b'\r\n')
    loneLF = b.count(b'\n') - crlf
    loneCR = b.count(b'\r') - crlf
    got = 'CRLF' if crlf > 0 and loneLF == 0 and loneCR == 0 else ('LF' if loneLF > 0 and crlf == 0 and loneCR == 0 else 'MIXED')
    ok = (got == want) and (len(b) == wantn)
    if not ok:
        EOL_BAD.append(f)
    P('  %-26s size=%-7d (exp %-7d) CRLF=%-5d loneLF=%-4d loneCR=%-4d eol=%-5s exp=%-4s %s'
      % (f, len(b), wantn, crlf, loneLF, loneCR, got, want, 'OK' if ok else '*** BAD ***'))
P('  行尾判定: %s' % ('ALL OK' if not EOL_BAD else 'BAD -> ' + repr(EOL_BAD)))

# ---------- 1. common.css 未被动 ----------
P('\n### 1. common.css 未授权改动检查')
cc = rd('assets/common.css')
ccb = raw('assets/common.css')
P('  字节数 =', len(ccb), '(应为 127605)', 'OK' if len(ccb) == 127605 else '*** P0 ***')
ccl = cc.split('\n')
if len(ccl) >= 68:
    P('  L68 =', repr(ccl[67].strip()[:120]))
    P('  L68 含 height:100% + overflow:hidden ?',
      ('height: 100%' in ccl[67].replace(' ', ' ') or 'height:100%' in ccl[67].replace(' ', '')) and 'overflow: hidden' in ccl[67].replace('  ', ' '))

# ---------- 2. server 目录是否被改 ----------
P('\n### 2. server/ 目录检查（本批不应改动）')
srv = os.path.join(BASE, 'server')
if os.path.isdir(srv):
    import time
    hits = []
    for root, dirs, files in os.walk(srv):
        dirs[:] = [d for d in dirs if d not in ('__pycache__', '.git')]
        for f in files:
            fp = os.path.join(root, f)
            try:
                mt = os.path.getmtime(fp)
                if mt >= time.mktime(time.strptime('2026-09-18', '%Y-%m-%d')):
                    hits.append((os.path.relpath(fp, BASE), time.strftime('%Y-%m-%d %H:%M', time.localtime(mt))))
            except Exception:
                pass
    P('  9/18 之后修改的 server 文件数 =', len(hits))
    for h in hits[:20]:
        P('    ', h)
else:
    P('  server/ 不存在')

# ---------- 3. A2 误导线是否消失 ----------
P('\n### 3. A2 个人资料.html 误导线扫描')
pf = rd('个人资料.html') or rd('assets/xt-profile.js')
# 两个文件都扫
targets = {'个人资料.html': rd('个人资料.html'), 'assets/xt-profile.js': rd('assets/xt-profile.js')}
OLD = '暂无本机 AI 对话记录。在 AI 问答页对话后会自动出现在这里。'
OLD2 = '暂无本机 AI 对话记录'
for name, t in targets.items():
    if t is None:
        P('  %s: MISSING' % name); continue
    n_old = t.count(OLD)
    n_old2 = t.count(OLD2)
    P('  %s: 旧原文(完整)命中=%d  旧原文(前缀)命中=%d' % (name, n_old, n_old2))
    for kw in ['srvnote', '服务端', '去 AI 问答', 'xtpM5GoAi', 'META_KEY', 'xt_ai_chat_meta_v1', 'm5ClearAll', 'm5Bind']:
        idx = lineof(t, kw)
        P('      %-22s 命中行数=%d %s' % (kw, len(idx), idx[:8]))

# ---------- 4. A2 关键字符串断言 ----------
P('\n### 4. A2 关键文案 / 结构断言')
t = rd('assets/xt-profile.js')
if t:
    checks = [
        ('确认框含「服务端记录不受影响」', '服务端记录不受影响' in t),
        ('toast含「服务端记录仍保留」', '服务端记录仍保留' in t),
        ('#xtpM5GoAi 绑定存在', 'xtpM5GoAi' in t),
        ('META_KEY=xt_ai_chat_meta_v1', "xt_ai_chat_meta_v1" in t),
        ('ai_chat_history 读写存在', 'ai_chat_history' in t),
        ('无 clamp(/min(/max( CSS', not re.search(r'clamp\(|\bmin\(|\bmax\(', t)),
    ]
    for k, v in checks:
        P('  %-34s %s' % (k, 'PASS' if v else 'FAIL'))
    P('  服务端记录不受影响 出现行:', lineof(t, '服务端记录不受影响'))
    P('  服务端记录仍保留 出现行:', lineof(t, '服务端记录仍保留'))
    P('  xtpM5GoAi 出现行:', lineof(t, 'xtpM5GoAi'))

# AI.html 是否存在（A2 跳转目标）
P('  AI.html 存在:', os.path.exists(os.path.join(BASE, 'AI.html')), '->', )

# ---------- 5. B1 覆盖规则与顺序 ----------
P('\n### 5. B1 地区选择.html 覆盖规则')
rg = rd('地区选择.html')
if rg:
    P('  html{height:auto;overflow-y:auto} :', bool(re.search(r'html\s*\{[^}]*height\s*:\s*auto', rg)) and bool(re.search(r'html\s*\{[^}]*overflow-y\s*:\s*auto', rg)))
    P('  body.theme-home{...} :', bool(re.search(r'body\.theme-home\s*\{[^}]*overflow-y\s*:\s*auto', rg)))
    P('  -webkit-overflow-scrolling:touch :', '-webkit-overflow-scrolling:touch' in rg)
    P('  overflow-x:hidden :', 'overflow-x:hidden' in rg)
    # style vs link 顺序（源码层面）
    li_link = rg.find('<link')
    li_style = rg.find('<style')
    P('  首个 <link> 位置=%d, 首个 <style> 位置=%d -> style 在 link 之后: %s' % (li_link, li_style, li_style > li_link))
    # sticky
    P('  .xtr-head sticky 规则 :', bool(re.search(r'\.xtr-head[^{]*\{[^}]*position\s*:\s*sticky', rg)))
    for m in re.finditer(r'\.xtr-head[^{]*\{[^}]*\}', rg):
        s = m.group(0)
        if 'sticky' in s:
            P('    ->', s[:160].replace('\n', ' '))
    P('  clamp/min/max :', bool(re.search(r'clamp\(|\bmin\(|\bmax\(', rg)))

# ---------- 6. B2 CSS 结构 ----------
P('\n### 6. B2 assets/xt-region.js 结构')
xr = rd('assets/xt-region.js')
if xr:
    def rule(sel):
        m = re.search(re.escape(sel) + r'\{([^}]*)\}', xr)
        return m.group(1).strip() if m else None
    P('  .xtlp{...} =', rule('.xtlp'))
    P('  .xtlp-body{...} =', rule('.xtlp-body'))
    P('  .xtlp-list{...} =', rule('.xtlp-list'))
    P('  .xtlp 仍含 display:flex ?', 'flex' in (rule('.xtlp') or ''))
    P('  .xtlp-list 含 flex:1 1 0% ?', '1 1 0%' in (rule('.xtlp-list') or ''))
    P('  .xtlp-list 含 min-height:0 ?', 'min-height:0' in (rule('.xtlp-list') or '').replace(' ', ''))
    P('  .xtlp-list 含 overflow-y:auto ?', 'overflow-y:auto' in (rule('.xtlp-list') or '').replace(' ', ''))
    P('  body.className = xtlp-body 挂载 :', "body.className = 'xtlp-body'" in xr)
    P('  window.XT_LOC_PICK 导出 :', 'window.XT_LOC_PICK' in xr)
    P('  openPicker: openPicker :', 'openPicker: openPicker' in xr)
    P('  resize removeEventListener 成对 :', 'removeEventListener' in xr, '| addEventListener resize:', 'window.addEventListener' in xr)
    P('  clamp/min/max :', bool(re.search(r'clamp\(|\bmin\(|\bmax\(', xr)))

# ---------- 7. B3 moments ----------
P('\n### 7. B3 assets/xt-moments.js')
xm = rd('assets/xt-moments.js')
if xm:
    for kw in ['xtmPickLocation', 'xtmNav', 'xtmNavHook', 'xtmTakeRegionPick', 'xtmApplyLocation', 'xt_region_pick', 'xtmLocBtn', 'xtmAtBtn']:
        idx = lineof(xm, kw)
        P('  %-20s 命中行数=%-4d %s' % (kw, len(idx), idx[:10]))
    P('  alert/prompt/confirm 裸调用 :', re.findall(r'(?<![.\w])(alert|prompt|confirm)\s*\(', xm))
    P('  confirmBox 出现次数 :', xm.count('confirmBox'))
    P('  TTL 常量 :', re.findall(r'TTL[^;\n]{0,80}', xm)[:5])
    P('  lng/lat 进 UI 字符串风险 :', [l.strip()[:100] for l in xm.split('\n') if re.search(r'(lng|lat|经度|纬度)', l)][:12])
    P('  clamp/min/max :', bool(re.search(r'clamp\(|\bmin\(|\bmax\(', xm)))

# ---------- 8. C 更新.html ----------
P('\n### 8. C 更新.html')
up = rd('更新.html')
if up:
    P('  .morepage-title 计数 =', up.count('morepage-title'), '(应=1)')
    P('  「检测更新」全文计数 =', up.count('检测更新'), '(应=4)')
    P('  data-icon="download" data-icon-size="18" =', 'data-icon="download" data-icon-size="18"' in up)
    for i, l in enumerate(up.split('\n'), 1):
        if 'morepage-title' in l:
            P('    L%d = %s' % (i, l.strip()[:200]))
    P('  xt-up-brand 计数 =', up.count('xt-up-brand'))
    P('  data-icon="book-open" =', 'data-icon="book-open"' in up)
    # 外链扫描
    ext = re.findall(r'(?:src|href)\s*=\s*["\'](https?:)?//[^"\']+', up)
    P('  新增 http 外链:', ext[:10])
    pngsvg = re.findall(r'(?:src|href)\s*=\s*["\'][^"\']*\.(?:png|jpg|jpeg|svg|gif|webp)["\']', up)
    P('  png/svg/jpg 文件引用:', pngsvg[:10])
    # 样式前缀
    sty = re.findall(r'\.xt-up-[a-z-]+', up)
    P('  .xt-up-* 规则数 =', len(set(sty)), sorted(set(sty))[:20])
    bad = [s for s in re.findall(r'\.(?!xt-up-)([a-zA-Z][a-zA-Z0-9_-]*)\s*[,{]', up) if s not in ('morepage', 'mt', 'app')]
    P('  clamp/min/max :', bool(re.search(r'clamp\(|\bmin\(|\bmax\(', up)))

# ---------- 9. 更多.html 未改 ----------
P('\n### 9. 更多.html 未改断言')
mo = rd('更多.html'); mob = raw('更多.html')
P('  字节 =', len(mob), '(应 18875)')
if mo:
    for kw in ['morepageUpdateCard', 'xtMoreUpdateVer', 'XTUpdate.openUpdatePage()']:
        P('  %-30s 命中=%d' % (kw, mo.count(kw)))

# ---------- 10. 朋友圈发布.html 未改 ----------
P('\n### 10. 朋友圈发布.html 未改断言')
fq = rd('朋友圈发布.html'); fqb = raw('朋友圈发布.html')
P('  字节 =', len(fqb), '(应 12612)')
if fq:
    for kw in ['xtmFileImg', 'xtmFileVid']:
        P('  %-14s 命中=%d' % (kw, fq.count(kw)))
    btns = re.findall(r'id="(xtm[A-Za-z]+Btn|[a-z]+Btn)"', fq)
    P('  按钮 id:', btns)

# ---------- 11. HTML 结构配对 ----------
P('\n### 11. HTML 结构配对（自算）')
HTMLS = ['私聊.html', '地区选择.html', '更新.html', '更多.html', '朋友圈发布.html', '个人资料.html', 'AI.html']
for f in HTMLS:
    t = rd(f)
    if t is None:
        P('  %-20s MISSING' % f); continue
    def c(a):
        return t.count(a)
    pairs = [
        ('<!--', '-->'), ('<div', '</div'), ('<style', '</style'), ('<script', '</script'),
    ]
    res = []
    for a, b in pairs:
        res.append('%s=%d/%s=%d %s' % (a, c(a), b, c(b), 'OK' if c(a) == c(b) else '**DIFF**'))
    # head（避免命中 header）
    head_open = len(re.findall(r'<head[\s>]', t)); head_close = c('</head>')
    res.append('<head=%d/</head>=%d %s' % (head_open, head_close, 'OK' if head_open == head_close else '**DIFF**'))
    P('  %-20s %s' % (f, ' | '.join(res)))

# ---------- 12. 禁用语法扫描（真实违规 vs 注释命中） ----------
P('\n### 12. 禁用语法独立扫描（真实违规 / 注释内命中）')
JS = ['assets/xt-profile.js', 'assets/xt-region.js', 'assets/xt-moments.js']
PATS = [r'\?\.', r'\?\?', r'Object\.fromEntries', r'\.replaceAll\(', r'\.at\(', r'\(\?<=', r'\(\?<!', r'catch\s*\{']
for f in JS:
    t = rd(f)
    if t is None:
        P('  %s MISSING' % f); continue
    lines = t.split('\n')
    in_block = False
    real, cmt = {}, {}
    for ln in lines:
        s = ln
        stripped = s.strip()
        is_cmt = in_block
        # 简易块注释跟踪
        if '/*' in s and '*/' not in s.split('/*', 1)[1]:
            in_block = True
        if '*/' in s:
            in_block = False
        if not is_cmt and (stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*')):
            is_cmt = True
        # 去行内注释
        code = re.sub(r'//.*$', '', s)
        for p in PATS:
            ncode = len(re.findall(p, code))
            nall = len(re.findall(p, s))
            if nall:
                key = p
                if is_cmt:
                    cmt[key] = cmt.get(key, 0) + nall
                else:
                    real[key] = real.get(key, 0) + ncode
                    if nall - ncode:
                        cmt[key] = cmt.get(key, 0) + (nall - ncode)
    P('  %s' % f)
    P('    真实违规:', {k: v for k, v in real.items() if v} or 'NONE')
    P('    注释内命中:', {k: v for k, v in cmt.items() if v} or 'NONE')

# ---------- 13. 禁 prompt/alert/confirm（排除 confirmBox） ----------
P('\n### 13. 禁 prompt/alert/confirm（改动文件全批）')
ALL = EXPECT.keys()
for f in ALL:
    t = rd(f)
    if t is None:
        continue
    hits = [(i, l.strip()[:120]) for i, l in enumerate(t.split('\n'), 1)
            if re.search(r'(?<![.\w$])(alert|prompt|confirm)\s*\(', l)]
    hits = [h for h in hits if 'confirmBox' not in h[1]]
    P('  %-26s 裸调用命中=%d %s' % (f, len(hits), hits[:5] if hits else ''))

open(os.path.join(BASE, 'tools', 'qa', 'r89_qa_static_out.txt'), 'w', encoding='utf-8').write('\n'.join(OUT))
print('\n'.join(OUT))
