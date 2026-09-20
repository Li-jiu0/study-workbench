# R68 线3：更多.html 删除「我的导入题库」死区块
# 二进制读写保 BOM/CRLF；先备份，再按行号+内容标记双重校验后删除。
import io, os, sys

P = r'D:\下载的文件\学习工作台\更多.html'
BAK = P + '.bak-pre-r68-20260916'

raw = open(P, 'rb').read()
assert raw[:3] == b'\xef\xbb\xbf', 'BOM missing'
body = raw[3:]
# 备份（二进制复制，保 BOM/行尾）
if not os.path.exists(BAK):
    open(BAK, 'wb').write(raw)
    print('backup written:', BAK, len(raw), 'bytes')
else:
    print('backup exists, skip:', BAK)

# lone LF 检查
stripped = body.replace(b'\r\n', b'')
assert b'\n' not in stripped, 'lone LF found in source'
assert b'\r' not in stripped, 'lone CR found in source'

text = body.decode('utf-8')
lines = text.split('\r\n')
n0 = len(lines)
print('lines before:', n0)

def check(idx, marker):
    ok = marker in lines[idx - 1]
    if not ok:
        print('MISMATCH line %d expect <%s> got: %r' % (idx, marker, lines[idx - 1][:100]))
        sys.exit(3)

# 校验目标行（1-based，与 Read 结果一致）
check(22, '我的导入题库')
check(23, '.imp-libs{')
check(24, '.imp-libs-t{')
check(25, '.imp-lib{')
check(26, '.imp-lib-h{')
check(27, '.imp-lib-n{')
check(28, '.imp-lib-c{')
check(29, '.imp-lib-b{')
check(30, '.imp-lib-items{')
check(31, '.imp-lib.open .imp-lib-items{')
check(32, '.imp-empty{')
check(176, 'id="impLibs"')
check(227, '我的导入题库')
check(228, 'function escImp')
check(229, 'function impItemText')
check(237, 'function renderImportLibs')
check(263, 'function removeImportLib')
check(272, 'window.removeImportLib = removeImportLib;')
check(273, 'window.renderImportLibs = renderImportLibs;')
check(275, 'window.__impAfterImport = renderImportLibs;')
check(276, 'renderImportLibs();')
check(278, "DOMContentLoaded', renderImportLibs")
check(414, '我的导入题库')

# 自底向上删除
del lines[413]        # L414 HTML 注释
del lines[226:278]    # L227-278 内联脚本块
del lines[175]        # L176 DOM
del lines[21:32]      # L22-32 CSS

out = '\r\n'.join(lines).encode('utf-8')
open(P, 'wb').write(b'\xef\xbb\xbf' + out)
print('lines after:', len(lines), '(delta', len(lines) - n0, ')')
print('written OK')
