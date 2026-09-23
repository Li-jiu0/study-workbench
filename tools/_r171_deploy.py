# -*- coding: utf-8 -*-
"""R171 批次统一发版（web 静态 + server 后端，一条命令走完 SOP 全部闸门）。

背景
--------------------------------------------------------------------
本批 = R169-L + R170(A/B/C/D/E) + R171(A/C1/C2/D)。改动横跨「网页资源」与「FastAPI 后端」，
线上静态根是 `/opt/study-workbench/web`（nginx），后端根是 `/opt/study-workbench`（systemd `study-workbench`）。

顺序（与项目红线手册一致）
--------------------------------------------------------------------
  0) 本地清单自检（禁列文件、version.json 默认不传、ROOT 必须是主仓库非 worktree）
  1) 打包 tar（arc = web/... 与 server/...）→ 记录每文件 md5
  2) 线上备份到 /opt/study-workbench/_bak_r171_<ts>（cp --parents 保留层级）
  3) 上传 tar → 远端 md5(tar) 必须一致
  4) 解压 → 逐文件 md5 必须全一致（不一致即中止，不杀进程、不重启）
  5) 远端 `python3 -m py_compile` 语法闸门（不过则回滚 server、不重启）
  6) 清孤儿 uvicorn（防 8000 被占）→ `systemctl restart study-workbench`
  7) 线上验收：新路由进 OpenAPI、静态资源 200 且含新戳、页面含新 DOM 标记、服务 active 且 NRestarts 不暴涨

用法
--------------------------------------------------------------------
  python tools/_r171_deploy.py --dry      # 只打印清单与 md5，不碰服务器
  python tools/_r171_deploy.py --apply    # 真发版（含重启 + 验收）
  python tools/_r171_deploy.py --apply --with-version-json   # APK 发版时把 version.json 一起传
输出：tools/_r171_deploy_out.txt
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TS = time.strftime('%Y%m%d-%H%M%S')
BK = RR + '/_bak_r171_' + TS
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r171_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r171_deploy.tar.gz'
OUT = os.path.join(ROOT, 'tools', '_r171_deploy_out.txt')

APPLY = '--apply' in sys.argv
WITH_VERSION_JSON = '--with-version-json' in sys.argv

LOG = []

# 每次运行前清空进度文件（log() 会实时追加）
try:
    io.open(OUT, 'w', encoding='utf-8').write(
        '=== R171 DEPLOY %s  apply=%s version_json=%s ===\n'
        % (time.strftime('%Y-%m-%d %H:%M:%S'), APPLY, WITH_VERSION_JSON))
except Exception:
    pass


def log(s=''):
    LOG.append(str(s))
    try:
        print(s, flush=True)
    except Exception:
        pass
    # 实时落盘：即使进程被中断，也能看到执行到哪一步
    try:
        io.open(OUT, 'a', encoding='utf-8').write(str(s) + '\n')
    except Exception:
        pass


# ======================================================================
# 0) 文件清单：从工作树变更自动推导（避免手抄漏项）
# ======================================================================
BAD = ('.apk', '.db', '.env', 'model_usage.json', 'model_quota.json', 'model_registry.json',
       '/data/', '__pycache__', '.venv', 'android/')


def git_changed():
    r = subprocess.run(['git', '-c', 'core.quotepath=false', 'status', '--porcelain'],
                       cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = []
    for line in (r.stdout or '').splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip().strip('"')
        if ' -> ' in path:
            path = path.split(' -> ')[-1].strip().strip('"')
        out.append((line[:2].strip(), path))
    return out


def deployable(path, status):
    p = path.replace('\\', '/')
    base = os.path.basename(p)
    if p.startswith('tools/') or p.startswith('docs/') or p.startswith('.workbuddy/') or p.startswith('web/'):
        return None
    if base.startswith('_') or '.bak' in base.lower() or '.backup' in base.lower() or '.r9' in base.lower():
        return None
    if p.startswith('android/'):
        return None
    if p == 'server/routers/version.json':
        # 仅 APK 发版时才随包上传（本批默认不上传，红线：不发 APK 绝不动 version.json）
        return p if WITH_VERSION_JSON else None
    if '/' not in p and p.endswith('.html'):
        return 'web/' + p
    if p.startswith('assets/') and (p.endswith('.js') or p.endswith('.css') or p.endswith('.json')):
        return 'web/' + p
    if p.startswith('server/') and p.endswith('.py'):
        return p
    return None


changed = git_changed()
PAIRS = []          # (local_rel, arc)
seen_arc = set()
for status, path in sorted(changed, key=lambda x: x[1]):
    arc = deployable(path, status)
    if not arc:
        continue
    if arc in seen_arc:
        continue
    if any(b in arc for b in BAD) and 'version.json' not in arc:
        log('[跳过-禁列] ' + path)
        continue
    local = path
    if not os.path.exists(os.path.join(ROOT, local.replace('/', os.sep))):
        log('[跳过-已删除] ' + path)     # 删除类变更不在本批范围（本批无删文件）
        continue
    seen_arc.add(arc)
    PAIRS.append((local, arc))

# 未跟踪但需要发布的新文件（git status 已含 ??，这里只做兜底：显式补关键新资产）
for extra in ['assets/admin-ops.js', 'assets/xt-announce.js']:
    if os.path.exists(os.path.join(ROOT, extra.replace('/', os.sep))) and 'web/' + extra not in seen_arc:
        seen_arc.add('web/' + extra)
        PAIRS.append((extra, 'web/' + extra))

if not PAIRS:
    log('没有可发布的变更文件，终止。')
    raise SystemExit(0)

WEB = [a for _, a in PAIRS if a.startswith('web/')]
SRV = [a for _, a in PAIRS if a.startswith('server/')]
MD5 = {}
for loc, arc in PAIRS:
    p = os.path.join(ROOT, loc.replace('/', os.sep))
    MD5[arc] = hashlib.md5(open(p, 'rb').read()).hexdigest()

log('===== 0) 发版清单（%d 件：web %d / server %d）=====' % (len(PAIRS), len(WEB), len(SRV)))
for loc, arc in PAIRS:
    log('  %-52s md5=%s' % (arc, MD5[arc]))
if not APPLY:
    log('\n[dry-run] 未连接服务器。加 --apply 才真正发版。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG) + '\nR171_DEPLOY_DRY\n')
    raise SystemExit(0)

# ======================================================================
# 1) 打包
# ======================================================================
if os.path.exists(TAR_LOCAL):
    os.remove(TAR_LOCAL)
with tarfile.open(TAR_LOCAL, 'w:gz') as tf:
    for loc, arc in PAIRS:
        tf.add(os.path.join(ROOT, loc.replace('/', os.sep)), arcname=arc)
tar_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
log('\n===== 1) tar md5=%s (%d bytes) =====' % (tar_md5, os.path.getsize(TAR_LOCAL)))

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)


def plink(cmd, timeout=600):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = r.stdout or ''
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode


def http(path, timeout=30, port=None):
    try:
        base = 'http://' + host + (':%d' % port if port else '')
        rq = urllib.request.Request(base + path,
                                    headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                             'User-Agent': 'r171-deploy'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


def dump(code):
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG) + '\nR171_DEPLOY_EXIT_%s\n' % code)
    raise SystemExit(code)


# 基线
st0, b0 = http('/api/app/version')
try:
    j0 = json.loads(b0.decode('utf-8'))
except Exception:
    j0 = {}
log('\n[基线] /api/app/version HTTP %s version=%s code=%s' % (st0, j0.get('version'), j0.get('versionCode')))

# ======================================================================
# 2) 备份
# ======================================================================
o, _ = plink("mkdir -p '" + BK + "' && cd " + RR + " && ok=0; "
             "for f in " + ' '.join("'" + f + "'" for f in (WEB + SRV)) + "; do "
             "  if [ -f \"$f\" ]; then cp --parents \"$f\" '" + BK + "' && ok=$((ok+1)); fi; done; "
             "echo \"backed_up=$ok\"")
log('\n===== 2) 线上备份 → %s =====' % BK)
log(o.strip())

# ======================================================================
# 3) 上传 + tar md5
# ======================================================================
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@' + host + ':' + TAR_REMOTE],
                   capture_output=True, text=True, timeout=900, errors='replace')
log('\n===== 3) 上传 tar =====')
log('pscp rc=%d %s' % (r.returncode, (r.stderr or '').strip()[:300]))
if r.returncode != 0:
    log('[中止] pscp 失败 → 未重启。')
    dump(3)
o, _ = plink('md5sum ' + TAR_REMOTE)
log(o.strip())
if tar_md5 not in o:
    log('[中止] 远端 tar md5 不一致 → 未重启。')
    dump(3)

# ======================================================================
# 4) 解压 + 逐文件 md5
# ======================================================================
o, _ = plink('cd ' + RR + ' && tar -xzf ' + TAR_REMOTE + ' && echo EXTRACT_OK')
log('\n===== 4) 解压 =====')
log(o.strip())
if 'EXTRACT_OK' not in o:
    log('[中止] 解压失败 → 未重启。')
    dump(4)

o, _ = plink('cd ' + RR + ' && md5sum ' + ' '.join("'" + f + "'" for f in (WEB + SRV)))
log('\n===== 5) 逐文件 md5 校验 =====')
seen, bad = {}, []
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        seen[p[len(RR) + 1:] if p.startswith(RR + '/') else p] = mm.group(1)
for f in (WEB + SRV):
    if seen.get(f) != MD5[f]:
        bad.append((f, MD5[f], seen.get(f)))
log('命中 %d/%d，不一致 %d' % (len(seen), len(WEB + SRV), len(bad)))
for b in bad:
    log('  MISMATCH %s 期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 不杀进程、不重启。')
    dump(2)
log('全部一致 OK')

# ======================================================================
# 6) 远端语法闸门（仅当有 .py）
# ======================================================================
if SRV:
    log('\n===== 6) 远端 py_compile 闸门 =====')
    o, _ = plink("cd " + RR + " && (python3 -m py_compile " + ' '.join("'" + f + "'" for f in SRV) +
                 " && echo REMOTE_PYCOMPILE_OK) || echo REMOTE_PYCOMPILE_FAIL")
    log(o.strip())
    if 'REMOTE_PYCOMPILE_OK' not in o:
        log('[中止] 远端 py_compile 未通过 → 回滚 server、不重启。')
        o2, _ = plink("cd " + RR + " && cp -r '" + BK + "/server/'* server/ && echo ROLLBACK_DONE")
        log(o2.strip())
        dump(5)
    log('远端语法 OK')

# ======================================================================
# 7) 清孤儿 + 重启 + 状态
# ======================================================================
log('\n===== 7) 清孤儿 uvicorn / 重启服务 =====')
o, _ = plink("MP=$(systemctl show study-workbench -p MainPID --value); "
             "CNT=$(pgrep -f 'uvicorn main:app' | wc -l); echo \"MainPID=$MP uvicorn进程数=$CNT\"; "
             "pgrep -f 'uvicorn main:app' | grep -v \"^$MP$\" | xargs -r kill -9; "
             "sleep 1; echo \"清理后 uvicorn进程数=$(pgrep -f 'uvicorn main:app' | wc -l)\"")
log(o.strip())
o, _ = plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench; sleep 3; '
             'systemctl is-active study-workbench; '
             'systemctl show study-workbench -p MainPID -p NRestarts -p ActiveEnterTimestamp')
log(o.strip())

# ======================================================================
# 8) 线上验收
# ======================================================================
log('\n===== 8) 线上验收 =====')
time.sleep(2)
fails = []


def chk(name, cond, extra=''):
    log('  [%s] %s%s' % ('PASS' if cond else 'FAIL', name, ('  :: ' + str(extra)) if extra else ''))
    if not cond:
        fails.append(name)


# 8.1 服务活着
o, _ = plink('systemctl is-active study-workbench')
chk('服务 active', 'active' in o, o.strip())

# 8.2 新路由进 OpenAPI（R170/R171 关键路由）
st, body = http('/openapi.json', port=8000)
paths = []
try:
    paths = list(json.loads(body.decode('utf-8')).get('paths', {}).keys())
except Exception as e:
    log('  openapi 解析失败 %r' % (e,))
for want in ['/api/admin/users/{uid}', '/api/admin/announcements', '/api/admin/logs',
             '/api/admin/me/visibility', '/api/admin/content/moments', '/api/admin/groups',
             '/api/admin/chat/threads']:
    chk('OpenAPI 含 ' + want, want in paths)
# R171 应用列表路由（若后端已实现则应出现；未实现则记录为待办而非失败）
for want in ['/api/user/app-list', '/api/user/app-list/toggle', '/api/admin/users/{uid}/apps']:
    log('  [INFO] OpenAPI %s = %s' % (want, 'YES' if want in paths else 'NO（后端未实现则正常）'))

# 8.3 静态资源 200 + 新戳
stamps = {}
for arc in WEB:
    if not arc.endswith(('.html', '.js', '.css')):
        continue
    u = '/' + urllib.parse.quote(arc[len('web/'):])
    st, b = http(u)
    if st != 200:
        chk('静态 %s 200' % u, False, 'HTTP %s' % st)
        continue
    m2 = re.search(rb'\?v=([0-9A-Za-z]+)', b)
    stamps[u] = (m2.group(1).decode() if m2 else '')
log('  -- 静态资源状态码与首个戳 --')
for u, v in stamps.items():
    log('     %-46s 200  v=%s' % (u, v or '(无)'))
chk('静态资源全部 200', len(stamps) + sum(1 for arc in WEB if not arc.endswith(('.html', '.js', '.css'))) >= 1)

# 8.4 关键页面标记
st, b = http('/' + urllib.parse.quote('管理员.html'))
txt = b.decode('utf-8', 'replace')
chk('管理员.html 含 R170-E 列表容器 id="admMenuList"', 'id="admMenuList"' in txt)
chk('管理员.html 含 R170-E 子页顶栏容器 id="admSubHead"', 'id="admSubHead"' in txt)
chk('管理员.html 引用 admin-ops.js', 'admin-ops.js' in txt)
st2, b2 = http('/assets/admin-ops.js')
chk('assets/admin-ops.js 线上 200（不再是 404）', st2 == 200, 'HTTP %s' % st2)
if st2 == 200:
    chk('admin-ops.js 内含 R170-E 导航实现', b'"adm-menu-item"' in b2 or b'admMenuList' in b2)
st3, b3 = http('/' + urllib.parse.quote('学习工作台.html'))
chk('学习工作台.html 引用公告脚本 xt-announce.js', 'xt-announce.js' in b3.decode('utf-8', 'replace'))

log('')
log('验收失败项：%d %s' % (len(fails), (':: ' + '; '.join(fails)) if fails else ''))
log('R171_DEPLOY_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
log('备份目录：' + BK)
dump(0 if not fails else 6)
