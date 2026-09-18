# -*- coding: utf-8 -*-
"""三通道探测 ai.hub.camera：环境变量代理 / Clash 7897 / 直连"""
import io, urllib.request, urllib.error
OUT = r'D:\下载的文件\学习工作台\tools\_probe_hubcamera2.txt'
URL = 'https://ai.hub.camera/api/chat'
res = []

def probe(tag, proxy):
    try:
        if proxy is None:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        else:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': proxy, 'https': proxy}))
        req = urllib.request.Request(URL, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
        with opener.open(req, timeout=15) as r:
            res.append('%s STATUS=%s CT=%s BODY=%r' % (tag, r.status, r.headers.get('Content-Type'), r.read(300)))
    except urllib.error.HTTPError as e:
        try:
            b = e.read(300)
        except Exception:
            b = b'?'
        res.append('%s HTTP %s CT=%s BODY=%r' % (tag, e.code, e.headers.get('Content-Type') if e.headers else '?', b))
    except Exception as e:
        res.append('%s ERR=%r' % (tag, e))

probe('env-proxy', None)  # None 表示跟随环境变量？不——ProxyHandler({}) 是禁用代理。单独处理：
res.append('--- 修正：上面 None 实际=直连 ---')
probe('clash-7897', 'http://127.0.0.1:7897')
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
