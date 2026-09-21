# -*- coding: utf-8 -*-
"""R144 第二轮部署状态直探（只读，轻量：APK 只做 HEAD，不下载全量）。"""
import urllib.request, urllib.parse, hashlib, time, json, sys

H = 'http://110.42.134.62'
NEW_APK_MD5 = 'b9b4d96e67d9991129da0d6463ea345e'


def get(u, to=30):
    req = urllib.request.Request(u, headers={'Cache-Control': 'no-cache', 'User-Agent': 'xt-check'})
    with urllib.request.urlopen(req, timeout=to) as f:
        return f.status, f.read()


def head(url, to=30):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'xt-check'})
    with urllib.request.urlopen(req, timeout=to) as f:
        return f.status, dict(f.headers)


apk_url = H + '/static/apk/' + urllib.parse.quote('星途-1.41.apk') + '?cb=' + str(int(time.time()))
print('APK url:', apk_url, flush=True)
try:
    st, hd = head(apk_url)
    print('APK HEAD status', st, 'Content-Length', hd.get('Content-Length'),
          'Last-Modified', hd.get('Last-Modified'), flush=True)
except Exception as e:
    print('APK HEAD ERR', repr(e)[:200], flush=True)

# live-location.html 线上是否含 P1 修复（54KB，快）
try:
    st, b = get(H + '/live-location.html?cb=' + str(int(time.time())), to=30)
    t = b.decode('utf-8', 'replace')
    print('live-location status', st, 'bytes', len(b), flush=True)
    print('  escHtml(url):', 'escHtml(url)' in t, flush=True)
    print('  escHtml(nm.slice(0, 1)):', 'escHtml(nm.slice(0, 1))' in t, flush=True)
    print('  toFixed(6):', t.count('toFixed(6)'), '| toFixed(5):', t.count('toFixed(5)'), flush=True)
    print('  md5:', hashlib.md5(b).hexdigest(), flush=True)
except Exception as e:
    print('live-location ERR', repr(e)[:200], flush=True)

# 本地对照
import os
if os.path.exists('live-location.html'):
    lb = open('live-location.html', 'rb').read()
    print('local live-location md5:', hashlib.md5(lb).hexdigest(), 'size', len(lb), flush=True)
