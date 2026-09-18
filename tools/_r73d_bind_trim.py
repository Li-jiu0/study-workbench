# -*- coding: utf-8 -*-
# R73d 需求：设置页删除「绑定手机号 / 绑定微信号」，仅保留邮箱绑定
import io, os, re, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'D:\下载的文件\学习工作台\设置.html'
BAK = r'D:\下载的文件\学习工作台\备份\设置.html.backup-20260918-bind-trim'
os.makedirs(os.path.dirname(BAK), exist_ok=True)
shutil.copyfile(P, BAK)

with open(P, 'rb') as f:
    raw = f.read()
base_crlf = raw.count(b'\r\n')

edits = [
    # 1) 渠道数组收缩为仅 email（渲染循环与所有入口随之只剩邮箱）
    ("var ST_BIND_CHANNELS = ['phone', 'wechat', 'email'];",
     "var ST_BIND_CHANNELS = ['email']; /* R73d(20260918)：手机号/微信号绑定入口按需求删除，仅保留邮箱 */"),
    # 2) 页面描述
    ("绑定手机号 / 微信号 / 邮箱号，用于账号找回与登录安全。",
     "绑定邮箱号，用于账号找回与登录安全。"),
    # 3) 区块头注释
    ("<!-- 绑定与认证（任务 E · 2026-09-16）：手机号 / 微信号 / 邮箱号 三项绑定状态 + 页面内可展开区块。",
     "<!-- 绑定与认证（任务 E · 2026-09-16；R73d · 2026-09-18 删除手机号/微信号入口）：邮箱号绑定状态 + 页面内可展开区块。"),
    # 4) 契约注释同步
    ("三项绑定：手机号 / 微信号 / 邮箱号，各自显示「未绑定」或脱敏值，每行一个操作按钮。",
     "绑定项：邮箱号（R73d 起仅保留邮箱，手机号/微信号入口已删），显示「未绑定」或脱敏值，每行一个操作按钮。"),
]
n_total = 0
for old, new in edits:
    b_old, b_new = old.encode('utf-8'), new.encode('utf-8')
    cnt = raw.count(b_old)
    assert cnt == 1, '锚点非唯一(%d): %s' % (cnt, old[:40])
    raw = raw.replace(b_old, b_new, 1)
    n_total += 1

with open(P, 'wb') as f:
    f.write(raw)

# 自检：行尾不变 + 关键配对 + 手机/微信入口消失
raw2 = open(P, 'rb').read()
crlf = raw2.count(b'\r\n'); lone = raw2.count(b'\n') - crlf
t = raw2.decode('utf-8')
checks = {
    'CRLF 不变': crlf == base_crlf and lone == 0,
    "ST_BIND_CHANNELS 收缩": "ST_BIND_CHANNELS = ['email']" in t,
    '手机号入口消失': "stOpenBindPanel('phone')" not in t and "stUnbind('phone')" not in t,
    '微信号入口消失': "stOpenBindPanel('wechat')" not in t and "stUnbind('wechat')" not in t,
    '邮箱入口保留': "stOpenBindPanel('email')" in t or "stUnbind('email')" in t,
    '注释配对': t.count('<!--') == t.count('-->'),
    'script 配对': t.count('<script') == t.count('</script>'),
    'style 配对': t.count('<style') == t.count('</style>'),
    'div 配对': t.count('<div') == t.count('</div>'),
}
for k, v in checks.items():
    print(('PASS ' if v else 'FAIL ') + k)
print('edits=%d, bytes %d -> %d' % (n_total, base_crlf and len(open(P,'rb').read()), len(raw2)))
sys.exit(0 if all(checks.values()) else 1)
