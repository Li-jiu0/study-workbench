# -*- coding: utf-8 -*-
"""r89_qa_drive.py —— 通用 CDP 驱动：加载页面并执行任意断言脚本，结果写文件。
用法: python r89_qa_drive.py <url> <w> <h> <scriptFile>
"""
import os, sys, json, subprocess, tempfile, time

BASE = r'D:\下载的文件\学习工作台'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
OUTJSON = os.path.join(BASE, 'tools', 'qa', 'r89_qa_cdp_out.json')

url, w, h, scr = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
if os.path.exists(OUTJSON):
    os.remove(OUTJSON)
p = subprocess.run([NODE, os.path.join(BASE, 'tools', 'qa', 'r89_qa_cdp.js'), url, w, h, scr],
                   capture_output=True, timeout=120)
if not os.path.exists(OUTJSON):
    print('NO_OUTPUT')
    print('STDOUT:', p.stdout.decode('utf-8', 'replace')[:3000])
    print('STDERR:', p.stderr.decode('utf-8', 'replace')[:3000])
    sys.exit(1)
d = json.load(open(OUTJSON, encoding='utf-8'))
print(json.dumps(d, ensure_ascii=False, indent=1))
