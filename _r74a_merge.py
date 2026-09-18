# -*- coding: utf-8 -*-
"""R74-A：动态空间页面迁移与合并。
朋友圈.html --复制改名--> 动态空间.html（并入原「动态」落地页的入口卡区 + moOpenUser）；
动态.html 删除；全局活引用改指 动态空间.html。全部二进制字节级替换，CRLF 保持。
"""
import os
import shutil

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r74-20260917'


def P(rel):
    return os.path.join(ROOT, rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def rep(data, old, new, expect):
    cnt = data.count(old)
    assert cnt == expect, 'COUNT MISMATCH %r: got %d expect %d' % (old, cnt, expect)
    return data.replace(old, new)


def crlf_ok(data):
    return data.count(b'\r\n') == data.count(b'\n')


def blk(lines):
    return ('\r\n'.join(lines) + '\r\n').encode('utf-8')


def log(msg):
    print(msg)


# ---------- 0. 基线 ----------
def count_moment_pages():
    total_files = 0
    total_occ = 0
    multi = []
    for fn in os.listdir(ROOT):
        fp = P(fn)
        if not fn.endswith('.html') or '.bak' in fn or not os.path.isfile(fp):
            continue
        c = rb(fp).count(b'data-page="moments"')
        if c:
            total_files += 1
            total_occ += c
            if c != 1:
                multi.append((fn, c))
    return total_files, total_occ, multi


bf, bo, bm = count_moment_pages()
log('BASELINE data-page="moments": files=%d occ=%d multi=%r' % (bf, bo, bm))

app_path = P(r'assets\app.js')
app_before = rb(app_path)
l665_before = len(app_before.split(b'\n')[664].rstrip(b'\r'))
log('BASELINE app.js bytes=%d L665len=%d' % (len(app_before), l665_before))

# ---------- 1. 备份 ----------
targets = ['朋友圈.html', '动态.html', '我的动态.html', '朋友圈发布.html',
           '个人中心.html', '更多.html', r'assets\app.js', r'assets\xt-moments.js']
for t in targets:
    src = P(t)
    assert os.path.exists(src), 'missing ' + t
    shutil.copyfile(src, src + BAK)
log('BACKUP done: %d files -> *%s' % (len(targets), BAK))

# ---------- 2. 生成 动态空间.html（以朋友圈.html 信息流页为主体） ----------
src = rb(P('朋友圈.html'))
assert crlf_ok(src), '朋友圈.html 含 bareLF'
out = src

out = rep(out, '<title>朋友圈 · 星途</title>'.encode('utf-8'),
          '<title>动态空间 · 星途</title>'.encode('utf-8'), 1)
out = rep(out, '居中标题「朋友圈」'.encode('utf-8'),
          '居中标题「动态空间」'.encode('utf-8'), 1)
out = rep(out, '<div class="xtm-nav-title">朋友圈</div>'.encode('utf-8'),
          '<div class="xtm-nav-title">动态空间</div>'.encode('utf-8'), 1)
out = rep(out, "location.href='朋友圈.html'".encode('utf-8'),
          "location.href='动态空间.html'".encode('utf-8'), 1)
out = rep(out, '<div class="bm-label">朋友圈</div>'.encode('utf-8'),
          '<div class="bm-label">动态空间</div>'.encode('utf-8'), 1)

# 2a. head 内插入入口卡样式（置于 xt-polyfill 之前）
css_lines = [
    '<style>',
    '  /* R74：入口卡样式（自原「动态」落地页迁入，与页内卡片风格一致） */',
    '  .mo-entry{display:flex;flex-wrap:wrap;margin:12px 0 14px}',
    '  .mo-entry-card{flex:1;min-width:140px;margin:0 7px 8px 0;background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--shadow);text-decoration:none;color:var(--text);display:block;box-sizing:border-box}',
    '  .mo-entry-icon{font-size:22px}',
    '  .mo-entry-t{font-size:14px;font-weight:700;margin-top:6px;word-break:break-word}',
    '  .mo-entry-s{font-size:12px;color:var(--text-secondary);margin-top:2px}',
    '</style>',
]
anchor_css = '<script src="assets/xt-polyfill.js?v=20260916O"></script>'.encode('utf-8')
out = rep(out, anchor_css, blk(css_lines) + anchor_css, 1)

# 2b. 信息流主体顶部插入入口卡区（我的动态直达卡）
entry_lines = [
    '    <!-- R74：入口卡区（自原「动态」落地页迁入）。原「朋友圈信息流」入口已由本页信息流主体承接，此处保留「我的动态」直达卡 -->',
    '    <div class="mo-entry">',
    '      <a class="mo-entry-card" href="我的动态.html">',
    '        <div class="mo-entry-icon">👤</div>',
    '        <div class="mo-entry-t">我的动态</div>',
    '        <div class="mo-entry-s">我 → 头像 → 动态</div>',
    '      </a>',
    '    </div>',
    '',
]
anchor_entry = '    <div class="xtm-refresh" id="xtmRefresh">'.encode('utf-8')
out = rep(out, anchor_entry, blk(entry_lines) + anchor_entry, 1)

# 2c. moOpenUser（typeof 守卫，防顶层重复声明）
mo_lines = [
    '<script>',
    '/* R74：保留原全局函数名 moOpenUser（点头像/昵称跳个人资料页），typeof 守卫防重复声明 */',
    "if (typeof window.moOpenUser !== 'function') {",
    "  window.moOpenUser = function (uid) { if (uid) location.href = '个人资料.html?user=' + uid; };",
    '}',
    '</script>',
]
anchor_mo = '<script src="assets/ai-config.js?v=20260916R"></script>'.encode('utf-8')
out = rep(out, anchor_mo, blk(mo_lines) + anchor_mo, 1)

# 死链口径：动态.html 的出现必须全部来自存活的「我的动态.html」链接（非死链）
assert out.count('动态.html'.encode('utf-8')) == out.count('我的动态.html'.encode('utf-8')), '新页残留 动态.html 死引用'
assert out.count('朋友圈.html'.encode('utf-8')) == 0, '新页残留 朋友圈.html'
assert crlf_ok(out), '新页 bareLF'
assert out.count(b'moOpenUser') == 3  # 注释 + typeof + 赋值行内 1 处（typeof 处 1、赋值处 1、注释 1）
wb(P('动态空间.html'), out)
log('CREATE 动态空间.html bytes=%d' % len(out))

# ---------- 3. 删除旧文件（python 复制+删除式改名；动态.html 功能已并入新页） ----------
os.remove(P('朋友圈.html'))
os.remove(P('动态.html'))
log('DELETE 朋友圈.html / 动态.html done')

# ---------- 4. 我的动态.html ----------
d = rb(P('我的动态.html'))
assert crlf_ok(d)
d = rep(d, "location.href='朋友圈.html'".encode('utf-8'),
        "location.href='动态空间.html'".encode('utf-8'), 1)
d = rep(d, '<div class="bm-label">朋友圈</div>'.encode('utf-8'),
        '<div class="bm-label">动态空间</div>'.encode('utf-8'), 1)
assert d.count('朋友圈.html'.encode('utf-8')) == 0
wb(P('我的动态.html'), d)
log('UPDATE 我的动态.html bytes=%d' % len(d))

# ---------- 5. 朋友圈发布.html ----------
d = rb(P('朋友圈发布.html'))
assert crlf_ok(d)
d = rep(d, "location.href='朋友圈.html'".encode('utf-8'),
        "location.href='动态空间.html'".encode('utf-8'), 1)
d = rep(d, '<div class="bm-label">朋友圈</div>'.encode('utf-8'),
        '<div class="bm-label">动态空间</div>'.encode('utf-8'), 1)
assert d.count('朋友圈.html'.encode('utf-8')) == 0
wb(P('朋友圈发布.html'), d)
log('UPDATE 朋友圈发布.html bytes=%d' % len(d))

# ---------- 6. 更多.html ----------
d = rb(P('更多.html'))
assert crlf_ok(d)
d = rep(d, "location.href='动态.html'".encode('utf-8'),
        "location.href='动态空间.html'".encode('utf-8'), 1)
assert d.count('动态.html'.encode('utf-8')) == 0
wb(P('更多.html'), d)
log('UPDATE 更多.html bytes=%d' % len(d))

# ---------- 7. 个人中心.html ----------
pc = rb(P('个人中心.html'))
assert crlf_ok(pc)
# 7a. 入口卡：原「我的动态」菜单项 → 「动态空间」直达卡（与相邻 subpage-group-card 同构）
pc = rep(pc,
         '<div class="subpage-group-card" onclick="SubpageRouter.navigate(\'moments\')">'.encode('utf-8'),
         ('<!-- R74：原「我的动态」入口卡改为「动态空间」直达入口（页内我的动态子页仍可经 hash #moments 直达） -->\r\n'
          '          <div class="subpage-group-card" onclick="location.href=\'动态空间.html\'">').encode('utf-8'), 1)
pc = rep(pc, '<div class="sgc-icon" data-icon="globe"></div>'.encode('utf-8'),
         '<div class="sgc-icon" data-icon="rss"></div>'.encode('utf-8'), 1)
pc = rep(pc,
         '<div class="sgc-main"><div class="sgc-title">我的动态</div><div class="sgc-desc">本人发布的动态列表（含删除）</div></div>'.encode('utf-8'),
         '<div class="sgc-main"><div class="sgc-title">动态空间</div><div class="sgc-desc">朋友圈信息流 · 我的动态 · 发布打卡</div></div>'.encode('utf-8'), 1)
# 7b. 全局 5 处 动态.html 活引用 → 动态空间.html
assert pc.count('我的动态.html'.encode('utf-8')) == 0
pc = rep(pc, '动态.html'.encode('utf-8'), '动态空间.html'.encode('utf-8'), 5)
wb(P('个人中心.html'), pc)
log('UPDATE 个人中心.html bytes=%d' % len(pc))

# ---------- 8. assets/app.js（仅 PAGE_FILES.moments 一处，精确字节替换） ----------
app = rb(app_path)
app = rep(app, "moments: '动态.html',".encode('utf-8'),
          "moments: '动态空间.html',".encode('utf-8'), 1)
assert app.count('动态.html'.encode('utf-8')) == 0
assert app.count('朋友圈.html'.encode('utf-8')) == 0
wb(app_path, app)
app_after = rb(app_path)
l665_after = len(app_after.split(b'\n')[664].rstrip(b'\r'))
assert l665_after == l665_before, 'L665 被触碰: %d -> %d' % (l665_before, l665_after)
log('UPDATE assets/app.js bytes=%d->%d L665len=%d(unchanged)' % (len(app_before), len(app_after), l665_after))

# ---------- 9. assets/xt-moments.js（3 处引用） ----------
xm_path = P(r'assets\xt-moments.js')
xm = rb(xm_path)
xm = rep(xm, "location.href = '朋友圈.html';".encode('utf-8'),
         "location.href = '动态空间.html';".encode('utf-8'), 1)
xm = rep(xm, "location.href = '动态.html';".encode('utf-8'),
         "location.href = '动态空间.html';".encode('utf-8'), 2)
assert xm.count('动态.html'.encode('utf-8')) == 0
assert xm.count('朋友圈.html'.encode('utf-8')) == 0
wb(xm_path, xm)
log('UPDATE assets/xt-moments.js bytes=%d' % len(xm))

log('ALL MUTATIONS DONE OK')
