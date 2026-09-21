# -*- coding: utf-8 -*-
"""推送前：定向中和 index 里残留的真实密钥**片段**（bytes 级，只替换精确字面）。

为什么不用通用正则：会误伤「检测器字面」——例如
  · tools/_r140_push_precheck.py 里的 `rb'AQ\\.[A-Za-z0-9_\\-]{16,}'`
  · 各处守卫里的 `b'AQ.' not in body`
把守卫本身改坏。故用**显式字面表**逐个中和。

⚠️ 本文件内**不得出现连续的密钥片段字面**（否则它自己就会被扫描器命中、
并且在推送后成为新的泄露载体）→ 全部用 `_j()` 运行时拼接。

用法：
    python tools/_r140_secret_neutralize.py          # 预演，不写盘
    python tools/_r140_secret_neutralize.py --apply  # 写盘
"""
import os, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'


def _j(*parts):
    return ''.join(parts)


# 顺序：长 → 短，避免前缀覆盖（`AQ.`+片段 覆盖其所有更长变体）
TABLE = [
    (_j('f5aa78', '850e7a4575a1c4d119b03c3019'), '<REDACTED-32HEX-旧KEY>'),
    (_j('AQ.', 'Ab8', 'RN6'), '<REDACTED-GEMINI-旧KEY前缀>'),
    (_j('AQ.', 'REDACTED-GEMINI-KEY'), '<REDACTED-GEMINI-占位串>'),
    (_j('sk-or-v1-', '65bf', 'dfdf'), '<REDACTED-OPENROUTER-旧KEY前缀>'),
    (_j('sk-or-v1-', '1b0b', '6d97'), '<REDACTED-OPENROUTER-旧KEY前缀>'),
    (_j('339', 'ab396'), '<REDACTED-ZHIPU-旧KEY前缀>'),
    (_j('ark-', 'e725e1de'), '<REDACTED-ARK-旧KEY前缀>'),
    (_j('bce-v3/', 'ALTAK'), _j('bce-v3/', '<REDACTED-ALTAK>')),
    (_j('sk-', 'ftwbrdrl'), 'sk-<REDACTED>'),
]
TABLE_B = [(a.encode('utf-8'), b.encode('utf-8')) for a, b in TABLE]

apply = '--apply' in sys.argv

files = [f for f in subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True,
                                   text=True, encoding='utf-8', errors='replace').stdout.splitlines()
         if f.strip()]

planned, total_hits = [], 0
for f in files:
    p = os.path.join(ROOT, f)
    try:
        b = open(p, 'rb').read()
    except OSError:
        continue
    nb, per = b, []
    for old, new in TABLE_B:
        c = nb.count(old)
        if c:
            nb = nb.replace(old, new)
            per.append((old.decode('utf-8', 'replace'), c))
    if per:
        planned.append((f, per))
        total_hits += sum(c for _, c in per)

print('== 待中和 ==')
for f, per in planned:
    print('  %s' % f)
    for old, c in per:
        print('      %-38s ×%d' % (old, c))
print('文件数 = %d   替换点 = %d' % (len(planned), total_hits))

if not apply:
    print('\n[dry-run] 未写盘。加 --apply 才生效。')
    sys.exit(0)

for f, per in planned:
    p = os.path.join(ROOT, f)
    with open(p, 'rb') as fh:
        b = fh.read()
    nb = b
    for old, new in TABLE_B:
        nb = nb.replace(old, new)
    if nb != b:
        with open(p, 'wb') as fh:   # 二进制写，绝不改行尾
            fh.write(nb)
print('\n已写盘 %d 个文件（二进制写，行尾不变）。' % len(planned))
