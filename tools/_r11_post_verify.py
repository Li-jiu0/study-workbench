# -*- coding: utf-8 -*-
"""R11 上线后终验：模型清单/中转可用性/端到端对话/版本号未变（不误触发 App 更新）/APK 未动。"""
import io, re, json, time, hashlib, urllib.request, urllib.parse

BASE = 'http://110.42.134.62'
OUT = r'D:\下载的文件\学习工作台\tools\_r11_post_verify_out.txt'
LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

def http(path, method='GET', data=None, timeout=60, headers=None):
    h = {'User-Agent': 'r11-post', 'Cache-Control': 'no-cache'}
    if headers: h.update(headers)
    rq = urllib.request.Request(BASE + path, method=method, headers=h)
    if data is not None:
        rq.data = json.dumps(data).encode('utf-8')
        rq.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()

# 1) 首页
st, b = http('/')
log('1) 首页 GET / status=%s bytes=%d title=%s' % (st, len(b), (re.search(rb'<title>(.*?)</title>', b) or [b'', b'?'])[1][:60]))

# 2) 模型清单
st, b = http('/api/ai/models')
j = {}
try: j = json.loads(b.decode('utf-8'))
except Exception as e: log('models parse err %s' % e)
models = j.get('models') if isinstance(j, dict) else None
log('\n2) /api/ai/models status=%s 顶层键=%s 模型数=%s' % (st, list(j.keys())[:6], (len(models) if isinstance(models, list) else 'n/a')))
if isinstance(models, list):
    provs = {}
    for m in models:
        if not isinstance(m, dict): continue
        p = m.get('provider') or m.get('platform') or '?'
        provs.setdefault(p, []).append(m)
    log('   平台分布: %s' % {k: len(v) for k, v in sorted(provs.items())})
    # 抽样看字段
    log('   样本字段: %s' % sorted(models[0].keys()))
    # gemini 模型是否在列
    gm = [m for m in models if (m.get('provider') or m.get('platform')) == 'gemini']
    log('   gemini 模型数=%d 例=%s' % (len(gm), [ (m.get('id') or m.get('model')) for m in gm[:3] ]))

# 3) relayAvailable（部分接口在该字段）
st, b = http('/api/ai/providers')
if st == 200:
    log('\n3) /api/ai/providers status=%s -> %s' % (st, b.decode('utf-8', 'replace')[:400]))
else:
    log('\n3) /api/ai/providers status=%s (接口可能不存在)' % st)

# 4) 端到端对话（走服务端中转）
st, b = http('/api/ai/chat', 'POST', {'provider': 'gemini', 'model': 'gemini-2.0-flash',
            'messages': [{'role': 'user', 'content': '只回复两个字：成功'}]}, timeout=90)
log('\n4) POST /api/ai/chat (gemini→服务端中转) status=%s body=%s' % (st, b.decode('utf-8', 'replace')[:300]))

st, b = http('/api/ai/chat', 'POST', {'provider': 'deepseek', 'model': 'deepseek-chat',
            'messages': [{'role': 'user', 'content': '只回复两个字：成功'}]}, timeout=90)
log('   POST /api/ai/chat (deepseek 直连) status=%s body=%s' % (st, b.decode('utf-8', 'replace')[:200]))

# 5) 版本号未变（关键：本轮不打包 APK，不能提示更新）
st, b = http('/api/app/version')
log('\n5) /api/app/version status=%s -> %s' % (st, b.decode('utf-8', 'replace')[:400]))

# 6) APK 文件是否被本次触碰（只看时间戳/大小）
st, b = http('/assets/ai-config.js?cb=%d' % time.time())
log('\n6) ai-config.js 公网 md5=%s 零key=%s' % (hashlib.md5(b).hexdigest(), b'AQ.' not in b))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
