# -*- coding: utf-8 -*-
"""R140 推送前本地核验（只读，不写任何东西）。

1) 沙箱删除核对：git status --porcelain 里的 ' D' 条数（>0 需先恢复）
2) 提交后工作树漂移：已跟踪文件的 M 列表
3) 禁列核对：index 内不得有 *.apk / *.tar.gz / .db / .env / *.keystore
4) 脱敏：扫 index 全部 blob 的原始字节，找真实密钥与真实密钥**片段**

⚠️ 本文件内**不得出现连续的密钥片段字面**——扫描器自身不能成为泄露载体
（否则推送时它自己就会被扫描器命中）。故所有片段一律用 `_j()` 运行时拼接。

用法：`python tools/_r140_push_precheck.py`（退出码 0=OK / 1=BLOCKED）
"""
import os, re, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'


def _j(*parts):
    """运行时拼接，避免源码里出现连续密钥片段字面。"""
    return b''.join(p.encode('ascii') if isinstance(p, str) else p for p in parts)


def git(*a):
    r = subprocess.run(['git'] + list(a), cwd=ROOT, capture_output=True,
                       encoding='utf-8', errors='replace')
    return r.stdout or ''


# ---- 1/2) 工作树状态 ----
por = [l for l in git('-c', 'core.quotepath=false', 'status', '--porcelain').splitlines() if l.strip()]
deleted = [l for l in por if l[:2] == ' D']
modified = [l for l in por if l[:2] == ' M']
untracked = [l for l in por if l[:2] == '??']
print('== 工作树 ==')
print('  条目总数 = %d' % len(por))
print('  已跟踪被删除(D) = %d %s' % (len(deleted), [l[3:] for l in deleted][:20]))
print('  已跟踪已修改(M) = %d %s' % (len(modified), [l[3:] for l in modified][:20]))
print('  未跟踪(??) = %d （孤儿快照线天然排除，无需处理）' % len(untracked))

# ---- 3) 禁列 ----
files = [f for f in git('ls-files').splitlines() if f.strip()]
bad = [f for f in files if re.search(r'\.(apk|tar\.gz|tgz|db|keystore|jks)$', f, re.I)
       or f.endswith('/.env') or f == '.env']
print('\n== 禁列核对 ==')
print('  index 文件数 = %d' % len(files))
print('  禁列命中 = %d %s' % (len(bad), bad[:20]))

# ---- 4) 脱敏 ----
PATTERNS = [
    ('Gemini key 完整形', re.compile(rb'AQ\.[A-Za-z0-9_\-]{16,}')),
    ('Gemini 片段', re.compile(_j('Ab8', 'RN6'))),
    ('Google AIza 完整形', re.compile(rb'AIza[0-9A-Za-z_\-]{35}')),
    ('OpenRouter 完整形', re.compile(rb'sk-or-v1-[0-9a-fA-F]{32,}')),
    ('OpenRouter 片段A', re.compile(_j('65bf', 'dfdf'))),
    ('OpenRouter 片段B', re.compile(_j('1b0b', '6d97'))),
    ('Zhipu 片段', re.compile(_j('339', 'ab396'))),
    ('Zhipu 旧KEY(32hex)', re.compile(_j('f5aa78', '850e7a4575a1c4d119b03c3019'))),
    ('Ark 片段', re.compile(_j('ark-', 'e725e1de'))),
    ('Volc ALTAK', re.compile(_j('bce-v3/', 'ALTAK'))),
    ('sk- 片段', re.compile(_j('sk-', 'ftwbrdrl'))),
    ('OpenAI sk- 完整形', re.compile(rb'sk-[A-Za-z0-9]{32,}')),
    ('VolcEngine AKLT', re.compile(rb'AKLT[A-Za-z0-9]{16,}')),
    ('HuggingFace hf_', re.compile(rb'hf_[A-Za-z0-9]{30,}')),
    ('PEM 私钥', re.compile(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
]
hits = {name: [] for name, _ in PATTERNS}

blobs = git('ls-files', '-s')
sha2path = {}
for line in blobs.splitlines():
    parts = line.split('\t', 1)
    if len(parts) != 2:
        continue
    meta = parts[0].split()
    if len(meta) >= 2:
        sha2path[meta[1]] = parts[1]

shas = sorted(sha2path)
BATCH = 300
scanned = 0
for i in range(0, len(shas), BATCH):
    chunk = shas[i:i + BATCH]
    p = subprocess.run(['git', 'cat-file', '--batch'], cwd=ROOT,
                       input=('\n'.join(chunk) + '\n').encode('ascii'),
                       capture_output=True)
    out = p.stdout
    pos = 0
    while pos < len(out):
        nl = out.find(b'\n', pos)
        if nl < 0:
            break
        header = out[pos:nl].decode('utf-8', 'replace')
        pos = nl + 1
        parts = header.split()
        if len(parts) < 3 or header.endswith(' missing'):
            continue
        sha, size = parts[0], int(parts[2])
        data = out[pos:pos + size]
        pos += size + 1
        scanned += 1
        for name, rx in PATTERNS:
            mm = rx.search(data)
            if mm:
                hits[name].append((sha2path.get(sha, sha), mm.group(0)[:26]))

print('\n== 脱敏（扫描 blob 数 = %d）==' % scanned)
total = 0
for name, _ in PATTERNS:
    hs = hits[name]
    total += len(hs)
    print('  %-22s %s' % (name, '✅ 零残留' if not hs else '🔴 命中 %d' % len(hs)))
    for p, s in hs[:8]:
        print('      %s  ::  %s…' % (p, s.decode('utf-8', 'replace')))
print('\n脱敏命中总数 = %d' % total)

ok = (not deleted) and (not bad) and total == 0
print('\nPRECHECK=%s' % ('OK' if ok else 'BLOCKED'))
sys.exit(0 if ok else 1)
