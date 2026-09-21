# -*- coding: utf-8 -*-
import os, re, sys, io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_qa27_static.txt')
L = []
def log(s):
    L.append(s); sys.stdout.write(s + '\n')

BACKUP_DIR = os.path.join(ROOT, '备份')
def excluded(path):
    p = path.replace('/', os.sep)
    if os.path.abspath(p).startswith(os.path.abspath(BACKUP_DIR)): return True
    if os.path.basename(p).startswith('.bak') or '.bak' in os.path.basename(p): return True
    return False

def comment_mask(text):
    """返回 (clean, mask)：mask[i]=True 表示该字符位于注释中。
    处理 JS 的 // /* */ 与 HTML 的 <!-- -->。"""
    n = len(text); clean = []; mask = []
    i = 0; block = False; htmlc = False
    while i < n:
        c = text[i]; nx = text[i+1] if i+1 < n else ''
        if htmlc:
            if c == '\n': clean.append('\n'); mask.append(False); i += 1; continue
            if c == '-' and nx == '-' and i+2 < n and text[i+2] == '>':
                htmlc = False; clean.append(' '); mask.append(True); clean.append(' '); mask.append(True); clean.append(' '); mask.append(True); i += 3; continue
            clean.append(' '); mask.append(True); i += 1; continue
        if block:
            if c == '\n': clean.append('\n'); mask.append(False); i += 1; continue
            if c == '*' and nx == '/':
                block = False; clean.append(' '); mask.append(True); clean.append(' '); mask.append(True); i += 2; continue
            clean.append(' '); mask.append(True); i += 1; continue
        if c == '<' and nx == '!':
            # 可能是 <!--
            if text[i:i+4] == '<!--':
                htmlc = True; clean += [' ',' ',' ',' ']; mask += [True,True,True,True]; i += 4; continue
        if c == '/' and nx == '/':
            j = i
            while j < n and text[j] != '\n':
                clean.append(' '); mask.append(True); j += 1
            i = j; continue
        if c == '/' and nx == '*':
            block = True; clean.append(' '); mask.append(True); clean.append(' '); mask.append(True); i += 2; continue
        if c == '\n':
            clean.append('\n'); mask.append(False); i += 1; continue
        clean.append(c); mask.append(False); i += 1
    return ''.join(clean), mask

# ===================== S1 =====================
log('='*70); log('S1  静态扫描(去注释判定)：个人资料.html?user= / 个人中心.html?user='); log('='*70)
targets = ['个人资料.html?user=', '个人中心.html?user=']
hits = []; line_offsets = []
for base, dirs, files in os.walk(ROOT):
    if os.path.abspath(base).startswith(os.path.abspath(BACKUP_DIR)): continue
    for f in files:
        if f.startswith('.bak'): continue
        if f.lower().endswith(('.html', '.js')):
            full = os.path.join(base, f)
            if excluded(full): continue
            try:
                with io.open(full, 'r', encoding='utf-8', errors='replace') as fh:
                    raw = fh.read()
            except Exception as e:
                log('  [读失败] %s : %s' % (full, e)); continue
            clean, mask = comment_mask(raw)
            # 行偏移
            offs = [0]
            for ch in raw:
                if ch == '\n': offs.append(offs[-1] + 1)
            # 在 clean 中找目标
            for t in targets:
                start = 0
                while True:
                    idx = clean.find(t, start)
                    if idx == -1: break
                    start = idx + len(t)
                    # 原始文件中的对应偏移（clean 与原文字符一一对应）
                    pos = idx
                    if pos < len(mask) and mask[pos]:
                        kind = '注释'
                    else:
                        kind = '代码路径'
                    # 行号
                    ln = 1
                    for o in offs:
                        if o <= pos: ln = offs.index(o) + 1
                        else: break
                    # 取原文行
                    eol = raw.find('\n', pos); sol = raw.rfind('\n', 0, pos)
                    line_txt = raw[sol+1:eol if eol!=-1 else len(raw)].strip()
                    hits.append((full, ln, t, kind))
                    log('  %s:%d  [%s] %s' % (full.replace(ROOT,'')[1:], ln, kind, t))
                    log('       原文: %s' % line_txt[:170])
