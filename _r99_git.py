# -*- coding: utf-8 -*-
"""R97+R98+R99 头像改造入库 + 推送 GitHub（走代理）"""
import os, io, re, sys, subprocess, socket

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, '_r99_git_out.txt')
LOG = []


def log(s):
    LOG.append(str(s))


def flush(code=0):
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(code)


def git(*args, timeout=300):
    cmd = ['git', '-c', 'core.quotepath=false'] + list(args)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=timeout)
    return r.returncode, (r.stdout or b'').decode('utf-8', 'replace'), (r.stderr or b'').decode('utf-8', 'replace')


# ---------- 1) 探测可用代理 ----------
def port_open(p):
    try:
        s = socket.create_connection(('127.0.0.1', p), timeout=0.6)
        s.close()
        return True
    except Exception:
        return False


cands = []
for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
    v = os.environ.get(k) or ''
    m = re.search(r':(\d+)', v)
    if m:
        cands.append(int(m.group(1)))
cands += [7897, 7890, 10809, 1080]
seen = []
for p in cands:
    if p not in seen:
        seen.append(p)

log('=== 1) 代理探测 ===')
live = None
for p in seen:
    ok = port_open(p)
    log('  port %-6d %s' % (p, 'OPEN' if ok else 'closed'))
    if ok and live is None:
        live = p
if live is None:
    log('!!! 无可用代理端口，推送将不带代理尝试')
    PROXY = None
else:
    log('选定代理端口: %d' % live)
    PROXY = 'http://127.0.0.1:%d' % live

# ---------- 2) 暂存 ----------
log('')
log('=== 2) git add ===')
rc, so, se = git('add', '-A')
log('add rc=%d %s' % (rc, se.strip()[:300]))
if rc != 0:
    flush(2)

rc, so, se = git('status', '--porcelain')
lines = [x for x in so.split('\n') if x.strip()]
log('暂存条目数=%d' % len(lines))
for x in lines[:60]:
    log('  ' + x)
if len(lines) > 60:
    log('  ... 其余 %d 条省略' % (len(lines) - 60))

# ---------- 3) 提交 ----------
log('')
log('=== 3) git commit ===')
msg = '''R97+R98+R99：头像编辑三阶段改造（对标微信）

R97 交互微信化：
- 移除底部缩放滑杆与说明文案，只留单指拖动 + 双指捏合（桌面留滚轮）
- 裁剪框叠加 3x3 淡灰九宫格参考线
- 顶栏精简为「取消」「完成」两个按钮，中间留空
- 点击编辑头像先弹底部 ActionSheet（拍照 / 从手机相册选择 / 取消）

R98 圆形改正方形：
- 正方形裁剪边长尽量占满屏宽（上下各留 12px），去掉 hole 的 border-radius
- 「完成」去掉圆形 clip，输出完整正方形 JPEG
- 个人资料页头像容器 .xtp-hero-avatar / .xtp-avatar-sm 圆角 50% -> 12px

R99 修复拖动/缩放失效 + 取样越界：
- 根因1：layout 边界镜像写法在 crop=屏宽 时产生 min>max 逆序区间，
  clamp 把 STATE.y 钉死 -> 图片无法上下移动。改为直接推导并加区间退化防御
- 根因2：cover 语义 + ZMIN=1 导致无法缩小。ZMIN 降为 0.4
- 抽出 baseScale() 供 layout/zoomAt 共用，锚点缩放不跳变
- 修 P1：缩小时 sSize=crop/total 超过原图 -> drawImage 源框越界补透明 -> 白边。
  把正方形取样框夹进原图边界（200 组合穷举验证 0 越界）

版本戳 xt-profile.css/js -> 20260919b
'''
rc, so, se = git('commit', '-m', msg)
log('commit rc=%d' % rc)
log(so.strip()[:1500])
if se.strip():
    log('[stderr] ' + se.strip()[:600])
if rc != 0:
    flush(3)

# ---------- 4) 推送 ----------
log('')
log('=== 4) git push ===')
rc, so, se = git('remote', '-v')
log('remote:\n' + so.strip())

base = ['git', '-c', 'core.quotepath=false', '-c', 'http.version=HTTP/1.1']
if PROXY:
    base += ['-c', 'http.proxy=' + PROXY, '-c', 'https.proxy=' + PROXY]
cmd = base + ['push', 'origin', 'main']
log('命令: ' + ' '.join(cmd))
r = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=900)
log('push rc=%d' % r.returncode)
log((r.stdout or b'').decode('utf-8', 'replace')[-2000:])
err = (r.stderr or b'').decode('utf-8', 'replace').strip()
if err:
    log('[stderr] ' + err[-2000:])

# ---------- 5) 远端核实 ----------
log('')
log('=== 5) ls-remote 核实 ===')
lrcmd = ['git', '-c', 'core.quotepath=false']
if PROXY:
    lrcmd += ['-c', 'http.proxy=' + PROXY, '-c', 'https.proxy=' + PROXY]
lrcmd += ['ls-remote', 'origin', 'refs/heads/main']
r2 = subprocess.run(lrcmd, cwd=ROOT, capture_output=True, timeout=180)
log('ls-remote rc=%d' % r2.returncode)
log((r2.stdout or b'').decode('utf-8', 'replace').strip())

rc, so, se = git('log', '--oneline', '-3')
log('')
log('本地最近 3 条:')
log(so.strip())

flush(0)
