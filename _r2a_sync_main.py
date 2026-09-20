# -*- coding: utf-8 -*-
"""R2A 主树同步：把 worktree 本批成果按「主树行尾口径」写入真源 D:\\下载的文件\\学习工作台

要点：
- 已存在文件：采用主树现有行尾（避免 §5.0「CRLF↔LF 静默互转」事故；生产实测 49 个 LF / 11 个 CRLF）
- 新文件：保持作者原始行尾，不做无谓转换
- 覆盖前备份到 备份/_r2a_bak_20260920/
- 逐文件归一化 md5 复核（应为一致），并打印行尾
"""
import os, io, shutil, hashlib, sys

WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
MAIN = r'D:\下载的文件\学习工作台'
BAK = os.path.join(MAIN, '备份', '_r2a_bak_20260920')

NEW_FILES = [
    '协议.html',
    '数据管理.html',
    'assets/img-viewer.js',
    'android/java/com/study/workbench/PollKeepAliveJobService.java',
    'docs/增量设计-实时位置双向共享.md',
    'docs/增量设计-图片查看与保存-协议重写-数据管理重构.md',
    'docs/增量设计-关于页-设置核对-横幅通知-模型删除.md',
    '_r2a_stamp.py',
    '_r2a_prod_probe.py',
]
MOD_FILES = [
    'assets/api.js',
    'assets/app.js',
    'assets/chat-local.js',
    'assets/xt-moments.js',
    'assets/xt-settings.js',
    'assets/xt-update.js',
    '关于.html',
    '设置.html',
    '个人中心.html',
    '私聊.html',
    '动态空间.html',
    '我的动态.html',
    '朋友圈发布.html',
    'android/AndroidManifest.xml',
    'android/java/com/study/workbench/MainActivity.java',
    'android/java/com/study/workbench/MsgPollService.java',
    'android/java/com/study/workbench/PollLogic.java',
]


def eol_of(b):
    c = b.count(b'\r\n'); l = b.count(b'\n') - c
    return 'CRLF' if (c and not l) else ('LF' if (l and not c) else 'MIXED')


def to_eol(b, kind):
    u = b.replace(b'\r\n', b'\n')
    return u.replace(b'\n', b'\r\n') if kind == 'CRLF' else u


def norm(b):
    return hashlib.md5(b.replace(b'\r\n', b'\n')).hexdigest()


os.makedirs(BAK, exist_ok=True)
rows = []
for rel in NEW_FILES + MOD_FILES:
    src = os.path.join(WT, rel)
    dst = os.path.join(MAIN, rel)
    if not os.path.isfile(src):
        rows.append((rel, 'SRC_MISSING', '', '', '')); continue
    sb = open(src, 'rb').read()
    is_new = not os.path.exists(dst)
    if is_new:
        out = sb                      # 新文件保持作者原行尾
        kind = eol_of(sb) + '(新)'
    else:
        db = open(dst, 'rb').read()
        kind = eol_of(db)
        bdir = os.path.join(BAK, os.path.dirname(rel))
        os.makedirs(bdir, exist_ok=True)
        shutil.copy2(dst, os.path.join(BAK, rel))
        out = to_eol(sb, kind) if kind in ('CRLF', 'LF') else sb
    d = os.path.dirname(dst)
    if d:
        os.makedirs(d, exist_ok=True)
    open(dst, 'wb').write(out)
    rows.append((rel, 'NEW' if is_new else 'OVERWRITE', kind,
                 'md5ok' if norm(out) == norm(sb) else '★md5不一致',
                 '%d->%d' % (len(out), len(sb))))

w = 0
for r in rows:
    print('%-52s %-10s %-12s %-12s %s' % r)
    if r[3] == '★md5不一致':
        w += 1
print('不一致数 =', w)
print('备份目录 =', BAK)
