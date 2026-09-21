# -*- coding: utf-8 -*-
"""R11 结构闸（真解析器版）：用 html.parser 维护标签栈，检出真正的不配对。
对照基线：同页的线上版本，用于区分「本次引入」与「既有」。
"""
import io, os, json, urllib.request, urllib.parse
from html.parser import HTMLParser

ROOT = r'D:\下载的文件\学习工作台'
os.chdir(ROOT)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}
SKIP = {'script', 'style'}


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errs = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
            return
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        pass  # 自闭合，忽略

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if tag in VOID:
            return
        if not self.stack:
            self.errs.append('多余闭合 </%s> @%s' % (tag, self.getpos()))
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        # 容忍未闭合的内层（记录但不判死）
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                miss = [t for t, _ in self.stack[i + 1:]]
                self.errs.append('</%s>@%s 前有未闭合 %s' % (tag, self.getpos(), miss))
                del self.stack[i:]
                return
        self.errs.append('闭合 </%s>@%s 无对应开标签' % (tag, self.getpos()))


def audit(text):
    p = P()
    p.feed(text)
    p.close()
    unresolved = [t for t, _ in p.stack]
    return unresolved, p.errs


m = json.load(open('tools/_r11_upload_manifest.json', encoding='utf-8'))
pages = sorted(f for f in m['files'] if f.endswith('.html'))
out = []
bad = 0
for pg in pages:
    txt = io.open(pg, encoding='utf-8', errors='ignore').read()
    un, errs = audit(txt)
    if not un and not errs:
        continue
    # 拉线上同页做基线
    try:
        b = urllib.request.urlopen(urllib.request.Request(
            'http://110.42.134.62/' + urllib.parse.quote(pg),
            headers={'User-Agent': 'r11-struct', 'Cache-Control': 'no-cache'}), timeout=20).read()
        lun, lerrs = audit(b.decode('utf-8', 'ignore'))
    except Exception as e:
        lun, lerrs = ['(线上取回失败:%s)' % e], []
    same = (sorted(un) == sorted(lun)) and (len(errs) == len(lerrs))
    tag = '既有(线上同样)' if same else '★本次引入?'
    if not same:
        bad += 1
    out.append('[%s] %-20s 未闭合=%s | 异常=%s || 线上未闭合=%s' %
               (tag, pg, un[:6], errs[:3], lun[:6]))
out.insert(0, '页面数=%d  与线上不一致=%d' % (len(pages), bad))
io.open('tools/_r11_struct_parse_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
print('TOTAL_REGRESSION =', bad)
