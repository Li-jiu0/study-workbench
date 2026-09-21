# -*- coding: utf-8 -*-
"""R143+R144 → GitHub 推送（走代理）：孤儿快照线 + index 脱敏复扫 + 活端口探测。

用法：
    python tools/_r144_push.py prep    # 暂存受控文件集 → 守卫断言 → index 密钥复扫 → commit
                                       # → 构建孤儿快照 → 探测代理 → ls-remote 预热
    python tools/_r144_push.py push    # 旧 main 存 backup/ → --force-with-lease 推 main → 复核

纪律（见 MEMORY.md §Git 推送）：
  · 绝不推送 *.apk（index 断言）；孤儿树 = index tree，未跟踪文件天然不入
  · 旧 main 先存 refs/heads/backup/ 零丢失，再 --force-with-lease 推 main
  · 代理端口每会话都变 → socket 探测活端口（env → 7897 → 7890 → 10809 → 1080）
  · 脱敏扫描必须扫 **index**（`git grep --cached`），不是工作树
  · 扫描器自身不得内嵌真实密钥片段 → 只用通用**检测**正则（形态匹配），不含任何真实值
"""
import os, re, io, json, time, socket, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'
for _m in ('学习工作台.html', 'assets', 'server', 'tools'):
    assert os.path.exists(os.path.join(ROOT, _m)), 'ROOT 疑似非主项目根，缺 ' + _m

STATE = os.path.join(ROOT, 'tools', '_r144_push_state.json')
ORPHAN_MSG = os.path.join(ROOT, 'tools', '_r144_orphan_msg.txt')
COMMIT_MSG = os.path.join(ROOT, 'tools', '_r144_commit_msg.txt')
OUT = os.path.join(ROOT, 'tools', '_r144_push_out.txt')

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s, flush=True)

def git(*a, proxy=None, timeout=180):
    cmd = ['git', '-c', 'core.quotepath=false']
    if proxy:
        cmd += ['-c', 'http.proxy=%s' % proxy, '-c', 'https.proxy=%s' % proxy,
                '-c', 'http.version=HTTP/1.1']
    cmd += list(a)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=timeout)
    return r.returncode, (r.stdout or ''), (r.stderr or '')

def probe_proxies():
    cands = []
    for k in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
        v = os.environ.get(k, '')
        m = re.search(r'(\d{2,5})', v.split('@')[-1]) if v else None
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
            s.connect(('127.0.0.1', p)); live.append(p)
        except OSError:
            pass
        finally:
            s.close()
    return cands, live

# 本次要入库的受控文件集（显式清单：不 add -A，避免 596 个历史残留物入快照）
ADD = [
    'android/AndroidManifest.xml',
    'android/java/com/study/workbench/MainActivity.java',
    'assets/chat-local.js',
    'assets/xt-profile.js',
    'assets/xt-update.js',
    'live-location.html',
    '私聊.html',
    '个人资料.html',
    '协议.html',
    '关于.html',
    '更多.html',
    '更新.html',
    'server/routers/version.json',
    'tools/_r140_apk_verify.py',
    'tools/_r144_deploy.py',
    'tools/_r144_remote_probe.py',
    'tools/_r144_round2_accept.py',
    'tools/_r144_prod_probe.py',
    'tools/_r144_commit_msg.txt',
    'tools/_r144_push.py',
    'tools/qa/_r144_jsdom.js',
    'tools/qa/_r144_report.txt',
    'tools/qa/_r144_qa_report.txt',
    'tools/qa/_r144_qa_extra.js',
    'tools/qa/_r144_qa_extra_out.txt',
    'tools/verifier/_r141_syntax.js',
    'tools/_r143_stamp_report.txt',
]

