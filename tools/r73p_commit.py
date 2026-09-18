# -*- coding: utf-8 -*-
"""R73p 提交：ai-config 提交内脱敏（提交后还原）+ 4 资产 + 改戳 HTML"""
import subprocess, io, hashlib, re

ROOT = r'D:\下载的文件\学习工作台'
G = ['git', '-C', ROOT, '-c', 'core.quotepath=false']
CFG = ROOT + r'\assets\ai-config.js'
BAK = CFG + '.bak-secretfix-r73p'
OUT = r'C:\Users\ATM\_r73p_commit_out.txt'
LOG = []
def log(s): LOG.append(str(s))
def run(args, timeout=120):
    r = subprocess.run(G + args, capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

# 0) 待提交 HTML（改过戳的）
rc, so, se = run(['status', '--porcelain'])
mod_html = [ln[3:].strip() for ln in so.splitlines()
            if ln.startswith(' M ') and ln.strip().endswith('.html')]
log('改过戳的 HTML: %d 个' % len(mod_html))

# 1) 备份 + 脱敏
raw = open(CFG, 'rb').read()
md5_orig = hashlib.md5(raw).hexdigest()
open(BAK, 'wb').write(raw)
text = raw.decode('utf-8')
text2 = text.replace('***REMOVED-BY-R2C***', 'AQ.REDACTED-GEMINI-KEY')
text2 = text2.replace('***REMOVED-BY-R2C***', '***REMOVED-BY-R2C***')
assert 'AQ.Ab8RN6' not in text2 and 'sk-or-v1-65bfdfbf' not in text2
open(CFG, 'wb').write(text2.encode('utf-8'))
log('脱敏写入 OK（原 %d bytes）' % len(raw))

# 2) 提交
STAGE = ['assets/ai-service.js', 'assets/ai-settings.js', 'assets/ai-page.js', 'assets/ai-config.js'] + mod_html
for f in STAGE:
    rc, so, se = run(['add', f])
    assert rc == 0, 'add 失败 %s %s' % (f, se)
msg = ("R73p：生图链路接通 + 失败文案停止谎报\n\n"
       "- ai-service.js：callAI 中生图模型跳过服务端文本中转（原被 relayChat 抢先，永远生不出图）；\n"
       "  Gemini 输出下限 4096（思考 token 计入 maxOutputTokens，1 token 会被思维链吃满→空响应）；\n"
       "  Gemini 空响应抛 TRUNCATED 并带真实 finishReason；健康检查不再把 Gemini 压到 maxTokens=1；\n"
       "  手动选中生图模型时不被三模式链覆盖；生图 alt 净化\n"
       "- ai-settings.js：失败文案七分场景（truncated/empty/timeout/cors/network/401·403/404）如实显示，不再一律谎报超时\n"
       "- ai-page.js：图片正则 URL 段放宽\n"
       "- ai-config.js：更新过期注释（三模型实测 200 出图）\n"
       "- 37 页面版本戳 20260918b（四个资产统一归一化）")
io.open(ROOT + r'\tools\_r73p_commit_msg.txt', 'w', encoding='utf-8').write(msg)
rc, so, se = run(['commit', '-F', 'tools/_r73p_commit_msg.txt'])
log('commit rc=%d\n%s\n%s' % (rc, so.strip(), se.strip()))
assert rc == 0, 'commit 失败'

# 3) 还原真实 Key
open(CFG, 'wb').write(raw)
md5_back = hashlib.md5(open(CFG, 'rb').read()).hexdigest()
log('还原 md5 一致=%s' % (md5_back == md5_orig))
assert md5_back == md5_orig, '还原失败！备份在 ' + BAK
rc, so, se = run(['log', '--oneline', '-1'])
log('HEAD: %s' % so.strip())
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('COMMIT_OK')