code_center = [h for h in hits if h[2]=='个人中心.html?user=' and h[3]=='代码路径']
code_profile = [h for h in hits if h[2]=='个人资料.html?user=' and h[3]=='代码路径']
log('')
log('  [S1] 个人资料.html?user= 代码路径=%d 注释=%d' % (
    len([h for h in hits if h[2]=='个人资料.html?user=' and h[3]=='代码路径']),
    len([h for h in hits if h[2]=='个人资料.html?user=' and h[3]=='注释'])))
log('  [S1] 个人中心.html?user= 代码路径=%d 注释=%d' % (
    len(code_center), len([h for h in hits if h[2]=='个人中心.html?user=' and h[3]=='注释'])))
S1_PASS = (len(code_center) == 0)
log('  [S1 %s] %s' % ('PASS' if S1_PASS else 'FAIL',
    '无代码路径指向 个人中心.html?user=' if S1_PASS else '存在指向 个人中心.html?user= 的代码路径!'))

# ===================== S3 =====================
log(''); log('='*70); log('S3  目标文件存在性'); log('='*70)
target_files = ['个人资料.html','动态.html','私聊.html','登录.html','我的动态.html','学习工作台.html','个人中心.html','朋友圈.html','社区.html']
S3_PASS = True
for tf in target_files:
    ok = os.path.isfile(os.path.join(ROOT, tf))
    if not ok: S3_PASS = False
    log('  %-14s %s' % (tf, 'EXISTS' if ok else 'MISSING <<< FAIL'))

# ===================== S5 =====================
log(''); log('='*70); log('S5  行尾统计 (CR==LF 且 CR>0)'); log('='*70)
s5_files = ['assets/xt-profile.js','assets/api.js','assets/chat-local.js','assets/xt-moments.js','动态.html','好友申请.html']
S5_PASS = True
for rel in s5_files:
    p = os.path.join(ROOT, rel)
    try:
        with io.open(p, 'rb') as fh: data = fh.read()
        cr = data.count(b'\r'); lf = data.count(b'\n')
        ok = (cr==lf and cr>0); S5_PASS = S5_PASS and ok
        log('  %-26s CR=%d LF=%d %s' % (rel, cr, lf, 'OK' if ok else 'FAIL <<<'))
    except Exception as e:
        S5_PASS = False; log('  %-26s 读失败 %s' % (rel, e))

# ===================== S6 =====================
log(''); log('='*70); log('S6  ES2017 禁用词扫描 (xt-profile.js 去注释后)'); log('='*70)
S6_TOKENS = [(r'\?\.','?.'),(r'\?\?','??'),(r'=>','=>'),(r'`','`'),
             (r'\blet\b','let'),(r'\bconst\b','const'),(r'Object\.fromEntries','Object.fromEntries'),
             (r'\.at\(','.at('),(r'catch\s*\{','catch{')]
p = os.path.join(ROOT, 'assets/xt-profile.js')
with io.open(p, 'r', encoding='utf-8', errors='replace') as fh: raw = fh.read()
clean, mask = comment_mask(raw)
clines = clean.split('\n')
s6_hits = []
for ln, cl in enumerate(clines, 1):
    for pat, name in S6_TOKENS:
        for m in re.finditer(pat, cl):
            s6_hits.append((ln, name, cl.strip()[:140]))
if s6_hits:
    log('  [S6 命中] 去注释后含禁用词：')
    for ln, name, cl in s6_hits:
        log('    L%d  %s : %s' % (ln, name, cl))
else:
    log('  [S6 PASS] 去注释后无 ES2017 禁用词')

log(''); log('='*70)
log('S1 PASS=%s  S3 PASS=%s  S5 PASS=%s  S6 hits=%d' % (S1_PASS, S3_PASS, S5_PASS, len(s6_hits)))
log('='*70)
with io.open(OUT, 'w', encoding='utf-8') as fh: fh.write('\n'.join(L))
print('STATIC DONE')
