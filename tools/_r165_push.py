# -*- coding: utf-8 -*-
"""R165 推送 GitHub（1.43 批次）（走代理）—— 增量提交线（不做全量孤儿快照）。

机制（沿用 _r150_push.py 验证过的做法）：
  · 新提交的父提交 = 远端 main（上一轮已脱敏快照）→ 推送为 fast-forward → 只发增量对象。
  · 本地那条约 87000 条含历史密钥的提交不在祖先链上 → 永不上传。
  · 本地历史线另行提交保留，推送用 commit-tree 合成。

用法：
    scan  → 只预检（选择性 add + 禁列断言 + index 密钥扫描，不提交不推送）
    prep  → 选择性 add → 本地提交 → 合成增量提交 → 代理探测 + ls-remote 预热
    push  → fast-forward 推 main → 独立复核远端 SHA
"""
import os, re, io, json, time, socket, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'

STATE = os.path.join(ROOT, 'tools', '_r165_push_state.json')
COMMIT_MSG = os.path.join(ROOT, 'tools', '_r165_commit_msg.txt')
SNAP_MSG = os.path.join(ROOT, 'tools', '_r165_snapshot_msg.txt')
OUT = os.path.join(ROOT, 'tools', '_r165_push_out.txt')

PAGES = ('AI.html AI模拟面试.html PPT案例拆解.html PPT版式库.html PPT素材库.html ai-settings.html '
         'blog_wechat.html live-location.html mock_exam.html mock_exam_result.html mock_exam_run.html '
         '万能金句库.html 个人中心.html 个人资料.html 企业定向库.html 关于.html 动态空间.html 协议.html '
         '商务礼仪.html 四级经验分享.html 四级词汇.html 地区选择.html 场景话术库.html 好友申请.html '
         '学习工作台.html 学习概括.html 导入题库.html 工具.html 应用白名单.html 我的动态.html 我的文件.html '
         '数据管理.html 日志.html 时政热点.html 更多.html 更新.html 朋友圈发布.html 演示.html 申论刷题.html '
         '登录.html 社区.html 私聊.html 管理员.html 行测.html 行测刷题.html 表达.html 设置.html 赞助.html '
         '错题本.html 面测.html 面试题库.html 英语.html 学途.html').split()

BATCH = PAGES + [
    'assets/chat-local.js',
    'assets/data/listening-ext.json',
    'assets/icon-map.js',
    'assets/voiceplayer.js',
    'assets/xt-aiusage.js',
    'assets/xt-log.js',
    'assets/xt-update.js',
    'server/data/model_quota.json',
    'server/quota_ledger.py',
    'server/routers/ai.py',
    'server/routers/version.json',
    'android/AndroidManifest.xml',
    'android/java/com/study/workbench/MainActivity.java',
    'android/res/values/colors.xml',
    'android/res/values/styles.xml',
    'tools/verifier/package.json',
    'tools/verifier/package-lock.json',
    'tools/_r165_deploy.py',
    'tools/_r165_apk_deploy.py',
    'tools/_r165_probe_live.py',
    'tools/_r165_probe_all.py',
    'tools/_r165_page_diff.py',
    'tools/_r165_push.py',
    'tools/qa/_r164_ctl_layout.js',
]

FORBID = ('.apk', '.apks', '.db', '.sqlite', '.tar.gz', '.bak', '.keystore', '.jks', '.env')

LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s, flush=True)


def git(*a, proxy=None, timeout=180, binary=False):
    cmd = ['git', '-c', 'core.quotepath=false']
    if proxy:
        cmd += ['-c', 'http.proxy=%s' % proxy, '-c', 'https.proxy=%s' % proxy,
                '-c', 'http.version=HTTP/1.1']
    cmd += list(a)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                       text=not binary, encoding=None if binary else 'utf-8',
                       errors=None if binary else 'replace', timeout=timeout)
    if binary:
        return r.returncode, r.stdout, r.stderr
    return r.returncode, (r.stdout or ''), (r.stderr or '')


