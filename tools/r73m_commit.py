# -*- coding: utf-8 -*-
"""R73k+R73m 提交：ai-config/ai-page/ai-service/config.py，ai-config 密钥脱敏提交后还原"""
import subprocess, io, hashlib, sys

ROOT = r'D:\下载的文件\学习工作台'
G = ['git', '-C', ROOT, '-c', 'core.quotepath=false']
CFG = ROOT + r'\assets\ai-config.js'
BAK = ROOT + r'\assets\ai-config.js.bak-secretfix-r73m'
OUT = r'C:\Users\ATM\_r73m_commit_out.txt'
LOG = []
def log(s): LOG.append(str(s))

def run(args, timeout=60):
    r = subprocess.run(G + args, capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

# ---------- 0) 基线 ----------
raw = open(CFG, 'rb').read()
md5_orig = hashlib.md5(raw).hexdigest()
open(BAK, 'wb').write(raw)
log('备份 ai-config.js -> %s (%d bytes, md5=%s)' % (BAK, len(raw), md5_orig))
text = raw.decode('utf-8')
n1 = text.count('<REDACTED-GEMINI-旧KEY前缀>')
n2 = text.count('<REDACTED-OPENROUTER-旧KEY前缀>')
log('脱敏目标出现次数: <REDACTED-GEMINI-旧KEY前缀>×%d, <REDACTED-OPENROUTER-旧KEY前缀>×%d' % (n1, n2))

# ---------- 1) 脱敏 ----------
text2 = text.replace('AQ.***REDACTED-已泄露作废-需换新KEY***', '<REDACTED-GEMINI-占位串>')
text2 = text2.replace('***REMOVED-BY-R2C***', 'sk-or-v1-REDACTED-OPENROUTER-KEY')
assert '<REDACTED-GEMINI-旧KEY前缀>' not in text2 and '<REDACTED-OPENROUTER-旧KEY前缀>' not in text2, '脱敏后仍有真实 Key'
open(CFG, 'wb').write(text2.encode('utf-8'))
log('脱敏写入 OK')

# ---------- 2) 提交 ----------
for f in ['assets/ai-config.js', 'assets/ai-page.js', 'assets/ai-service.js', 'server/config.py']:
    rc, so, se = run(['add', f])
    log('add %s rc=%d %s' % (f, rc, se.strip()))
msg = ("R73k+R73m：402 根因修复\n\n"
       "- ai-config.js：移除 siliconflow 平台（欠费）；视觉主模型 glm-4.6v-flash→glm-4v-flash；"
       "seedream 回退错误指向文本模型改为 null\n"
       "- ai-page.js：seedream 回退镜像同步\n"
       "- ai-service.js：中转响应前缀 ⚠️【中转错误】识别，失败自动降级前端直连链路\n"
       "- server/config.py：新增 ark / qianfan 两个中转 provider（Key 走 .env），zhipu 默认模型 glm-4.7\n"
       "服务器 .env 已同步 ARK/ZHIPU/QIANFAN Key 并注释 SILICONFLOW（不入库）")
io.open(ROOT + r'\tools\_r73m_commit_msg.txt', 'w', encoding='utf-8').write(msg)
rc, so, se = run(['commit', '-F', 'tools/_r73m_commit_msg.txt'])
log('commit rc=%d\n%s\n%s' % (rc, so.strip(), se.strip()))
assert rc == 0, 'commit 失败'
rc, so, se = run(['log', '--oneline', '-1'])
log('HEAD: %s' % so.strip())

# ---------- 3) 还原本地真实 Key ----------
open(CFG, 'wb').write(raw)
md5_back = hashlib.md5(open(CFG, 'rb').read()).hexdigest()
log('还原 md5=%s 一致=%s' % (md5_back, md5_back == md5_orig))
assert md5_back == md5_orig, '还原失败！真实 Key 备份在 ' + BAK

rc, so, se = run(['status', '--porcelain', 'assets/ai-config.js'])
log('还原后 status（应显示 M，因本地与提交版不同）: %s' % so.strip())

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE')
