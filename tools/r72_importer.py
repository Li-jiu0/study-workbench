# -*- coding: utf-8 -*-
# R72 任务三：assets/importer.js 追加「导入成功 → 可选登记到我的文件」
import io, os

BASE = r'D:\下载的文件\学习工作台'
P = os.path.join(BASE, 'assets', 'importer.js')

def run(p, edits):
    raw = open(p, 'rb').read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    t = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    for old, new, cnt in edits:
        o = old.replace('\r\n', '\n')
        n = t.count(o)
        if n != cnt:
            raise SystemExit('ABORT %s: found=%d expect=%d' % (p, n, cnt))
        t = t.replace(o, new.replace('\r\n', '\n'))
    out = t.replace('\n', '\r\n').encode('utf-8')
    if bom:
        out = b'\xef\xbb\xbf' + out
    open(p, 'wb').write(out)
    return out.count(b'\n') - out.count(b'\r\n')

old = "      toast(tip, 'success');\n\n      /* ③ 收尾：刷新宿主页面的题库列表 → 关闭向导 */"

new = ("      toast(tip, 'success');\n\n"
"      /* ③ R72-9：可选登记到「我的文件」——数据键为唯一真相，登记函数为可选增强。\n"
"         跨页调用可能不存在（我的文件.html 未加载该脚本时 window.xtFilesRegister 为 undefined），\n"
"         故 typeof 守卫 + try/catch；未加载时静默跳过，由 我的文件.html 渲染时汇总数据键。 */\n"
"      try {\n"
"        if (typeof window.xtFilesRegister === 'function') {\n"
"          var regModule = isBuiltin(S.target) ? labelOf(S.target) : (S.target || curName);\n"
"          var regTitle = toBuiltin ? (curName + '（到 ' + labelOf(S.target) + '）') : ('自定义·' + safeFileName(S.rawName));\n"
"          window.xtFilesRegister({\n"
"            id: 'imp:' + (toBuiltin ? labelOf(S.target) : S.target) + ':' + curName,\n"
"            title: regTitle,\n"
"            kind: 'bank',\n"
"            module: regModule || '题库',\n"
"            source: 'import',\n"
"            items: items.length,\n"
"            size: 0,\n"
"            createdAt: new Date().toISOString(),\n"
"            payload: { name: curName, type: curType, count: items.length }\n"
"          });\n"
"        }\n"
"      } catch (eReg) { /* 登记为可选增强：失败绝不影响导入主流程 */ }\n\n"
"      /* ③ 收尾：刷新宿主页面的题库列表 → 关闭向导 */")

lone = run(P, [(old, new, 1)])
print('importer.js edited; loneLF=%d' % lone)
