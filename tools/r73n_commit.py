# -*- coding: utf-8 -*-
"""R73n 提交：泄密扫描 + 提交 ai-service/ai-settings + 37 HTML"""
import subprocess, io, hashlib

ROOT = r'D:\下载的文件\学习工作台'
G = ['git', '-C', ROOT, '-c', 'core.quotepath=false']
OUT = r'C:\Users\ATM\_r73n_commit_out.txt'
LOG = []
def log(s): LOG.append(str(s))

def run(args, timeout=120):
    r = subprocess.run(G + args, capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

HTMLS = ['AI.html', 'AI模拟面试.html', 'PPT案例拆解.html', 'PPT版式库.html', 'ai-settings.html',
         'blog_wechat.html', '万能金句库.html', '个人中心.html', '企业定向库.html', '关于.html',
         '动态空间.html', '商务礼仪.html', '四级词汇.html', '场景话术库.html', '学习工作台.html',
         '学习概括.html', '导入题库.html', '工具.html', '我的动态.html', '我的文件.html',
         '时政热点.html', '更多.html', '朋友圈发布.html', '演示.html', '申论刷题.html', '社区.html',
         '私聊.html', '管理员.html', '英语.html', '行测.html', '行测刷题.html', '表达.html',
         '设置.html', '赞助.html', '错题本.html', '面测.html', '面试题库.html']
STAGE = ['assets/ai-service.js', 'assets/ai-settings.js'] + HTMLS

# ---------- 1) 泄密扫描（待提交文件的当前内容）----------
leak = []
for f in STAGE:
    raw = open(ROOT + '\\' + f.replace('/', '\\'), 'rb').read()
    for pat in [b'AQ.Ab8RN6', b'sk-or-v1-65bfdfbf', b'ark-e725e1de', b'339ab3965685', b'bce-v3/ALTAK', b'sk-ftwbrdrl']:
        if pat in raw:
            leak.append((f, pat.decode()))
log('泄密扫描: %s' % (leak or '干净'))
assert not leak, '发现泄密: %s' % leak

# ---------- 2) 提交 ----------
for f in STAGE:
    rc, so, se = run(['add', f])
    assert rc == 0, 'add 失败 ' + f + se
msg = ("R73n：海外平台连通性检测修复——超时误报「需要梯子」\n\n"
       "- ai-service.js：needProxy 平台（gemini/openrouter）检测窗口 5s→15s（HEALTH_TIMEOUT_PROXY），"
       "走梯子的完整请求（TLS+推理）常超 5s，被误判网络不通\n"
       "- ai-settings.js：timeout/empty 失败文案不再谎报「需要梯子」，改为「平台可达但响应慢，检测超时，请重试」\n"
       "- 37 页面版本戳 20260918a\n"
       "线上已部署验证（nginx:80）")
io.open(ROOT + r'\tools\_r73n_commit_msg.txt', 'w', encoding='utf-8').write(msg)
rc, so, se = run(['commit', '-F', 'tools/_r73n_commit_msg.txt'])
log('commit rc=%d\n%s\n%s' % (rc, so.strip(), se.strip()))
assert rc == 0, 'commit 失败'
rc, so, se = run(['log', '--oneline', '-2'])
log('HEAD:\n%s' % so.strip())

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE')
