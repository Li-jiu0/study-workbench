# -*- coding: utf-8 -*-
"""探测用户自定义端点 ai.hub.camera 的真实返回（结果落盘）"""
import io, json, urllib.request, urllib.error
OUT = r'D:\下载的文件\学习工作台\tools\_probe_hubcamera.txt'
res = []
url = 'https://ai.hub.camera/api/chat'
req = urllib.request.Request(url, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read(400)
        res.append('STATUS=%s' % r.status)
        res.append('CT=%s' % r.headers.get('Content-Type'))
        res.append('BODY=%r' % body[:300])
except urllib.error.HTTPError as e:
    res.append('HTTPError STATUS=%s' % e.code)
    res.append('CT=%s' % e.headers.get('Content-Type') if e.headers else 'CT=?')
    try:
        res.append('BODY=%r' % e.read(300))
    except Exception as e2:
        res.append('body read fail %r' % e2)
except Exception as e:
    res.append('ERR=%r' % e)
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
