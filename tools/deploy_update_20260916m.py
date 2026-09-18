# -*- coding: utf-8 -*-
"""20260916M 热修批次部署：本轮 UI 热修 6 项 + AI 模型贯穿 1 项

改动文件（7 个）：
  assets/app.js                  首页 renderStats 补调 / 自定义模型链路 / 转义与显示名兜底
  assets/common.css              .xt-inline-form 全站权威显隐规则（L533-540）
  assets/company-lib.js          企业定向库分类收放列表
  assets/ai-page.js              testCustom() 改用 getCmModelId()
  私聊.html                      .im-tab 唯一权威定义区
  企业定向库.html                .cl-tabs 收起/展开样式
  关于.html                      倒计时表单局部隐藏规则
  学习工作台.html                注释扩写（无功能变化）+ 上一批的首页卡片修复

策略：
  1) 全站 39 个 HTML 版本戳 20260916L → 20260916M（强制客户端拉新）
  2) 打包 assets/*.js + assets/*.css + 全部 HTML
  3) pscp 上传 → plink 远端解包 + HTTP 探活 + 关键内容校验

环境变量：SW_HOST / SW_PASS 覆盖凭据；SW_DRY_RUN=1 只做本地打包与 bump，不上传
"""
import os, io, sys, glob, tarfile, subprocess, re

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916M'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = r'C:\Users\ATM\_dep_m_out.txt'
LOG = []

# ---------- 1) 全站 HTML 版本戳 bump ----------
htmls = []
bumped = 0
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    htmls.append(b)
    # ⚠️ 行尾安全：必须按二进制读写，绝不使用 text 模式。
    # 教训（2026-09-16）：先前写成 io.open(p, 'w', encoding='utf-8', newline='')
    # 配合默认的读模式（newline=None），读时 \r\n 被归一化为 \n、写时又不补回，
    # 导致 39 个 HTML 全站行尾被静默改成 LF（每行少 1 字节）。
    # 现改为二进制读取 -> 版本戳替换 -> 二进制写回，行尾逐字节不变。
    with open(p, 'rb') as f:
        raw = f.read()
    raw2, n = re.subn(rb'\?v=[0-9A-Za-z_\-\.]+', b'?v=' + STAMP.encode('ascii'), raw)
    if n:
        with open(p, 'wb') as f:
            f.write(raw2)
        bumped += n
LOG.append('HTML %d 个, bump 版本戳 %d 处 -> %s' % (len(htmls), bumped, STAMP))

# ---------- 2) 打包 ----------
assets_js = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
             if f.endswith('.js') and 'bak' not in f.lower()]
assets_css = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
              if f.endswith('.css') and 'bak' not in f.lower()]
LOG.append('打包 assets: %d 个 js + %d 个 css' % (len(assets_js), len(assets_css)))

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in assets_js + assets_css:
        p = os.path.join(ROOT, 'assets', fn)
        tar.add(p, arcname='web/assets/' + fn)
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)

names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))

# 关键字面断言
MUST = ['web/assets/app.js', 'web/assets/common.css', 'web/assets/ai-page.js',
        'web/assets/company-lib.js', 'web/私聊.html', 'web/企业定向库.html',
        'web/关于.html', 'web/学习工作台.html', 'web/AI.html', 'web/设置.html']
for m in MUST:
    assert m in names, '断言失败 ' + m
LOG.append('关键文件断言 OK (%d 项)' % len(MUST))

# ---------- 3) 凭据 ----------
host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    LOG.append('[DRY-RUN] 跳过上传与远端解包')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(0)

# ---------- 4) 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))

# ---------- 5) 远端解包 + 探活 + 内容校验 ----------
remote = (
    "cd {root} && "
    "tar -xzf frontend_{st}.tar.gz && echo EXTRACT_OK && "
    "echo '--- HTTP 探活 ---' && "
    "curl -s -o /dev/null -w 'home=%{{http_code}} ' 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'; "
    "curl -s -o /dev/null -w 'AI=%{{http_code}} ' 'http://127.0.0.1/AI.html'; "
    "curl -s -o /dev/null -w 'im=%{{http_code}} ' 'http://127.0.0.1/%E7%A7%81%E8%81%8A.html'; "
    "curl -s -o /dev/null -w 'setting=%{{http_code}}' 'http://127.0.0.1/%E8%AE%BE%E7%BD%AE.html'; echo; "
    "echo '--- app.js 内容校验 ---'; "
    "grep -c \"XT_AI_CUSTOM_KEY = 'ai_custom_models'\" web/assets/app.js; "
    "grep -c 'aiEscJsAttrStr' web/assets/app.js; "
    "grep -c 'xtAiAutoModelName' web/assets/app.js; "
    "echo '--- common.css 内容校验 ---'; "
    "grep -c 'xt-inline-form' web/assets/common.css; "
    "echo '--- 版本戳校验（应为 20260916M） ---'; "
    "grep -o '?v=20260916[A-Z]' web/%E8%AE%BE%E7%BD%AE.html | sort -u; "
    "grep -o '?v=20260916[A-Z]' web/AI.html | sort -u"
).format(root=REMOTE_ROOT, st=STAMP)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append((r.stdout or '') + (('\n[STDERR] ' + r.stderr[-500:]) if r.stderr else ''))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
