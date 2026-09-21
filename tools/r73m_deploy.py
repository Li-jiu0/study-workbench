# -*- coding: utf-8 -*-
"""R73m 部署：服务器 .env 补丁 + config.py 上传 + 重启 + 中转三平台探针
闸门：补丁后断言 + MD5 上传核对 + 探针首字检查
"""
import subprocess, io, hashlib, sys, time

ROOT = r'D:\下载的文件\学习工作台'
PLINK = ROOT + r'\tools\plink.exe'
PSCP = ROOT + r'\tools\pscp.exe'
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
PW = 'Li050800!'
HOST = 'root@110.42.134.62'
LOCAL_ENV = r'C:\Users\ATM\_r73m_remote_env.env'
LOCAL_CFG = ROOT + r'\server\config.py'
OUT = r'C:\Users\ATM\_r73m_deploy_out.txt'
LOG = []
def log(s): LOG.append(str(s))
def flush():
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))

def plink(cmd, timeout=90):
    r = subprocess.run([PLINK, '-pw', PW, '-batch', '-hostkey', HOSTKEY, HOST, cmd],
                       capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

def pscp_up(local, remote):
    r = subprocess.run([PSCP, '-pw', PW, '-batch', '-hostkey', HOSTKEY, local, HOST + ':' + remote],
                       capture_output=True)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

# ---------- 1) 本地补丁远程 .env 副本（幂等：已补丁则跳过）----------
ARK_KEY = '<REDACTED-ARK-API-KEY>'
ZP_KEY = '<REDACTED-ZHIPU-API-KEY>'
QF_KEY = '<REDACTED-QIANFAN-API-KEY>'
raw = open(LOCAL_ENV, 'rb').read()
text = raw.decode('utf-8')
already = ('ZHIPU_API_KEY=339ab' in text) and ('ARK_API_KEY=ark-e725' in text)
if already:
    eol = '\r\n' if '\r\n' in text else '\n'
    new_env = text
    log('env 已是补丁后状态（幂等跳过）: %d bytes' % len(text))
else:
    lines = text.splitlines()
    out_lines = []
    patched_zp = patched_sf = False
    for ln in lines:
        s = ln.strip()
        if s.startswith('ZHIPU_API_KEY=') and len(s) <= len('ZHIPU_API_KEY=') + 1:
            out_lines.append('ZHIPU_API_KEY=' + ZP_KEY); patched_zp = True
        elif s.startswith('SILICONFLOW_API_KEY='):
            out_lines.append('# ' + ln + '  # 欠费402，充值后取消注释 (R73m)'); patched_sf = True
        elif s.startswith(('ARK_', 'QIANFAN_')):
            continue  # 幂等：清除旧 R73m 行，统一在尾部重建
        else:
            out_lines.append(ln)
    assert patched_zp, 'ZHIPU_API_KEY 空行未找到'
    assert patched_sf, 'SILICONFLOW_API_KEY 行未找到'
    out_lines += [
        '',
        '# ---- R73m：火山方舟 / 百度千帆（国内直连免费额度，402 修复）----',
        'ARK_API_KEY=' + ARK_KEY,
        'ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        'ARK_MODEL=deepseek-v4-flash-ga-260731',
        'QIANFAN_API_KEY=' + QF_KEY,
        'QIANFAN_BASE_URL=https://qianfan.baidubce.com/v2/chat/completions',
        'QIANFAN_MODEL=ernie-4.5-turbo-32k',
    ]
    new_env = eol.join(out_lines) + eol
    open(LOCAL_ENV, 'wb').write(new_env.encode('utf-8'))
    text = new_env
    log('env 补丁 OK: %d bytes, 行尾=%r' % (len(new_env), eol))
for probe in ['ZHIPU_API_KEY=339ab', 'ARK_API_KEY=ark-e725', 'QIANFAN_API_KEY=bce-v3',
              '# SILICONFLOW_API_KEY', 'ADMIN_PASSWORD', 'SMTP_PASS', 'JWT_SECRET']:
    log('  断言 %-28s : %s' % (probe, '存在' if probe in text else '!!! 缺失'))
assert all(p in text for p in ['ZHIPU_API_KEY=339ab', 'ARK_API_KEY=ark-e725',
                               'QIANFAN_API_KEY=bce-v3', '# SILICONFLOW_API_KEY',
                               'ADMIN_PASSWORD', 'SMTP_PASS', 'JWT_SECRET']), 'env 断言失败'
assert not any(s.strip().startswith('SILICONFLOW_API_KEY=') for s in text.splitlines()), '硅基 Key 仍在启用'
flush()

# ---------- 2) 上传 .env + config.py（MD5 核对）----------
md5_local_cfg = hashlib.md5(open(LOCAL_CFG, 'rb').read()).hexdigest()
md5_local_env = hashlib.md5(new_env.encode('utf-8')).hexdigest()
rc, so, se = pscp_up(LOCAL_ENV, '/opt/study-workbench/server/.env')
log('pscp env rc=%d %s' % (rc, (so + se).strip().splitlines()[-1] if (so + se).strip() else ''))
assert rc == 0
rc, so, se = pscp_up(LOCAL_CFG, '/opt/study-workbench/server/config.py')
log('pscp config.py rc=%d %s' % (rc, (so + se).strip().splitlines()[-1] if (so + se).strip() else ''))
assert rc == 0

rc, so, se = plink("md5sum /opt/study-workbench/server/.env /opt/study-workbench/server/config.py")
log('remote md5: %s %s' % (so.strip(), se.strip()))
assert md5_local_env in so and md5_local_cfg in so, 'MD5 不一致'
flush()

# ---------- 3) 重启服务 ----------
rc, so, se = plink("systemctl restart study-workbench && sleep 2 && systemctl is-active study-workbench", timeout=120)
log('restart rc=%d out=%r err=%r' % (rc, so.strip(), se.strip()))
assert rc == 0 and 'active' in so, '服务重启失败'
flush()

# ---------- 4) 验证 /api/ai/models ----------
rc, so, se = plink("curl -s http://127.0.0.1:8000/api/ai/models")
log('models: %s' % so.strip())
for pid in ['"ark"', '"zhipu"', '"qianfan"']:
    assert pid in so, 'models 缺 %s' % pid
assert '"siliconflow"' not in so, 'models 仍有 siliconflow'
log('models 断言 OK: ark/zhipu/qianfan 在列，siliconflow 已隐藏')
flush()

# ---------- 5) 三平台探针（POST /api/ai/chat 游客可用）----------
import json
for pid in ['ark', 'zhipu', 'qianfan']:
    body = json.dumps({"provider": pid, "messages": [{"role": "user", "content": "回复两个字：收到"}]})
    cmd = ("curl -s -m 60 -X POST http://127.0.0.1:8000/api/ai/chat "
           "-H 'Content-Type: application/json' -d '%s'" % body.replace("'", "'\\''"))
    rc, so, se = plink(cmd, timeout=90)
    txt = so.strip()
    head = txt[:120].replace('\n', ' ')
    good = bool(txt) and not txt.startswith('⚠')
    log('probe %-8s rc=%d %s | 首段: %s' % (pid, rc, 'OK' if good else '!!! FAIL', head))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE')
