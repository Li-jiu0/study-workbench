# -*- coding: utf-8 -*-
"""R73b 文字专项（A9-A13）加固：仅动本线 5 个文件，二进制保 CRLF。"""
import io, os, shutil

BASE = r'D:\下载的文件\学习工作台'


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def apply(p, pairs):
    s = read(p); orig = s
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, 'COUNT=%d for %r in %s' % (n, old[:50], p)
        s = s.replace(old, new)
    assert s != orig
    write(p, s)


log = []

# 备份将被修改的既有文件
for f in ['社区.html', '更多.html', '学习工作台.html']:
    p = os.path.join(BASE, f); bak = p + '.bak-pre-r73b-20260917'
    if not os.path.exists(bak):
        shutil.copy2(p, bak); log.append('BACKUP -> ' + os.path.basename(bak))

# ---------- 学习工作台.html: A7/A12 修 10px -> 11px ----------
p = os.path.join(BASE, '学习工作台.html')
apply(p, [('          .home-cards-carousel .stat-card .stat-label { font-size: 10px; }\r\n',
           '          .home-cards-carousel .stat-card .stat-label { font-size: 11px; }\r\n')])
log.append('学习工作台.html: .stat-label 10px -> 11px')

# ---------- 社区.html: A9/A10/A11 页内加固 ----------
p = os.path.join(BASE, '社区.html')
old = ('.xt-share-item:hover { background: var(--bg-sub); color: var(--primary); }\r\n</style>\r\n')
new = ('.xt-share-item:hover { background: var(--bg-sub); color: var(--primary); }\r\n'
       '/* ===== R73 文字专项（需求20-B · A9/A10/A11）：本页局部加固，不改 common.css =====\r\n'
       '   ① 评论头行（头像+昵称+时间）允许换行：长昵称不再把时间挤成一列/压盖；\r\n'
       '   ② 正文/摘要/评论内的长英文、URL、连续数字可断行，不撑破卡片。 */\r\n'
       '.bc-item .bc-body { min-width: 0; }\r\n'
       '.bc-item .bc-head { flex-wrap: wrap; }\r\n'
       '.bc-item .bc-head > span:first-child { min-width: 0; overflow-wrap: break-word; }\r\n'
       '.note-body .nc-title,\r\n'
       '.note-body .nc-excerpt,\r\n'
       '.note-detail-box .nd-content,\r\n'
       '.bc-item .bc-text { word-break: break-word; overflow-wrap: break-word; }\r\n'
       '</style>\r\n')
apply(p, [(old, new)])
log.append('社区.html: 头部加固 (bc-head 换行 / min-width:0 / 正文长串可断)')

# ---------- 更多.html: 窄屏入口行加固 ----------
p = os.path.join(BASE, '更多.html')
old = '<script>window.__XT_PROD__=true;</script>\r\n</head>'
new = ('<script>window.__XT_PROD__=true;</script>\r\n'
       '<style>\r\n'
       '/* ===== R73 文字专项（需求20-B · 窄屏）：更多页入口列表加固，宽屏外观不变 ===== */\r\n'
       '@media (max-width: 480px) {\r\n'
       '  .morepage-list .morepage-card { flex-wrap: wrap; }\r\n'
       '  .morepage-list .morepage-card .mpc-title { flex: 1 1 auto; min-width: 0; }\r\n'
       '  .morepage-list .morepage-card .mpc-desc { flex: 1 1 100%; min-width: 0; margin-top: 2px; }\r\n'
       '}\r\n'
       '</style>\r\n'
       '</head>')
apply(p, [(old, new)])
log.append('更多.html: 新增 <style> 窄屏入口行 wrap 规则')

# ---------- 赞助.html: min-width:0 + 长串可断 + 字号对齐 关于.html ----------
p = os.path.join(BASE, '赞助.html')
apply(p, [
    ('.sp-hero-name{font-size:18px;font-weight:800;color:var(--text,#1a1b1c);line-height:1.2;}\r\n',
     '.sp-hero-name{font-size:20px;font-weight:800;color:var(--text,#1a1b1c);line-height:1.2;}\r\n'),
    ('.sp-hero-sub{font-size:13px;color:var(--text-secondary,#6b7280);margin-top:4px;}\r\n',
     '.sp-hero-sub{font-size:13px;color:var(--text-secondary,#6b7280);margin-top:4px;overflow-wrap:break-word;word-break:break-word;}\r\n'
     '.sp-hero-txt{flex:1 1 auto;min-width:0;}\r\n'),
    ('.sp-text{font-size:var(--xt-font-base,14px);color:var(--text-secondary,#4b5563);line-height:1.8;margin-top:14px;}\r\n',
     '.sp-text{font-size:var(--xt-font-base,14px);color:var(--text-secondary,#4b5563);line-height:1.8;margin-top:14px;overflow-wrap:break-word;word-break:break-word;}\r\n'),
    ('.sp-note{font-size:12px;color:var(--text-secondary,#9ca3af);line-height:1.8;margin-top:12px;text-align:center;}\r\n',
     '.sp-note{font-size:12px;color:var(--text-secondary,#9ca3af);line-height:1.8;margin-top:12px;text-align:center;overflow-wrap:break-word;word-break:break-word;}\r\n'),
    ('  .sp-hero-name{font-size:16px;}\r\n', '  .sp-hero-name{font-size:18px;}\r\n'),
    ('              <div class="sp-hero-icon"><span class="nav-icon" data-icon="coffee" data-icon-size="26"></span></div>\r\n              <div>\r\n',
     '              <div class="sp-hero-icon"><span class="nav-icon" data-icon="coffee" data-icon-size="26"></span></div>\r\n              <div class="sp-hero-txt">\r\n'),
])
log.append('赞助.html: hero 文本 min-width:0 + 长串可断 + 字号对齐 关于.html(20/18)')

with io.open(os.path.join(BASE, '_r73b_apply_log.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
