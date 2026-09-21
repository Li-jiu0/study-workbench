# -*- coding: utf-8 -*-
import io, re, os, collections

ROOT = r'D:\下载的文件\学习工作台'
out = []

# ---- 1) 本地版本戳分布（属性锚定，§8.1 写法）----
page = collections.OrderedDict()
for n in sorted(os.listdir(ROOT)):
    if not n.endswith('.html') or '.bak' in n:
        continue
    t = io.open(os.path.join(ROOT, n), 'rb').read().decode('utf-8', 'ignore')
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']assets/([A-Za-z0-9_.\-]+\.(?:js|css))(\?v=[0-9A-Za-z]+)?["\']', t):
        page.setdefault(m.group(1), {}).setdefault(m.group(2) or 'BARE', []).append(n)

out.append('=== 本地 assets 引用戳分布（HTML 数=%d）===' % len([x for x in os.listdir(ROOT) if x.endswith('.html') and '.bak' not in x]))
for k in sorted(page):
    out.append('  %-30s %s' % (k, {kk: len(vv) for kk, vv in page[k].items()}))

# ---- 2) 全站出现过的戳值 ----
vals = collections.Counter()
for n in os.listdir(ROOT):
    if not n.endswith('.html') or '.bak' in n:
        continue
    t = io.open(os.path.join(ROOT, n), 'rb').read().decode('utf-8', 'ignore')
    for m in re.finditer(r'\?v=([0-9A-Za-z]+)', t):
        vals[m.group(1)] += 1
out.append('')
out.append('=== 本地出现过的戳值（值 -> 次数）===')
for k, v in vals.most_common():
    out.append('  %s -> %d' % (k, v))

# ---- 3) 部署凭据可用性（只报「有没有」，绝不打印明文）----
out.append('')
out.append('=== 部署凭据可用性 ===')
out.append('  env SW_HOST set = %s' % ('SW_HOST' in os.environ))
out.append('  env SW_PASS set = %s' % ('SW_PASS' in os.environ))
p = os.path.join(ROOT, 'upload_v23.ps1')
out.append('  upload_v23.ps1 exists = %s' % os.path.exists(p))
if os.path.exists(p):
    src = io.open(p, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
    if m:
        out.append('  可正则提取 PASS/HOST = True；PASS 长度=%d，HOST=%s' % (len(m.group(1)), m.group(2)))
    else:
        out.append('  正则可提取 PASS/HOST = False（需另找）')

# ---- 4) 部署工具是否存在 ----
out.append('')
out.append('=== 工具存在性 ===')
for f in ['tools/plink.exe', 'tools/pscp.exe', 'tools/ssh_run.py', 'tools/verifier/package.json',
          'tools/qa/escheck_es2017.js', 'tools/qa/page_check.js', 'tools/audit_model_relations.py']:
    out.append('  %-38s %s' % (f, os.path.exists(os.path.join(ROOT, f))))

# ---- 5) 现存 deploy 脚本（找最新一个作范式）----
out.append('')
out.append('=== 既有 deploy_update_*.py ===')
dl = sorted([x for x in os.listdir(os.path.join(ROOT, 'tools')) if x.startswith('deploy_update_')])
out.append('  count=%d' % len(dl))
for x in dl[-8:]:
    out.append('  %s' % x)

# ---- 6) bump/version 相关脚本 ----
out.append('')
out.append('=== bump_versions_safe.py 的替换正则（看是否属性锚定）===')
bp = os.path.join(ROOT, 'tools/bump_versions_safe.py')
if os.path.exists(bp):
    s = io.open(bp, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r're\.compile\([^\n]{0,200}', s):
        out.append('  ' + m.group(0)[:200])
    out.append('  -- 是否含 src|href 锚定: %s' % ('src|href' in s or "src=" in s))
    out.append('  -- KEEP_OLD 豁免名单存在: %s' % ('KEEP_OLD' in s))

io.open(os.path.join(ROOT, 'tools/_r87_stamp_probe.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
