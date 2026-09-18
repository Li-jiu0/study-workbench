# -*- coding: utf-8 -*-
# R72 任务三：app.js 显示标签一致性（pageTitles / getModuleName / 兜底 About 文案）
import io, os
p = os.path.join(r'D:\下载的文件\学习工作台', 'assets', 'app.js')
raw = open(p, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
t = io.open(p, 'r', encoding='utf-8-sig', newline='').read().replace('\r\n', '\n').replace('\r', '\n')

edits = [
 ("  comm: '表达', interview: '面测', ppt: '演示',",
  "  comm: '表达', interview: '面测', ppt: '我的文件',", 1),
 ("  const names = { cet: '英语', exam: '行测', comm: '表达', interview: '面测', ppt: '演示' };",
  "  const names = { cet: '英语', exam: '行测', comm: '表达', interview: '面测', ppt: '我的文件' };", 1),
 ("商务礼仪 · 演示 · 万能金句", "商务礼仪 · 我的文件 · 万能金句", 1),
]
for old, new, cnt in edits:
    n = t.count(old)
    if n != cnt:
        raise SystemExit('ABORT: found=%d expect=%d :: %r' % (n, cnt, old[:60]))
    t = t.replace(old, new)

out = t.replace('\n', '\r\n').encode('utf-8')
if bom:
    out = b'\xef\xbb\xbf' + out
open(p, 'wb').write(out)
print('ok loneLF=%d' % (out.count(b'\n') - out.count(b'\r\n')))
