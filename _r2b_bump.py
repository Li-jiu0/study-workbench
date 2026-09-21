# -*- coding: utf-8 -*-
"""R2B 发版：v1.32 → v1.33 四处版本同步 + APK 资源白名单补齐
 ① server/routers/version.json（version/versionCode/apkFileName/notes/changelog/publishedAt）
 ② android/AndroidManifest.xml（versionName / versionCode）
 ③ assets/xt-update.js（CURRENT_VERSION）
 ④ android/build_apk.py 的 REQUIRED_ASSETS 补 img-viewer.js / xt-update.js（防「修好但包里没有」）
"""
import io, os, re, json, time

ROOT = r'D:\下载的文件\学习工作台'
OLD_V, NEW_V = '1.32', '1.33'
OLD_C, NEW_C = 33, 34
OLD_APK, NEW_APK = '星途-1.32.apk', '星途-1.33.apk'

NOTES = [
    "新增：图片查看支持双指捏合放大缩小、拖动浏览，并可一键保存到相册",
    "新增：用户协议与隐私政策独立页面（正式法律文本），登录时可查看",
    "新增：数据管理页面 —— 存储空间占用、分类清理、备份与检测更新集中在一处",
    "完善：「关于」页面内容（项目定位、核心功能、协议入口、问题反馈与更新入口）",
    "修复：实时位置共享改为双向可见（双方都能看到对方），群聊多人共享同样修复，并修复定位偶发漂移到 (0,0)",
    "修复：3D 模型生成完成后提示「没有返回文件地址」、无法下载模型的问题",
    "修复：App 退到后台或进程被系统关闭后，收到新消息不弹横幅通知的问题",
    "优化：设置项全面核对 —— 移除 6 个从未生效的开关，学习提醒改为全站生效（需 App 保持打开）",
    "优化：AI「流式输出」「上下文记忆」开关真实生效，关闭后按关闭行为执行",
    "移除：不再可用的 3D 模型 Hyper3D-Gen2（影眸）"
]

log = []


def fix_json():
    p = os.path.join(ROOT, 'server', 'routers', 'version.json')
    b = open(p, 'rb').read()
    t = b.decode('utf-8')
    j = json.loads(t)
    chlog = j.get('changelog') or []
    # 幂等：若已 bump 过则跳过
    if j.get('version') == NEW_V:
        log.append('version.json 已是 %s，跳过' % NEW_V)
        return
    new_entry = {"version": "v" + NEW_V, "date": time.strftime('%Y-%m-%d'), "notes": NOTES}
    chlog = [new_entry] + chlog
    out = dict(j)
    out['version'] = NEW_V
    out['versionCode'] = NEW_C
    out['apkFileName'] = NEW_APK
    out['notes'] = NOTES
    out['changelog'] = chlog
    out['publishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S+08:00')
    new_t = json.dumps(out, ensure_ascii=False, indent=2)
    if not new_t.endswith('\n'):
        new_t += '\n'
    open(p, 'wb').write(new_t.encode('utf-8'))
    log.append('version.json: %s -> %s (code %d -> %d, 条目 %d -> %d)' % (OLD_V, NEW_V, OLD_C, NEW_C, len(j.get('changelog') or []), len(chlog)))


def fix_manifest():
    p = os.path.join(ROOT, 'android', 'AndroidManifest.xml')
    b = open(p, 'rb').read()
    t = b.decode('utf-8')
    before = t
    t = t.replace('android:versionCode="%d"' % OLD_C, 'android:versionCode="%d"' % NEW_C)
    t = t.replace('android:versionName="%s"' % OLD_V, 'android:versionName="%s"' % NEW_V)
    if t != before:
        open(p, 'wb').write(t.encode('utf-8'))
    log.append('AndroidManifest: versionCode=%d versionName=%s' % (NEW_C, NEW_V))


def fix_xtupdate():
    p = os.path.join(ROOT, 'assets', 'xt-update.js')
    b = open(p, 'rb').read()
    t = b.decode('utf-8')
    t2 = t.replace("var CURRENT_VERSION = '%s';" % OLD_V, "var CURRENT_VERSION = '%s';" % NEW_V)
    if t2 != t:
        open(p, 'wb').write(t2.encode('utf-8'))
    log.append('xt-update.js CURRENT_VERSION -> %s (%d 处)' % (NEW_V, t.count("var CURRENT_VERSION = '%s';" % OLD_V)))


def fix_build_apk():
    p = os.path.join(ROOT, 'android', 'build_apk.py')
    t = io.open(p, encoding='utf-8').read()
    if '"img-viewer.js"' in t:
        log.append('build_apk.py 白名单已含 img-viewer.js，跳过')
        return
    anchor = '    # --- R70 新增：联网能力必需（缺 api.js = 所有在线功能变静态壳） ---'
    add = ('    # --- R2B（2026-09-20 v1.33）新增：图片查看器与版本检测 ---\n'
           '    #   · img-viewer.js 缺失 → 图片无法捏合缩放/保存到相册（静默降级为无手势）\n'
           '    #   · xt-update.js 缺失 → 关于页/数据管理页的「检测更新」不可用\n'
           '    "img-viewer.js",\n'
           '    "xt-update.js",\n')
    if anchor not in t:
        raise SystemExit('锚点未找到，需人工处理 build_apk.py')
    t = t.replace(anchor, add + anchor, 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(t)
    log.append('build_apk.py REQUIRED_ASSETS 已补 img-viewer.js + xt-update.js')


for fn in (fix_json, fix_manifest, fix_xtupdate, fix_build_apk):
    try:
        fn()
    except Exception as e:
        log.append('★ %s 失败: %r' % (fn.__name__, e))

# 一致性自检
j = json.loads(io.open(os.path.join(ROOT, 'server', 'routers', 'version.json'), encoding='utf-8').read())
mf = io.open(os.path.join(ROOT, 'android', 'AndroidManifest.xml'), encoding='utf-8', errors='replace').read()
xu = io.open(os.path.join(ROOT, 'assets', 'xt-update.js'), encoding='utf-8').read()
log.append('')
log.append('--- 一致性自检 ---')
log.append('version.json  version=%s versionCode=%s apkFileName=%s' % (j['version'], j['versionCode'], j['apkFileName']))
log.append('Manifest      %s / %s' % (re.search(r'versionName="([^"]+)"', mf).group(1), re.search(r'versionCode="(\d+)"', mf).group(1)))
log.append('xt-update.js  %s' % re.search(r"CURRENT_VERSION = '([^']+)'", xu).group(1))
ok = (j['version'] == NEW_V and str(j['versionCode']) == str(NEW_C)
      and ('versionName="%s"' % NEW_V) in mf and ('versionCode="%d"' % NEW_C) in mf
      and ("CURRENT_VERSION = '%s'" % NEW_V) in xu)
log.append('四处一致: %s' % ('PASS' if ok else 'FAIL'))
log.append('notes 条数 = %d' % len(j['notes']))
log.append('changelog 首项 = %s' % json.dumps(j['changelog'][0], ensure_ascii=False)[:160])

out = '\n'.join(log)
io.open(os.path.join(ROOT, '_r2b_bump_out.txt'), 'w', encoding='utf-8').write(out + '\n')
print(out)
