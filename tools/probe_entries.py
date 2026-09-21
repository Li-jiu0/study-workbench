# -*- coding: utf-8 -*-
"""提取 (2) 页面里新模块的入口代码"""
import io, re, os

B = r'D:\下载的文件\学习工作台(2)'

# 找各页面里调用新模块函数的入口
patterns = {
    '高情商表达.html': ['iPartner', 'i-partner', 'i人', '伙伴'],
    '商务礼仪面试.html': ['groupDiscussion', 'group-discussion', '无领导', '讨论'],
    '央国企笔试.html': ['topicExpress', 'topic-express', '话题表达', '话题'],
    '私聊.html': ['chat-local', 'chatLocal', '本地'],
}

for page, kws in patterns.items():
    fp = os.path.join(B, page)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    print('=====', page, '=====')
    # 找包含关键词的行（HTML 入口）
    lines = h.split('\n')
    for i, ln in enumerate(lines):
        for kw in kws:
            if kw in ln and ('onclick' in ln or 'class=' in ln or 'button' in ln.lower() or 'card' in ln.lower() or 'feature' in ln.lower()):
                print('  L%d:' % (i+1), ln.strip()[:200])
                break
    print()

# 看 i-partner.js / group-discussion.js / topic-express.js 暴露的全局函数名
print('===== 新 JS 全局暴露 =====')
for js in ['i-partner.js', 'group-discussion.js', 'topic-express.js', 'chat-local.js']:
    fp = os.path.join(B, 'assets', js)
    with io.open(fp, encoding='utf-8') as f:
        c = f.read()
    # 找 window.XXX =
    exports = re.findall(r'window\.(\w+)\s*=', c)
    print(js, '-> exports:', sorted(set(exports)))
