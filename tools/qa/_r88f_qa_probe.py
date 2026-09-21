import os, glob
ROOT = r"D:\下载的文件\学习工作台"
qa = os.path.join(ROOT, 'tools', 'qa')
print("==== tools/qa 下 arkquota / r88f 相关 ====")
found = []
for p in sorted(glob.glob(os.path.join(qa, '*arkquota*'))) + sorted(glob.glob(os.path.join(qa, '*r88f*'))):
    found.append(os.path.basename(p))
    print("  ", os.path.basename(p), os.path.getsize(p))
if not found:
    print("   (none)")

print("\n==== server 文件 ====")
s = os.path.join(ROOT, 'server')
for f in ['routers/ai.py', 'quota_ledger.py', 'rate_limit.py', 'config.py']:
    p = os.path.join(s, f.replace('/', os.sep))
    print("  %-22s %s" % (f, os.path.getsize(p) if os.path.exists(p) else 'MISSING'))

print("\n==== 备份 *.bak-r88f-pre ====")
bks = glob.glob(os.path.join(s, '**', '*.bak-r88f-pre'), recursive=True)
if bks:
    for p in bks:
        print("  ", os.path.relpath(p, ROOT), os.path.getsize(p))
else:
    print("   (none)")

print("\n==== docs/r88f 报告 ====")
for p in glob.glob(os.path.join(ROOT, 'docs', '*r88f*')):
    print("  ", os.path.relpath(p, ROOT), os.path.getsize(p))

print("\n==== 顶层 tools 下 arkquota ====")
for p in glob.glob(os.path.join(ROOT, 'tools', '*arkquota*')):
    print("  ", os.path.relpath(p, ROOT), os.path.getsize(p))
