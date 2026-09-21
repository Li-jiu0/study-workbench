# -*- coding: utf-8 -*-
"""R87 收口：真实落盘状态盘点（写交接文档用）。只看不改。"""
import io, os, re, time, collections, glob

ROOT = r'D:\下载的文件\学习工作台'
out = []


def rd(p):
    return io.open(os.path.join(ROOT, p), 'rb').read()


def txt(p):
    return rd(p).decode('utf-8', 'ignore')


# ---------- A) T05 准备阶段交付物是否存在 ----------
out.append('=== A) T05 交付物/产物的存在性 ===')
probe = {
    'tools/r87_stamp_apply.py': '交付物1 刷戳脚本',
    'tools/deploy_update_20260918r87.py': '交付物2 部署脚本',
    'tools/bump_versions_safe.py': '应用版本同步脚本(已重写)',
    'tools/qa/check_version_consistency.py': '一致性检查脚本',
    'web/static/apk/.gitkeep': 'APK 目录占位',
    'web/static/apk/README.md': 'APK 目录说明',
    'assets/ai-settings.js.bak-pre-r87-20260918': 'T03 备份',
    'assets/ai-settings.html.bak-pre-r87-20260918': 'T03 备份',
    'assets/ai-service.js.bak-pre-r87-20260918': 'T02 备份',
    'assets/xt-aiusage.js.bak-pre-r87-20260918': 'T04 备份',
    'assets/ai-page.js.bak-pre-r87-20260918': 'T04 备份',
    'assets/ai-config.js.bak-pre-r87-20260918': 'T01 备份',
    'assets/xt-update.js.bak-pre-r87-20260918': 'T05 备份',
}
for f, desc in probe.items():
    p = os.path.join(ROOT, f.replace('/', os.sep))
    ok = os.path.exists(p)
    sz = os.path.getsize(p) if ok else 0
    out.append('  %-52s %-22s %s' % (f, desc, ('存在 %d B' % sz) if ok else '★不存在'))

# ---------- B) 版本号四处一致性 ----------
out.append('')
out.append('=== B) 版本号真源各处取值 ===')
vj = txt('server/routers/version.json')
for k in ['version', 'versionCode', 'apkFileName']:
    m = re.search(r'"' + k + r'"\s*:\s*"?([^",\n]+)"?', vj)
    out.append('  version.json  %-14s = %s' % (k, m.group(1).strip() if m else '?'))
man = txt('android/AndroidManifest.xml')
for k in ['android:versionName', 'android:versionCode']:
    m = re.search(re.escape(k) + r'="([^"]+)"', man)
    out.append('  AndroidManifest  %-12s = %s' % (k, m.group(1) if m else '?'))
xu = txt('assets/xt-update.js')
m = re.search(r"CURRENT_VERSION\s*=\s*'([^']*)'", xu)
out.append("  xt-update.js  CURRENT_VERSION = %s" % (m.group(1) if m else '?'))
apk = os.path.join(ROOT, 'web', 'static', 'apk')
out.append('  web/static/apk 实际文件 = %s' % (sorted(os.listdir(apk)) if os.path.isdir(apk) else '目录不存在'))

# ---------- C) 版本戳是否已刷 ----------
out.append('')
out.append('=== C) 版本戳现状（属性锚定统计）===')
page = collections.OrderedDict()
for n in sorted(os.listdir(ROOT)):
    if not n.endswith('.html') or '.bak' in n:
        continue
    t = txt(n)
    for mm in re.finditer(r'(?:src|href)\s*=\s*["\']assets/([A-Za-z0-9_.\-]+\.(?:js|css))(\?v=[0-9A-Za-z]+)?["\']', t):
        page.setdefault(mm.group(1), {}).setdefault(mm.group(2) or 'BARE', []).append(n)
targets = ['ai-cap-registry.js', 'ai-cap-image.js', 'ai-cap-vision.js', 'ai-cap-audio.js',
           'ai-cap-embed.js', 'ai-cap-translate.js', 'ai-cap-video.js', 'ai-cap-3d.js',
           'ai-config.js', 'ai-service.js', 'ai-settings.js', 'ai-page.js',
           'xt-aiusage.js', 'xt-update.js']
for k in targets:
    out.append('  %-24s %s' % (k, dict((kk, len(vv)) for kk, vv in page.get(k, {}).items()) or '(无引用)'))
