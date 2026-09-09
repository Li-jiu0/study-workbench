# -*- coding: utf-8 -*-
import zipfile, os, hashlib, shutil

apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify10')
os.makedirs(tmp, exist_ok=True)
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))
with open(apk, 'rb') as f:
    print('MD5:', hashlib.md5(f.read()).hexdigest())
with zipfile.ZipFile(apk) as z:
    names = z.namelist()
    # 新文件
    for f in ['assets/AI模拟面试.html', 'assets/PPT素材库.html', 'assets/四级经验分享.html',
              'assets/assets/i-partner.js', 'assets/assets/group-discussion.js',
              'assets/assets/topic-express.js', 'assets/assets/chat-local.js']:
        print('  %s: %s' % (f, 'YES' if f in names else 'NO'))
    # 新功能卡片
    checks = [
        ('高情商表达.html', 'IPartner.open()'),
        ('高情商表达.html', 'i人伙伴团'),
        ('商务礼仪面试.html', 'GroupDiscussion.open()'),
        ('商务礼仪面试.html', 'AI无领导小组讨论'),
        ('央国企笔试.html', 'TopicExpress.open()'),
        ('央国企笔试.html', '话题表达训练'),
        ('学习工作台.html', 'AI模拟面试.html'),
        ('学习工作台.html', 'PPT素材库.html'),
        ('学习工作台.html', '四级经验分享.html'),
    ]
    print()
    for page, sym in checks:
        content = z.read('assets/' + page).decode('utf-8', errors='replace')
        print('  %s :: %s: %s' % (page, sym, 'YES' if sym in content else 'NO'))
    # JS 引用
    print()
    for page, js in [('高情商表达.html', 'i-partner.js'), ('商务礼仪面试.html', 'group-discussion.js'),
                      ('央国企笔试.html', 'topic-express.js'), ('私聊.html', 'chat-local.js')]:
        content = z.read('assets/' + page).decode('utf-8', errors='replace')
        print('  %s 引用 %s: %s' % (page, js, 'YES' if js in content else 'NO'))
    # 私聊页不再引用 chat.js
    sl = z.read('assets/私聊.html').decode('utf-8', errors='replace')
    print('  私聊页 chat.js 已移除: %s' % ('YES' if 'chat.js' not in sl else 'NO'))
