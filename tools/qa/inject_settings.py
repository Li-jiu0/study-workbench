import io, re
root = r'D:\下载的文件\学习工作台'
tag = '<script src="assets/xt-settings.js?v=20260916i"></script>'
pat = re.compile(r'<script[^>]*\bsrc\s*=\s*["\'][^"\']+["\'][^>]*>')
res = []
for f in ['设置.html', '个人中心.html']:
    p = root + '\\' + f
    s = io.open(p, encoding='utf-8', errors='ignore').read()
    if 'xt-settings.js' in s:
        res.append(f + ' 已存在，跳过')
        continue
    m = pat.search(s)
    if not m:
        s = s.replace('</head>', tag + '\n</head>', 1)
        res.append(f + ' 无 script，插到 </head> 前')
    else:
        s = s[:m.start()] + tag + '\n' + s[m.start():]
        res.append(f + ' 注入 OK（插在首个 script 前）')
    io.open(p, 'w', encoding='utf-8').write(s)
io.open(r'C:\Users\ATM\_inject_set.txt', 'w', encoding='utf-8').write('\n'.join(res))
print('OK')