vals = collections.Counter()
for n in os.listdir(ROOT):
    if not n.endswith('.html') or '.bak' in n:
        continue
    for mm in re.finditer(r'\?v=([0-9A-Za-z]+)', txt(n)):
        vals[mm.group(1)] += 1
out.append('  全站戳值分布: %s' % dict(vals.most_common()))

# ---------- D) 本批是否动过 server/*.py ----------
out.append('')
out.append('=== D) 本批是否改过 server/*.py（mtime >= 2026-09-18 15:00）===')
T0 = time.mktime(time.strptime('2026-09-18 15:00:00', '%Y-%m-%d %H:%M:%S'))
hits = []
for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, 'server')):
    dirnames[:] = [d for d in dirnames if d not in {'__pycache__', '.venv', 'backups'}]
    for n in filenames:
        p = os.path.join(dirpath, n)
        try:
            if os.stat(p).st_mtime >= T0:
                hits.append((os.path.relpath(p, ROOT), os.path.getsize(p)))
        except OSError:
            pass
out.append('  命中 %d 个：%s' % (len(hits), hits if hits else '(无)'))

# ---------- E) T05 留下的探测/输出文件 ----------
out.append('')
out.append('=== E) tools/ 下本批新增的产物（mtime >= 15:00）===')
tl = os.path.join(ROOT, 'tools')
arts = []
for n in sorted(os.listdir(tl)):
    p = os.path.join(tl, n)
    if os.path.isfile(p) and os.stat(p).st_mtime >= T0:
        arts.append((time.strftime('%H:%M:%S', time.localtime(os.stat(p).st_mtime)), n, os.path.getsize(p)))
for t, n, sz in sorted(arts):
    out.append('  %s  %-46s %d B' % (t, n, sz))

# ---------- F) 关键符号签名核验（不看口述，看文件） ----------
out.append('')
out.append('=== F) 关键符号签名核验 ===')
sig = {
    'assets/ai-config.js': ['ark-seedance-1-0-pro', 'ark-seed3d-2-0', '即将下线', 'three_d', 'video'],
    'assets/ai-cap-video.js': ['probeNoAuto', 'CAP.probe', 'probeCostly'],
    'assets/ai-cap-3d.js': ['probeNoAuto', 'CAP.probe', 'probeCostly'],
    'assets/ai-cap-vision.js': ['PROBE_PNG', 'textFallback'],
    'assets/ai-cap-translate.js': ['responsesUrl'],
    'assets/ai-service.js': ['aiHealthCheckBatch', 'unsupported_probe', 'skipped', 'XT_KIND_BY_TYPE', 'model3d'],
    'assets/ai-settings.js': ['BUILTIN_CATS', 'RESERVED_KEYS', 'FAMILY_ORDER', 'migrateCatSchema',
                              'soleCategoryOfModel', 'hideUnavailable', 'lastSort', 'setSortCat',
                              'xt:health-changed', 'usableIds', 'visibleModels', 'probeNoAuto',
                              'aiHealthCheckBatch', '即将下线'],
    'assets/ai-page.js': ['xt:health-changed', 'isHiddenByHealth', 'hideUnavailable'],
    'assets/xt-aiusage.js': ['api/ai/usage', 'sortRows', 'displayNameOf', 'AbortController', 'clampPct'],
    'assets/xt-update.js': ['CURRENT_VERSION', 'reasonCode'],
    'ai-settings.html': ['setUsageRoot', 'setSortCat', 'setSortCatInner', 'ai-cap-video.js', 'ai-cap-3d.js', 'ai-cap-translate.js'],
}
for f, keys in sig.items():
    t = txt(f)
    out.append('  %s' % f)
    out.append('    ' + ' | '.join('%s=%d' % (k, t.count(k)) for k in keys))

# ---------- G) 旧符号是否已清零 ----------
out.append('')
out.append('=== G) 应清零符号 ===')
for f, keys in {'assets/ai-cap-video.js': ['probeCostly'], 'assets/ai-cap-3d.js': ['probeCostly'],
                'assets/ai-service.js': ['probeCostly']}.items():
    t = txt(f)
    out.append('  %s: %s' % (f, ' | '.join('%s=%d' % (k, t.count(k)) for k in keys)))

io.open(os.path.join(ROOT, 'tools', '_r87_handoff_probe.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
