# R68 线3 静态自测：BOM/行尾/禁用串 0 命中/保留项仍在/div 配对
import re, sys

P = r'D:\下载的文件\学习工作台\更多.html'
BAK = P + '.bak-pre-r68-20260916'
out = []
fails = 0

def ok(name, cond, info=''):
    global fails
    out.append(('[PASS] ' if cond else '[FAIL] ') + name + (('  ' + info) if info else ''))
    if not cond:
        fails += 1

raw = open(P, 'rb').read()
bak = open(BAK, 'rb').read()

# 1. BOM + lone LF
ok('BOM 前3字节 EF BB BF', raw[:3] == b'\xef\xbb\xbf')
body = raw[3:]
stripped = body.replace(b'\r\n', b'')
ok('loneLF=0', b'\n' not in stripped)
ok('loneCR=0', b'\r' not in stripped)
crlf_new = body.count(b'\r\n')
crlf_old = bak[3:].count(b'\r\n')
ok('CRLF 行数级别一致(差值=删除块行数)', crlf_old - crlf_new == 65, 'old=%d new=%d' % (crlf_old, crlf_new))

text = body.decode('utf-8')
btext = bak[3:].decode('utf-8')

# 2. 禁用串 0 命中
banned = ['impLibs', 'renderImportLibs', 'removeImportLib', '__impAfterImport',
          'impItemText', 'escImp', 'imp-libs-t', '我的导入题库', '导入向导尚未就绪',
          'imp-lib', 'imp-empty', '__impBanks', '__impDelBank']
for b in banned:
    ok('禁用串 0 命中: %s' % b, b not in text, 'hits=%d' % text.count(b))

# 3. 保留项仍在
required = ['id="importerView"', 'openImporterView', 'closeImporterView',
            'window.openImporterView = openImporterView;',
            'window.closeImporterView = closeImporterView;',
            'onclick="openImporterView()"', '>导入题库</div>',
            'id="aiFab"', 'id="countdownModal"', 'id="morePanel"', 'id="toolsPanel"',
            'class="bottom-nav"', 'importer-view{', 'importer-view-body', 'id="impBody"',
            "location.href = '设置.html'"]
for r in required:
    ok('保留项仍在: %s' % r, r in text)

# 底部导航 5 项
ok('底部导航 5 项', text.count('bottom-nav-item') == btext.count('bottom-nav-item'),
   'new=%d old=%d' % (text.count('bottom-nav-item'), btext.count('bottom-nav-item')))

# 入口卡数量与备份一致
cards_new = text.count('morepage-card morepage-list-item')
cards_old = btext.count('morepage-card morepage-list-item')
ok('入口卡数量与备份一致', cards_new == cards_old, 'new=%d old=%d' % (cards_new, cards_old))

# 4. div 开闭配对：差值恰等于删除的 1 个 <div ...impLibs...>（该 div 为自闭合对 <div></div>）
div_open_new = len(re.findall(r'<div\b', text))
div_close_new = text.count('</div>')
div_open_old = len(re.findall(r'<div\b', btext))
div_close_old = btext.count('</div>')
ok('div 开标签自身配对', div_open_new == div_close_new, 'open=%d close=%d' % (div_open_new, div_close_new))
ok('div 开/闭删除量相等（删除块为平衡片段，含 JS 模板里的 div 字符串）',
   (div_open_old - div_open_new) == (div_close_old - div_close_new),
   'delta open=%d close=%d' % (div_open_old - div_open_new, div_close_old - div_close_new))

# 版本戳未动
ok('版本戳 ?v=20260916O 数量不变', text.count('?v=20260916O') == btext.count('?v=20260916O'))
ok('版本戳 ?v=20260916Q 数量不变', text.count('?v=20260916Q') == btext.count('?v=20260916Q'))

out.append('')
out.append('===== R68 线3 静态自测汇总: FAIL=%d =====' % fails)
rp = r'D:\下载的文件\学习工作台\tools\qa\r68_l3_static_result.txt'
open(rp, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('\n'.join(out))
sys.exit(1 if fails else 0)
