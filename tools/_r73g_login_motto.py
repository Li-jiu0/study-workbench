# -*- coding: utf-8 -*-
# R73g 需求：登录页在线提示改为「幻想买馍---->修身」，适中字号显示
import io, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r'D:\下载的文件\学习工作台\登录.html'
BAK = r'D:\下载的文件\学习工作台\备份\登录.html.backup-20260918-motto'
shutil.copyfile(P, BAK)
raw = open(P, 'rb').read()
base_crlf = raw.count(b'\r\n')

old = "if (n) n.innerHTML = '💡 开源：<a href=\"https://github.com/Li-jiu0/study-workbench\" target=\"_blank\" rel=\"noopener\">https://github.com/Li-jiu0/study-workbench</a>';"
new = "if (n) n.innerHTML = '<span style=\"font-size:14px;letter-spacing:2px;opacity:.85\">幻想买馍 ----&gt; 修身</span>';"
b_old, b_new = old.encode('utf-8'), new.encode('utf-8')
assert raw.count(b_old) == 1, '锚点非唯一: %d' % raw.count(b_old)
raw = raw.replace(b_old, b_new, 1)
open(P, 'wb').write(raw)

raw2 = open(P, 'rb').read()
t = raw2.decode('utf-8')
checks = {
    'CRLF 不变': raw2.count(b'\r\n') == base_crlf and (raw2.count(b'\n') - raw2.count(b'\r\n')) == 0,
    '开源字样已删': '开源：' not in t,
    '座右铭在': '幻想买馍' in t and '修身' in t,
    '字号适中(14px)': 'font-size:14px' in t,
    '注释配对': t.count('<!--') == t.count('-->'),
    'script 配对': t.count('<script') == t.count('</script>'),
}
for k, v in checks.items():
    print(('PASS ' if v else 'FAIL ') + k)
sys.exit(0 if all(checks.values()) else 1)
