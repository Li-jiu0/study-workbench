# -*- coding: utf-8 -*-
"""测试有道词典发音接口可用性"""
import urllib.request, urllib.parse

tests = [('hello', 2), ('你好', 2), ('university', 1), ('I want to pass the exam', 2),
         ('The quick brown fox jumps over the lazy dog', 2)]
for text, t in tests:
    url = 'https://dict.youdao.com/dictvoice?audio=' + urllib.parse.quote(text) + '&type=' + str(t)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = r.read()
            ct = r.headers.get('Content-Type')
            print('{} (type={}): status={}, content-type={}, size={}B'.format(text, t, r.status, ct, len(data)))
    except Exception as e:
        print('{} (type={}): FAIL {}'.format(text, t, e))
