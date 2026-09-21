# -*- coding: utf-8 -*-
"""R11 web-only 全量部署（阶段：预检 → 备份 → 上传 → 解压 → 逐文件 md5 校验 → 重启后端 → 线上验收）。

阶段1（本脚本，--phase pre）：远端布局预检 + 改前 md5 + 备份快照；不写任何线上生产文件。
严格约束：绝不触碰 version.json / *.apk / android/**（用户明确：本轮只上线 web，不打包 APK）。
"""
import os, re, io, sys, time, json, hashlib, subprocess

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, 'assets')) and os.path.isdir(os.path.join(ROOT, 'server')), 'ROOT 异常'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
REMOTE_ROOT = '/opt/study-workbench'
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r11_deploy.tar.gz')
MANIFEST = json.load(io.open(os.path.join(ROOT, 'tools', '_r11_manifest.json'), encoding='utf-8'))
STAMP = MANIFEST['stamp']
OUT = os.path.join(ROOT, 'tools', '_r11_deploy_full_out.txt')
TS = time.strftime('%Y%m%d-%H%M%S')
BAK = REMOTE_ROOT + '/_bak-r11-' + TS

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)
log('目标 root@%s   备份目录 %s' % (host, BAK))

def plink(cmd, timeout=180):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode

def dump(md_section, res):
    log('\n===== %s =====' % md_section)
    log(res[0].rstrip())
    if res[1] != 0:
        log('[rc=%d]' % res[1])

md5 = MANIFEST['md5']
arcs = sorted(md5.keys())
log('本地清单: %d 条, stamp=%s, 包内 md5=%s' % (len(arcs), STAMP,
    hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()))

# ---------- 0) 远端布局预检 ----------
dump('0) 远端布局', plink(
    'echo "-- /opt/study-workbench --"; ls -la %s | head -40; '
    'echo "-- web (前12) --"; ls %s/web | head -12; '
    'echo "-- server --"; ls %s/server; echo "-- systemd --"; systemctl is-active study-workbench' % (REMOTE_ROOT, REMOTE_ROOT, REMOTE_ROOT)))

# ---------- 1) 改前 md5（服务端 4 件 + assets 抽查） ----------
srvs = [a for a in arcs if a.startswith('server/')]
probe = srvs + ['web/assets/ai-config.js', 'web/assets/ai-service.js', 'web/assets/app.js', 'web/index.html']
dump('1) 改前 md5（服务端 4 件 + 静态抽查）', plink(
    'cd %s && md5sum %s' % (REMOTE_ROOT, ' '.join(probe))))

# ---------- 2) 备份快照（保留原相对路径） ----------
cmds = ['set -e', 'cd %s' % REMOTE_ROOT]
for a in arcs:
    d = os.path.dirname(a)
    cmds.append('mkdir -p "%s/%s"' % (BAK, d))
    cmds.append('if [ -f "%s" ]; then cp -a "%s" "%s/%s"; fi' % (a, a, BAK, a))
cmds.append('echo "备份完成: $(find %s -type f | wc -l) 个文件"' % BAK)
dump('2) 备份快照', plink(' && '.join(cmds)))

cmd = ['set -e']
cmd.append('cp -a %s/web/assets/ai-config.js %s/web/assets/ai-config.js.r11i-before 2>/dev/null || true' % (REMOTE_ROOT, REMOTE_ROOT))
cmd.append('rm -f %s/web/assets/ai-config.js.r11i-before' % REMOTE_ROOT)
cmd.append('cd %s/web/assets && ls -la ai-config.js' % REMOTE_ROOT)
dump('3) 静态入口现状', plink(' ; '.join(cmd)))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[phase-pre written] ' + OUT)
log('备份目录: ' + BAK)
