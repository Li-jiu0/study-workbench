# -*- coding: utf-8 -*-
"""R73 全站需求残留扫描：所有"应删除/应替换"的旧字符串，以及新页入口联通性"""
import os, re, json

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

SKIP_DIRS = {'.git', '.venv', 'node_modules', '__pycache__', '.tmp_eng', '_tmp_l3_qa',
             '_w2t1_img', '备份', '.page', 'tools', 'android/libs'}
SKIP_MARK = ('.bak', '.backup', '.orig', '~')

def walk():
    for dp, dns, fns in os.walk(ROOT):
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not d.startswith('.')]
        for fn in fns:
            if any(m in fn for m in SKIP_MARK):
                continue
            if fn.endswith(('.html', '.js', '.css', '.py', '.md', '.txt', '.json')):
                yield os.path.join(dp, fn)

# ---------- A) 应被删除/替换的旧字符串 ----------
GONE = {
    '需求9-①删': '多人在线：资料保存在服务器数据库',
    '需求9-②删': '打开任意页面即开始计时',
    '需求9-③旧': '模块级：输出该模块最该补的',
    '需求9-④删': '被拉黑的用户无法向你发送好友申请',
    '需求9-④a': '隐私说明',
    '需求9-⑤旧': '（不影响已是好友和同群成员看到你）',
    '需求9-④b': '黑名单需联网查看',
    '需求5-删': 'AI辅助写发贴',
    '需求7-旧': '博客数据统计',
    '需求8-删': '今日目标完成率',
    '需求8-删2': '目标完成率',
    '需求10-旧1': '白天上班、晚上备考',
    '需求10-旧2': '给上班族的备考搭子',
    '需求10-旧3': '小叶子',
}
# ---------- B) 应存在的新字符串 ----------
HAVE = {
    '需求5-新': '请编辑.....',
    '需求7-新': '帖子数据统计',
    '需求10-新1': '譬如今日生',
    '需求10-新2': '实干出真知',
    '需求10-新3': '树枝子',
    '需求11-新': '动态空间',
    '需求21-新': '赞助.html',
    '需求15-新': '这个人很懒，什么都没写',
}

files = list(walk())
log('扫描文件数 = %d' % len(files))
log('')

def scan(label, table, want_zero):
    log('== %s ==' % label)
    for k, s in table.items():
        hits = []
        for fp in files:
            try:
                t = open(fp, 'rb').read().decode('utf-8', 'ignore')
            except Exception:
                continue
            if s in t:
                rel = os.path.relpath(fp, ROOT)
                n = t.count(s)
                ln = t.count('\n', 0, t.index(s)) + 1
                hits.append('%s:%d(x%d)' % (rel, ln, n))
        flag = 'OK' if ((len(hits) == 0) == want_zero) else '**CHECK**'
        log('  %-14s [%s] 命中=%d  %s' % (k, flag, len(hits), ' '.join(hits[:6])))
    log('')

scan('A) 旧字符串（目标：0 命中）', GONE, True)
scan('B) 新字符串（目标：>=1 命中）', HAVE, False)

# ---------- C) 新页入口联通性 ----------
log('== C) 新页入口/资源连通性 ==')
NEED = [
    ('动态.html', '朋友圈.html', '动态空间 → 朋友圈信息流'),
    ('动态.html', '我的朋友圈.html', '动态空间 → 我的朋友圈'),
    ('更多.html', '赞助.html', '更多 → 赞助'),
    ('朋友圈.html', 'assets/xt-moments.js', '朋友圈 脚本'),
    ('我的朋友圈.html', 'assets/xt-moments.js', '我的朋友圈 脚本'),
    ('朋友圈发布.html', 'assets/xt-moments.js', '发布页 脚本'),
    ('个人资料.html', 'assets/xt-profile.js', '个人资料 脚本'),
    ('赞助.html', 'assets/赞助收款码.jpg', '赞助 图片'),
    ('个人中心.html', '个人资料.html', '个人中心 → 个人资料'),
]
for src, need, desc in NEED:
    fp = os.path.join(ROOT, src)
    if not os.path.exists(fp):
        log('  [MISS] %-18s 不存在' % src); continue
    t = open(fp, 'rb').read().decode('utf-8', 'ignore')
    ok = need in t
    log('  [%s] %-18s 含 %-26s (%s)' % ('OK' if ok else '**NO**', src, need, desc))
log('')

# ---------- D) 个人资料.html 全文 ----------
log('== D) 个人资料.html 全文（%d B）==')
fp = os.path.join(ROOT, '个人资料.html')
b = open(fp, 'rb').read()
log('  size=%d CRLF=%d bare_LF=%d BOM=%s' % (len(b), b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n'), b[:3] == b'\xef\xbb\xbf'))
log(b.decode('utf-8-sig', 'replace'))

open(os.path.join(ROOT, 'tools', '_r73_residual.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_residual.txt')
