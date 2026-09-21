# -*- coding: utf-8 -*-
"""R73p 主理人复核：符号签名 + 语法 + 行尾 + 版本戳 + 泄密扫描（单轮判定）"""
import os, io, subprocess, hashlib, datetime

ROOT = r'D:\下载的文件\学习工作台'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
OUT = r'C:\Users\ATM\_r73p_lead_verify.txt'
LOG = []
ok = True

def chk(cond, msg):
    global ok
    LOG.append(('  OK  ' if cond else ' !!!  ') + msg)
    if not cond: ok = False

# ---------- 1) 四个资产语法 + 行尾 + 体积/mtime ----------
FILES = ['assets/ai-service.js', 'assets/ai-config.js', 'assets/ai-settings.js', 'assets/ai-page.js']
for f in FILES:
    p = os.path.join(ROOT, f)
    r = subprocess.run([NODE, '--check', p], capture_output=True)
    chk(r.returncode == 0, '%s node --check rc=%d' % (f, r.returncode))
    raw = open(p, 'rb').read()
    crlf = raw.count(b'\r\n'); lone = raw.count(b'\n') - crlf
    want_crlf = (f == 'assets/ai-config.js')
    chk((crlf > 0 and lone == 0) if want_crlf else (crlf == 0),
        '%s 行尾 CRLF=%d loneLF=%d（期望 %s）' % (f, crlf, lone, 'CRLF' if want_crlf else 'LF'))
    LOG.append('       %s: %d bytes, mtime=%s' % (f, len(raw),
               datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%m-%d %H:%M:%S')))

# ---------- 2) 关键改动的符号签名 ----------
svc = open(os.path.join(ROOT, 'assets/ai-service.js'), 'rb').read().decode('utf-8')
st = open(os.path.join(ROOT, 'assets/ai-settings.js'), 'rb').read().decode('utf-8')
page = open(os.path.join(ROOT, 'assets/ai-page.js'), 'rb').read().decode('utf-8')
cfg = open(os.path.join(ROOT, 'assets/ai-config.js'), 'rb').read().decode('utf-8')

chk('GEMINI_MIN_OUTPUT_TOKENS' in svc, 'ai-service: GEMINI_MIN_OUTPUT_TOKENS 常量存在')
chk(svc.count('TRUNCATED') >= 2, 'ai-service: TRUNCATED 分支存在（%d 处）' % svc.count('TRUNCATED'))
chk('realType' in svc and 'imagegen' in svc.split('realType')[1][:400], 'ai-service: callAI 生图跳过中转的 realType 判定存在')
chk('geminiOutputTokens' in svc, 'ai-service: geminiOutputTokens 助手存在')
chk('truncated' in st, 'ai-settings: truncated 文案分支存在')
chk('被上限截断' in st, 'ai-settings: 「输出被上限截断」如实文案存在')
chk('Key 无效或已过期' in st, 'ai-settings: Key 失效如实文案存在')
chk('(\\S+)' in page, 'ai-page: 图片正则 URL 段已放宽')
chk('R73p' in cfg, 'ai-config: R73p 注释已更新')

# ---------- 3) 版本戳 ----------
ASSETS = ['ai-service.js', 'ai-config.js', 'ai-settings.js', 'ai-page.js']
new_cnt = {a: 0 for a in ASSETS}
old_cnt = 0
htmls = 0
for fn in sorted(os.listdir(ROOT)):
    if not fn.endswith('.html') or fn.startswith('_') or '.bak' in fn:
        continue
    t = open(os.path.join(ROOT, fn), 'rb').read().decode('utf-8', 'replace')
    hit = False
    for a in ASSETS:
        new_cnt[a] += t.count(a + '?v=20260918b')
    for a in ASSETS:
        old_cnt += t.count(a + '?v=20260918a') + t.count(a + '?v=20260917b')
    htmls += 1
LOG.append('  HTML 扫描 %d 个；新戳 20260918b: %s' % (htmls, new_cnt))
chk(all(v > 0 for v in new_cnt.values()), '四个资产均有 20260918b 引用')
chk(old_cnt == 0, '旧戳（20260918a/20260917b）残留=%d（应 0）' % old_cnt)

# ---------- 4) 泄密扫描（待提交内容）----------
leak = []
for f in FILES:
    raw = open(os.path.join(ROOT, f), 'rb').read()
    for pat in [b'<REDACTED-GEMINI-旧KEY前缀>', b'<REDACTED-OPENROUTER-旧KEY前缀>']:
        if pat in raw:
            leak.append((f, pat.decode()))
chk(not leak, '阻塞型密钥扫描: %s' % (leak or '干净'))

LOG.append('RESULT: ' + ('PASS' if ok else 'FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print(LOG[-1])