def probe_proxies():
    """env 端口（取冒号后的端口）→ 7897 → 7890 → 10809 → 1080"""
    cands = []
    for k in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
        v = os.environ.get(k, '')
        if not v:
            continue
        m = re.search(r':(\d{2,5})', v.split('@')[-1])
        if m:
            cands.append(int(m.group(1)))
    cands += [7897, 7890, 10809, 1080]
    seen, live = set(), []
    for p in cands:
        if p in seen:
            continue
        seen.add(p)
        s = socket.socket()
        s.settimeout(0.7)
        try:
            s.connect(('127.0.0.1', p))
            live.append(p)
        except OSError:
            pass
        finally:
            s.close()
    return cands, live


def _j(*parts):
    return ''.join(parts)


def _patterns():
    frag = [
        _j('AQ.', 'Ab8', 'RN6'),
        _j('sk-or-v1-', '65bf', 'dfdf'),
        _j('sk-or-v1-', '1b0b', '6d97'),
        _j('339', 'ab396'),
        _j('ark-', 'e725e1de'),
        _j('bce-v3/', 'ALTAK'),
        _j('sk-', 'ftwbrdrl'),
        _j('f5aa78', '850e7a4575a1c4d119b03c3019'),
    ]
    pats = [re.compile(rb'AIza[0-9A-Za-z_\-]{30,}'),
            re.compile(rb'bsk-[0-9A-Za-z_\-]{20,}'),
            re.compile(rb'sk-[0-9A-Za-z_\-]{20,}'),
            re.compile(rb'sk-or-v1-[0-9a-f]{20,}'),
            re.compile(rb'[0-9a-f]{32}\.[0-9A-Za-z_\-]{16,}')]
    pats += [re.compile(re.escape(f.encode('utf-8'))) for f in frag]
    return pats


stage = sys.argv[1] if len(sys.argv) > 1 else 'prep'

if stage in ('prep', 'push'):
    rc, o, e = git('status', '--porcelain')
    if any(l[:2] == ' D' for l in o.splitlines()):
        log('🔴 有已跟踪文件被删除，先恢复再推')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)

if stage == 'scan':
    missing = [p for p in BATCH if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        log('🔴 清单文件缺失：%s' % missing)
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)
    git('add', '--', *BATCH)
    rc, o, e = git('diff', '--cached', '--name-only')
    staged = [x for x in o.splitlines() if x.strip()]
    extra = [p for p in staged if p not in BATCH]
    gone = [p for p in BATCH if p not in staged]
    log('== staged %d 个 ==' % len(staged))
    if extra or gone:
        log('🔴 staged 与清单不符 extra=%s missing=%s' % (extra, gone))
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)
    bad = [p for p in staged if p.lower().endswith(FORBID) and not p.endswith('.env.example')]
    if bad:
        log('🔴 staged 含禁列：%s' % bad)
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)
    log('  禁列断言 OK')
    pats = _patterns()
    hits = []
    for p in staged:
        rc, blob, e = git('show', ':' + p, binary=True)
        for ln in (blob or b'').splitlines():
            if b'REDACTED' in ln:
                continue
            for rx in pats:
                if rx.search(ln):
                    hits.append((p, rx.pattern.decode('utf-8', 'replace'), ln[:120]))
    log('== index 密钥扫描 ==')
    if hits:
        for p, rx, ln in hits[:40]:
            log('  🔴 %s  %s  %s' % (p, rx, ln))
        log('🔴 命中 %d 处' % len(hits))
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(5)
    log('  零命中（%d 个文件）' % len(staged))
    log('R165_PREPUSH_SCAN_PASS')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(0)

