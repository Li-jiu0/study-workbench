# -*- coding: utf-8 -*-
# R72 任务三：assets/app.js 定点修改（二进制读写 + 断言；绝不用文本模式写）
import io, os

BASE = r'D:\下载的文件\学习工作台'
P = os.path.join(BASE, 'assets', 'app.js')

def run(p, edits):
    raw = open(p, 'rb').read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    t = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    for old, new, cnt in edits:
        o = old.replace('\r\n', '\n')
        n = t.count(o)
        if n != cnt:
            raise SystemExit('ABORT %s: found=%d expect=%d\n---\n%s\n---' % (p, n, cnt, o[:120]))
        t = t.replace(o, new.replace('\r\n', '\n'))
    out = t.replace('\n', '\r\n').encode('utf-8')
    if bom:
        out = b'\xef\xbb\xbf' + out
    open(p, 'wb').write(out)
    lone = out.count(b'\n') - out.count(b'\r\n')
    return lone

E = []

# 1) PAGE_FILES：新增 files；保留 ppt 指向新页
E.append((
"  ppt: '演示.html',\n  blog: '社区.html',",
"  // R72-6：主入口「演示」→「我的文件」；ppt 键保留并改指新页，防历史深链/旧快捷入口死链。\n  files: '我的文件.html',\n  ppt: '我的文件.html',\n  blog: '社区.html',",
1))

# 2) HOME_DEF 首页快捷卡
E.append((
"  { k: 'ppt', ic: '🎨', dc: 'palette', t: '演示', d: '版式案例', url: '演示.html' }",
"  { k: 'ppt', ic: '📁', dc: 'folder', t: '我的文件', d: '题库/作品归档', url: '我的文件.html' }",
1))

# 3) MODULE_INDEX 顶栏全局搜索
E.append((
"  { page: 'ppt',            icon: '🎨', dc: 'palette',         title: '演示',             desc: '版式训练 · 案例拆解', kw: 'PPT 汇报 课件 幻灯片 版式 演示' },",
"  { page: 'ppt',            icon: '📁', dc: 'folder',          title: '我的文件',         desc: '题库 · 作品 · 笔记归档', kw: '我的文件 文件 题库 作品 笔记 归档' },",
1))

# 4) migrateLegacyKeys：copyOne 目标键已存在时「跳过但不清源」
E.append((
"  function copyOne(oldKey, newKey) {\n    if (localStorage.getItem(newKey) != null) return; // 新键已存在：不覆盖当前账号数据\n    var v = localStorage.getItem(oldKey);\n    if (v != null) { try { localStorage.setItem(newKey, v); } catch (e) { /* 忽略 */ } }\n  }",
"  // R72-1：目标键已存在时「跳过但不清源」——裸键一律保留（老数据的兼容读取兜底）。\n  function copyOne(oldKey, newKey) {\n    var v = localStorage.getItem(oldKey);\n    if (v == null) return;\n    if (localStorage.getItem(newKey) == null) {\n      try { localStorage.setItem(newKey, v); } catch (e) { /* 忽略 */ }\n    }\n    // 目标键已存在：不覆盖当前账号数据，且不改动裸键。\n  }",
1))

# 5) migrateLegacyKeys：删除「迁移后删裸键」两段
E.append((
"  // 全部处理完后一次性删除旧键（避免迁移逻辑反复触发）\n  LITERAL_KEYS.forEach(function (key) {\n    if (olds.indexOf(key) >= 0) { try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }\n  });\n  PREFIX_KEYS.forEach(function (p) {\n    olds.forEach(function (key) {\n      if (key.indexOf(p) === 0 && key.indexOf('@') === -1) { try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }\n    });\n  });\n})();",
"  // R72-1：迁移后**不再删除裸键**——裸键保留作兼容兜底（chat-local.js 等仍读裸键；\n  // 此处原 removeItem 正是本批「会话列表消失」的共因）。迁移幂等：下次运行 copyOne 见目标键已存在即跳过。\n})();",
1))

# 6) xtNotifyMessage：原生桥钩子（固定契约 notify(title,text)）
E.append((
"      if (live.length < XT_TOAST_MAX) mountToast(item);\n      else queue.push(item);\n    } catch (e) { /* 通知失败绝不影响主流程 */ }",
"      // R72-5：原生桥（Android）系统通知——页内 toast 之前先尝试调用；\n      // 方法名 notify(title, text) 为与另一条线约定的固定契约（逐字一致），带空值兜底与长度上限。\n      try {\n        if (window.AndroidBridge && typeof window.AndroidBridge.notify === 'function') {\n          var nTitle = '星途 - 新消息';\n          var nText = String(name + '：' + (text == null ? '' : text)).replace(/\\s+/g, ' ').trim();\n          if (!nText) nText = '您有一条新消息';\n          if (nText.length > 100) nText = nText.slice(0, 100);\n          window.AndroidBridge.notify(nTitle, nText);\n        }\n      } catch (eN) { /* 原生桥不可用：忽略，绝不影响页内通知 */ }\n      if (live.length < XT_TOAST_MAX) mountToast(item);\n      else queue.push(item);\n    } catch (e) { /* 通知失败绝不影响主流程 */ }",
1))

# 7) showAboutDialog 兜底弹窗版本号
E.append((
"'<div style=\"font-size:15px;font-weight:800;color:#1a1b1c\">星途 v2.2</div>' +",
"'<div style=\"font-size:15px;font-weight:800;color:#1a1b1c\">星途 v2.3</div>' +",
1))

lone = run(P, E)
print('app.js edited; loneLF=%d' % lone)
