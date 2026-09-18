# -*- coding: utf-8 -*-
import io, os, time

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_misc_out.txt')
L = []

# 1) blog_wechat.html 行尾检查（确认版本戳改写有没有把 CRLF 变成 LF）
p = os.path.join(ROOT, 'blog_wechat.html')
raw = open(p, 'rb').read()
crlf = raw.count(b'\r\n')
lf_only = raw.count(b'\n') - crlf
L.append('blog_wechat.html: bytes=%d  CRLF=%d  裸LF=%d' % (len(raw), crlf, lf_only))

# 2) 找最近 40 分钟内修改过的图片（用户粘贴的截图可能落在这里）
roots = [r'C:\Users\ATM\AppData\Local\Temp', r'C:\Users\ATM\Downloads', r'C:\Users\ATM\Desktop',
         r'C:\Users\ATM\Pictures', r'C:\Users\ATM\Documents', ROOT,
         r'C:\Users\ATM\WorkBuddy', ROOT + r'\tools']
now = time.time()
hits = []
for rt in roots:
    if not os.path.isdir(rt):
        continue
    for dp, dn, fn in os.walk(rt):
        depth = dp[len(rt):].count(os.sep)
        if depth > 2:
            dn[:] = []
            continue
        if '.git' in dp or 'node_modules' in dp:
            continue
        for f in fn:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
                fp = os.path.join(dp, f)
                try:
                    m = os.path.getmtime(fp)
                except Exception:
                    continue
                if now - m < 2400:
                    hits.append((m, fp, os.path.getsize(fp)))
hits.sort(reverse=True)
L.append('')
L.append('最近 40 分钟内修改的图片（前 25 条）：')
for m, fp, sz in hits[:25]:
    L.append('  %s  %8d  %s' % (time.strftime('%H:%M:%S', time.localtime(m)), sz, fp))
if not hits:
    L.append('  （无）')

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('MISC_OK')