if stage == 'prep':
    missing = [p for p in BATCH if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        log('🔴 清单文件缺失：%s' % missing)
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)
    log('== 本批清单 %d 个文件 ==' % len(BATCH))

    rc, o, e = git('status', '--porcelain', '--', *BATCH)
    pending = [x for x in o.splitlines() if x.strip()]
    if pending:
        rc, o, e = git('add', '--', *BATCH)
        log('  git add rc=%d %s' % (rc, (e or '').strip()[:300]))
        rc, o, e = git('diff', '--cached', '--name-only')
        staged = [x for x in o.splitlines() if x.strip()]
        log('\n== staged (%d) ==' % len(staged))
        for p in staged:
            log('  + ' + p)
        extra = [p for p in staged if p not in BATCH]
        gone = [p for p in BATCH if p not in staged]
        if extra or gone:
            log('🔴 staged 集与清单不符  extra=%s  missing=%s' % (extra, gone))
            io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
            raise SystemExit(2)
    else:
        staged = list(BATCH)
        log('  本批无未提交改动 → 幂等续跑')

    bad = [p for p in staged if p.lower().endswith(FORBID) and not p.endswith('.env.example')]
    if bad:
        log('🔴 staged 含禁列文件：%s' % bad)
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)
    log('  禁列断言 OK（无 .apk/.db/.env/*.bak/.keystore）')

    pats = _patterns()
    hits = []
    for p in staged:
        rc, blob, e = git('show', ':' + p, binary=True)
        if rc != 0:
            log('🔴 读 index 失败：%s' % p)
            raise SystemExit(2)
        blob = blob or b''
        for ln in blob.splitlines():
            if b'REDACTED' in ln:
                continue
            for rx in pats:
                if rx.search(ln):
                    hits.append((p, rx.pattern.decode('utf-8', 'replace'), ln[:120]))
    log('\n== index 密钥扫描 ==')
    if hits:
        for p, rx, ln in hits[:40]:
            log('  🔴 %s  %s  %s' % (p, rx, ln))
        log('🔴 命中 %d 处，终止推送' % len(hits))
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(5)
    log('  零命中（%d 个文件）' % len(staged))

    msg = """发版 1.43（versionCode 44）+ R150~R165：听说训练改版、私聊微信式面板、键盘蓝影修复、表情长按收藏、用量统计接通、日志页与图标批次、数据管理重构

R150 私聊页交互批次（前端 + 原生）：
  · 删除「私聊」标题行；表情/加号面板微信式一体平面，与键盘同空间切换；
    自定义表情长按收藏；原生键盘高度注入 --xt-sakb 与中性底色消除蓝色阴影。
R151 模型设置用量统计：前端请求补登录态（此前被当游客返回空账本）；用量明细可折叠并记忆。
R152/R154/R145 沉浸式安全区：AI 页抽屉、个人资料页顶栏、考试类页头、登录页等
  统一自接 --xt-satop（替代裸 env(safe-area-inset-top)），修复被系统状态栏压住。
R153/R157/R159 日志与图标：全站页面接入 xt-log.js（20260928d）；icon-map 换戳 20260929a；
  日志页筛选行「清空」按钮兜底与页面重构。
R155 数据管理页重构：微信「存储空间」风格总用量 + 分类占用 + 清理操作。
R162~R165 听说训练（assets/voiceplayer.js → 20260929h）：
  · 双 tab（听力精听 / 口语跟读）首屏精简：移除精听/挑战切换条、场景平铺按钮、引导文案、
    右下角关闭按钮、逐句列表默认展开、本组进度/今日统计卡片。
  · 听力内容扩充（assets/data/listening-ext.json）。
  ·「查看原文」语义统一：控制条开关删除，改由卡片内 vp-link 承接显隐。
  · 控制条三栏布局（左组/播放/右组，左右组 flex 等宽）→ 播放按钮精确居中（实测 0px 偏差）；
    5 个按钮去写死宽度改 flex 自适应（390/360 双视口实测随屏宽缩放）。
  · AI 助教新增「问 AI」：3 个快捷提问 + 自由输入（回车即发），经 window.callAI('auto') 真接入，
    askKey 守卫防切句串台。
发版同步：version.json 1.43/44（notes + changelog 补 R150~R165）、协议.html V1.43、
  AndroidManifest 1.43/44、xt-update.js CURRENT_VERSION=1.43、
  APK 产物 星途-1.43.apk（87,371,704 bytes / md5 2ff84cfc9ff7a89d2dd7566b71817e29）。
"""
    if pending:
        io.open(COMMIT_MSG, 'w', encoding='utf-8', newline='\n').write(msg)
        rc, o, e = git('commit', '-F', COMMIT_MSG)
        log('\n== git commit rc=%d ==' % rc)
        log((o or '').strip()[:600])
        log((e or '').strip()[:400])
        if rc != 0 and 'nothing' not in (o or '') and 'nothing' not in (e or ''):
            log('🔴 本地提交失败，终止')
            io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
            raise SystemExit(2)
    else:
        log('\n== git commit 跳过（本批无未提交改动）==')

    rc, local_head, _ = git('rev-parse', 'HEAD')
    local_head = local_head.strip()
    rc, tree, e = git('write-tree')
    tree = tree.strip()
    log('  本地 HEAD = %s' % local_head)
    log('  新 tree   = %s' % tree)

    cands, live = probe_proxies()
    log('\n== 代理探测 ==')
    log('  候选端口 = %s' % cands)
    log('  活端口   = %s' % live)
    if not live:
        log('🔴 无可用代理端口')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(3)

    proxy, remote_main, ok = None, None, False
    for p in live:
        px = 'http://127.0.0.1:%d' % p
        rc, o, e = git('ls-remote', 'origin', 'refs/heads/main', proxy=px, timeout=90)
        log('\n== ls-remote (%s) rc=%d ==' % (px, rc))
        for l in o.splitlines():
            log('  ' + l)
        if rc == 0 and o.strip():
            proxy, remote_main, ok = px, o.split()[0], True
            break
    if not ok:
        log('🔴 ls-remote 无成功端口，未推送')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(4)
    log('  选用 %s' % proxy)
    log('  远端 main = %s' % remote_main)

    rc, t, e = git('cat-file', '-t', remote_main)
    t = (t or '').strip()
    log('\n== 远端 main 本地可达性 ==')
    log('  cat-file -t %s -> rc=%d %s' % (remote_main, rc, t))
    if rc != 0 or t != 'commit':
        log('🔴 本地缺远端 main 对象，无法构造增量父提交（需先 fetch）')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(4)

    snap = """星途学习工作台 · 1.43 发布快照（增量线）

父提交 = 上一轮远端 main。内容 = 父快照 + R150~R165 共 %d 个文件变更。
本地历史线（含历史提交）不在祖先链上 → 不上传。
""" % len(BATCH)
    io.open(SNAP_MSG, 'w', encoding='utf-8', newline='\n').write(snap)
    rc, newc, e = git('commit-tree', tree, '-p', remote_main, '-F', SNAP_MSG)
    newc = newc.strip()
    log('\n== 增量快照 ==')
    log('  tree      = %s' % tree)
    log('  增量提交  = %s（父 = %s）' % (newc, remote_main[:8]))
    if rc != 0 or not newc:
        log('🔴 commit-tree 失败：%s' % (e or '').strip()[:300])
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(2)

    rc, cnt, _ = git('rev-list', '--count', newc)
    log('  祖先数    = %s' % cnt.strip())

    rc, objs, _ = git('rev-list', '--objects', newc, '--not', remote_main)
    n_obj = len([x for x in objs.splitlines() if x.strip()])
    rc, all_obj, _ = git('rev-list', '--objects', newc)
    n_all = len([x for x in all_obj.splitlines() if x.strip()])
    log('  本次需上传对象 = %d / 全树对象 %d（%s）'
        % (n_obj, n_all, '增量 ✅' if n_obj < n_all * 0.2 else '⚠️ 疑似全量'))
    rc, fobj, _ = git('diff', '--name-only', remote_main, newc)
    log('  相对远端变更文件 = %d 个' % len([x for x in fobj.splitlines() if x.strip()]))

    json.dump({'tree': tree, 'new': newc, 'remoteMain': remote_main,
               'localHead': local_head, 'proxy': proxy, 'nNewObjects': n_obj},
              io.open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    log('  state written')

if stage == 'push':
    st = json.load(io.open(STATE, encoding='utf-8'))
    proxy, newc, remote_main = st['proxy'], st['new'], st['remoteMain']
    log('== 推送（fast-forward 增量）==')
    log('  proxy=%s  new=%s  远端 main=%s' % (proxy, newc, remote_main))
    log('  预期上传对象 = %s' % st.get('nNewObjects'))

    if remote_main == newc:
        log('远端已是该提交，无需推送')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(0)

    rc, o, e = git('push', '--force-with-lease=refs/heads/main:%s' % remote_main,
                   'origin', '%s:refs/heads/main' % newc, proxy=proxy, timeout=1800)
    log('\n== push rc=%d ==' % rc)
    log((o or '').strip()[-1500:])
    log((e or '').strip()[-1500:])

    rc, o, e = git('ls-remote', 'origin', 'refs/heads/main', proxy=proxy, timeout=90)
    log('\n== 复核 ==')
    log('  ls-remote rc=%d  %s' % (rc, (o or '').strip()))
    log('  远端 main == new ? %s' % (newc in (o or '')))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
