# -*- coding: utf-8 -*-
"""R91-E 核验（编辑已落盘）：命中核验 + 行尾回读。结果 → tools/qa/r91e_edit_result.txt"""
import os

ROOT = r'D:\下载的文件\学习工作台'
JS = os.path.join(ROOT, 'assets', 'xt-aiusage.js')
HTML_SET = os.path.join(ROOT, 'ai-settings.html')
HTML_PUB = os.path.join(ROOT, '朋友圈发布.html')
JS_MOM = os.path.join(ROOT, 'assets', 'xt-moments.js')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91e_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def eol_stats(data):
    crlf = data.count(b'\r\n')
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_cr

with open(JS, 'rb') as f: j1 = f.read()
with open(HTML_SET, 'rb') as f: h1 = f.read()
with open(HTML_PUB, 'rb') as f: p1 = f.read()
with open(JS_MOM, 'rb') as f: m1 = f.read()

w('xt-aiusage.js: size=%d crlf=%d loneCR=%d' % (len(j1),) + eol_stats(j1).__str__().replace('(', '').replace(')', '').join(['', '']) if False else
  'xt-aiusage.js: size=%d crlf=%d loneCR=%d' % ((len(j1),) + eol_stats(j1)))
w('ai-settings.html: size=%d crlf=%d loneCR=%d' % ((len(h1),) + eol_stats(h1)))
w('朋友圈发布.html: size=%d crlf=%d loneCR=%d' % ((len(p1),) + eol_stats(p1)))
w('xt-moments.js: size=%d crlf=%d loneCR=%d' % ((len(m1),) + eol_stats(m1)))

s1 = '剩余可用量（少 → 多）'.encode('utf-8')
s2 = '模型名称'.encode('utf-8')

checks = [
    ('js-aiusage: UsageQuotaSortSel >=1', j1.count(b'UsageQuotaSortSel') >= 1),
    ('js-aiusage: 5 个 option 文案保留（模型名称 全局 2 处=新旧 select 各一）', j1.count(s1) == 1 and j1.count(s2) == 2 and j1.count('<option value="remaining">剩余可用量（少 → 多）</option>'.encode('utf-8')) == 1),
    ('js-aiusage: 旧收放结构全清 0', j1.count(b'UsageQuotaSortToggle') == 0 and j1.count(b'UsageQuotaSortFold') == 0 and j1.count(b'UsageQuotaSortCur') == 0),
    ('js-aiusage: 旧裸 chips bar 清 0', j1.count(b'UsageQuotaSortBar') == 0),
    ('js-aiusage: bindQuotaSortFold 残留 0', j1.count(b'bindQuotaSortFold') == 0),
    ('js-aiusage: QUOTA_SORT_LABEL 残留 0', j1.count(b'QUOTA_SORT_LABEL') == 0),
    ('js-aiusage: data-quota-sort 残留 0', j1.count(b'data-quota-sort') == 0),
    ('js-aiusage: bindQuotaFilterFold 未受影响', j1.count(b'bindQuotaFilterFold') == 2),
    ('js-aiusage: state.quotaSort 数据链路保留', j1.count(b'state.quotaSort') >= 3),
    ('js-aiusage: el.quotaSortSel cache+回填+监听 >=3', j1.count(b'el.quotaSortSel') >= 3),
    ('html-set: xt-aiusage.js?v=20260918f =1', h1.count(b'xt-aiusage.js?v=20260918f') == 1),
    ('html-set: xt-aiusage.js?v=20260918e =0', h1.count(b'xt-aiusage.js?v=20260918e') == 0),
    ('html-pub: id="xtmLocBtn" =0', p1.count('id="xtmLocBtn"'.encode('utf-8')) == 0),
    ('html-pub: id="xtmAtBtn" 仍在', p1.count(b'id="xtmAtBtn"') == 1),
    ('html-pub: 其余功能按钮 4 个仍在', all(p1.count(('id="%s"' % x).encode('utf-8')) == 1 for x in ['xtmVisBtn', 'xtmMentionBtn', 'xtmVidBtn', 'xtmLinkBtn'])),
    ('js-mom: xtmLocBtn 引用清 0', m1.count(b'xtmLocBtn') == 0),
    ('js-mom: xtmPickLocation 保留（xtmAtBtn 仍用）', m1.count(b'function xtmPickLocation') == 1 and m1.count(b'xtmPickLocation;') >= 1),
    ('行尾: xt-aiusage.js 纯 LF', eol_stats(j1) == (0, 0)),
    ('行尾: ai-settings.html 纯 LF', eol_stats(h1) == (0, 0)),
    ('行尾: 朋友圈发布.html 纯 CRLF(loneCR=0)', eol_stats(p1)[1] == 0),
    ('行尾: xt-moments.js 纯 CRLF(loneCR=0)', eol_stats(m1)[1] == 0),
]
allpass = True
for name, ok in checks:
    w('[%s] %s' % ('PASS' if ok else 'FAIL', name))
    if not ok:
        allpass = False
w('EDIT_ALL=%s' % ('PASS' if allpass else 'FAIL'))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('verify-done')
