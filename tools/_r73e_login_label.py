# -*- coding: utf-8 -*-
# R73e 需求：登录.html 删除「当前为多人在线版」字样
import io, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'D:\下载的文件\学习工作台\登录.html'
BAK = r'D:\下载的文件\学习工作台\备份\登录.html.backup-20260918-online-label'
shutil.copyfile(P, BAK)
raw = open(P, 'rb').read()
base_crlf = raw.count(b'\r\n')
old = "if (n) n.innerHTML = '💡 <b>当前为多人在线版</b><br>后端地址：<b>' + escHtml(API_BASE || '同源部署') + '</b>';"
new = "if (n) n.innerHTML = '💡 后端地址：<b>' + escHtml(API_BASE || '同源部署') + '</b>';"
b_old, b_new = old.encode('utf-8'), new.encode('utf-8')
assert raw.count(b_old) == 1, '锚点非唯一'
raw = raw.replace(b_old, b_new, 1)
open(P, 'wb').write(raw)
raw2 = open(P, 'rb').read()
t = raw2.decode('utf-8')
checks = {
    'CRLF 不变': raw2.count(b'\r\n') == base_crlf and (raw2.count(b'\n') - raw2.count(b'\r\n')) == 0,
    '目标文案已删': '当前为多人在线版' not in t,
    '后端地址行保留': '后端地址：<b>' in t,
    '注释配对': t.count('<!--') == t.count('-->'),
    'script 配对': t.count('<script') == t.count('</script>'),
}
for k, v in checks.items():
    print(('PASS ' if v else 'FAIL ') + k)
sys.exit(0 if all(checks.values()) else 1)