# 通用检测正则（**不含任何真实密钥值**，仅形态匹配）
PATS = [
    (rb'AIza[0-9A-Za-z_\-]{25,}', 'Google API key 形'),
    (rb'AQ\.[A-Za-z0-9_\-]{16,}', 'AQ. 前缀 key 形'),
    (rb'sk-[A-Za-z0-9_\-]{24,}', 'sk- 前缀 key 形'),
    (rb'ALTAK[A-Za-z0-9_\-]{12,}', 'Volc ALTAK 形'),
    (rb'[0-9a-f]{32}\.[0-9A-Za-z]{12,}', 'zhipu 形 key'),
    (rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', '私钥 PEM'),
    (rb'ghp_[A-Za-z0-9]{30,}', 'GitHub PAT'),
]

stage = sys.argv[1] if len(sys.argv) > 1 else 'prep'

if stage == 'prep':
    # ---------- 0) 无已跟踪文件被删 ----------
    rc, o, e = git('status', '--porcelain')
    dels = [l for l in o.splitlines() if l[:2] == ' D']
    if dels:
        log('🔴 有已跟踪文件被删除，先恢复再推：%s' % dels[:10]); raise SystemExit(2)

    # ---------- 1) 暂存受控集 + 守卫断言 ----------
    log('===== 1) 暂存受控文件集 =====')
    for f in ADD:
        p = os.path.join(ROOT, f.replace('/', os.sep))
        assert os.path.exists(p), '待入库文件不存在: %s' % f
        sz = os.path.getsize(p)
        assert sz < 2 * 1024 * 1024, '待入库文件过大(%d): %s' % (sz, f)
        low = f.lower()
        assert not any(low.endswith(x) for x in ('.apk', '.gz', '.zip', '.keystore', '.db')), '禁入库类型: %s' % f
        assert '/.env' not in low and not low.endswith('.env'), '禁入库类型: %s' % f
    rc, o, e = git('add', '--', *ADD)
    log('git add rc=%d %s' % (rc, (e or '').strip()[:300]))
    rc, o, e = git('diff', '--cached', '--name-only')
    staged = [x for x in o.splitlines() if x.strip()]
    log('暂存文件数 = %d' % len(staged))
    for x in staged:
        log('  + ' + x)
    assert staged, '暂存集为空 → 中止'

    # ---------- 2) index 全量密钥复扫（扫 index，不扫工作树） ----------
    log('\n===== 2) index 密钥复扫（通用形态） =====')
    total_hits = 0
    NOLIST = 'REDACTED'   # 白名单：命中行若含此串 → 视为已脱敏占位（R2C 阶段遗留的 sk-or-v1-REDACTED-... 之类），不算密钥
    for pat, name in PATS:
        rc, o, e = git('grep', '--cached', '-I', '-l', '-E', pat.decode(), timeout=300)
        files = [x for x in o.splitlines() if x.strip()]
        real = []
        for f in files:
            rc2, o2, _ = git('grep', '--cached', '-I', '-n', '-E', pat.decode(), '--', f, timeout=120)
            lines = [x for x in o2.splitlines() if x.strip()]
            bad = [x for x in lines if NOLIST.lower() not in x.lower()]
            if bad or not lines:
                real.append((f, bad[:3]))
        if real:
            total_hits += len(real)
            log('  ⚠ %s: %d 个文件' % (name, len(real)))
            for f, bad in real[:12]:
                log('      ' + f)
                for b in bad:
                    log('        > ' + b[:200])
        else:
            skipped = ('（已忽略 %d 个仅含 REDACTED 占位的文件）' % len(files)) if files else ''
            log('  零残留 %s%s' % (name, skipped))
    # index 内不得有 apk / 大二进制
    rc, o, e = git('ls-files')
    idx = o.splitlines()
    bad_ext = [x for x in idx if x.lower().endswith(('.apk', '.keystore', '.db', '.env'))]
    log('  index 文件数 = %d  禁列命中 = %s' % (len(idx), bad_ext or '无'))
    assert not bad_ext, 'index 含禁列文件 → 中止'
    if total_hits:
        log('\n🔴 index 检出 %d 处疑似密钥形态，**未提交**。请人工核对后再决定。' % total_hits)
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        raise SystemExit(5)
    log('  ⇒ 复扫零残留 ✅')

    # ---------- 3) 本地提交 ----------
    log('\n===== 3) 本地提交 =====')
    rc, o, e = git('commit', '-F', COMMIT_MSG)
    log('git commit rc=%d' % rc)
    log((o or '').strip()[:800])
    log((e or '').strip()[:500])
    assert rc == 0, '提交失败 → 中止'

    # ---------- 4) 孤儿快照 ----------
    log('\n===== 4) 孤儿快照 =====')
    rc, tree, e = git('write-tree')
    tree = tree.strip()
    msg = """星途学习工作台 · 1.41 发布快照（孤儿快照线）

内容 = R143+R144 发版时的 index 树（已脱敏：无密钥、无 APK、无大文件）。
本地历史线仍是权威；本分支为对外发布的单提交快照。
"""
    io.open(ORPHAN_MSG, 'w', encoding='utf-8', newline='\n').write(msg)
    rc, orphan, e = git('commit-tree', tree, '-F', ORPHAN_MSG)
    orphan = orphan.strip()
    log('  tree   = %s' % tree)
    log('  orphan = %s' % orphan)
    rc, cnt, _ = git('rev-list', '--count', orphan)
    log('  祖先数 = %s （必须为 1）' % cnt.strip())
    assert cnt.strip() == '1', '孤儿快照祖先数不为 1 → 中止'
    rc, local_head, _ = git('rev-parse', 'HEAD')
    json.dump({'tree': tree, 'orphan': orphan, 'localHead': local_head.strip()},
              io.open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    # ---------- 5) 代理探测 ----------
    cands, live = probe_proxies()
    log('\n===== 5) 代理探测 =====')
    log('  候选端口 = %s' % cands)
    log('  活端口   = %s' % live)
    if not live:
        log('🔴 无可用代理端口'); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(3)

    # ---------- 6) ls-remote 预热 ----------
    log('\n===== 6) ls-remote 预热 =====')
    ok = False
    proxy = None
    for p in live:
        px = 'http://127.0.0.1:%d' % p
        try:
            rc, o, e = git('ls-remote', 'origin', 'refs/heads/main', proxy=px, timeout=90)
        except subprocess.TimeoutExpired:
            log('  %s 超时' % px); continue
        log('  %s rc=%d  %s' % (px, rc, (o or '').strip()[:120] or (e or '').strip()[:120]))
        if rc == 0 and o.strip():
            proxy = px
            remote_main = o.split()[0]
            ok = True
            st = json.load(io.open(STATE, encoding='utf-8'))
            st.update({'proxy': proxy, 'remoteMain': remote_main})
            json.dump(st, io.open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            log('  远端 main = %s' % remote_main)
            break
    if not ok:
        log('🔴 ls-remote 无成功端口，未推送')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(4)
    log('\n  orphan=%s  （push 阶段见上）' % orphan)

if stage == 'push':
    st = json.load(io.open(STATE, encoding='utf-8'))
    proxy, orphan, remote_main = st['proxy'], st['orphan'], st['remoteMain']
    ts = time.strftime('%Y%m%d-%H%M%S')
    log('===== 推送 =====')
    log('  proxy=%s  orphan=%s  远端 main=%s' % (proxy, orphan, remote_main))
    if remote_main == orphan:
        log('远端已是该快照，无需推送'); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(0)

    # 7) 旧 main 先存 backup/（零丢失）
    bname = 'refs/heads/backup/main-pre-r144-%s' % ts
    rc, o, e = git('push', 'origin', '%s:%s' % (remote_main, bname), proxy=proxy, timeout=900)
    log('\n== 7) 旧 main 存 backup (%s) rc=%d ==' % (bname, rc))
    log((o or '').strip()[-800:]); log((e or '').strip()[-800:])

    # 8) 推 orphan 到 main
    rc, o, e = git('push', '--force-with-lease=refs/heads/main:%s' % remote_main,
                   'origin', '%s:refs/heads/main' % orphan, proxy=proxy, timeout=1200)
    log('\n== 8) 推 main rc=%d ==' % rc)
    log((o or '').strip()[-1500:]); log((e or '').strip()[-1500:])

    # 9) 独立复核
    rc, o, e = git('ls-remote', 'origin', 'refs/heads/main', proxy=proxy, timeout=90)
    log('\n== 9) 复核 ==')
    log('  ls-remote rc=%d  %s' % (rc, (o or '').strip()))
    log('  远端 main == orphan ? %s' % (orphan in (o or '')))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
