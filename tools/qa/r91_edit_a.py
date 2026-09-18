# -*- coding: utf-8 -*-
"""R91-A 线性编辑脚本：xt-profile.js + server/routers/ai.py
二进制读写，逐条替换，每条替换前断言唯一命中，写后回读校验。
结果写入 tools/qa/r91_edit_result.txt
"""
import io, os, sys

ROOT = r'D:\下载的文件\学习工作台'
JS_PATH = os.path.join(ROOT, 'assets', 'xt-profile.js')
PY_PATH = os.path.join(ROOT, 'server', 'routers', 'ai.py')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def line_stats(data):
    crlf = data.count(b'\r\n')
    # lone LF = LF not preceded by CR
    lone_lf = 0
    idx = 0
    while True:
        i = data.find(b'\n', idx)
        if i < 0:
            break
        if i == 0 or data[i-1:i] != b'\r':
            lone_lf += 1
        idx = i + 1
    # lone CR = CR not followed by LF
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_lf, lone_cr

def get_lines(data, a, b):
    """取原始字节中第 a..b 行（1 基，含端点），保留各自行尾。"""
    lines = data.split(b'\r\n')
    # split 后最后一元素是尾随空串（若以 \r\n 结尾）
    sel = lines[a-1:b]
    return b'\r\n'.join(sel)

def apply(data, name, old, new):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d (expect 1)' % (name, cnt))
    nd = data.replace(old, new, 1)
    if nd.count(new) != 1 or old in nd:
        raise SystemExit('ABORT: %s post-check failed' % name)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

def L(*lines):
    return b'\r\n'.join(x.encode('utf-8') for x in lines)

# ---------------- xt-profile.js ----------------
with open(JS_PATH, 'rb') as f:
    js0 = f.read()
crlf0, llf0, lcr0 = line_stats(js0)
w('xt-profile.js BEFORE: size=%d crlf=%d loneLF=%d loneCR=%d' % (len(js0), crlf0, llf0, lcr0))
if llf0 or lcr0:
    raise SystemExit('ABORT: xt-profile.js 行尾不纯，拒绝编辑')

# R1 chatBadge（原 570-574 行）
r1_old = get_lines(js0, 570, 574)
r1_new = L(
"  function chatBadge() {",
"    /* R91-A：角标改本机口径——不再读取服务端条数（AI_CHAT.total），只按本机会话数显示 */",
"    var n = localChatCount();",
"    return n > 0 ? String(n) : '';",
"  }",
)

# R2 chatServerHtml 整体移除（原 1531-1540 行）
r2_old = get_lines(js0, 1531, 1540)
r2_new = L(
"  /** R91-A：服务端记录区块 chatServerHtml 已按产品要求整体移除——服务端聊天记录",
"   *  不再展示在「AI对话记录」页，本页仅保留 M5 本机会话管理；",
"   *  「清空全部」会同步调用 DELETE /api/ai/history 删除服务端记录。 */",
)

# R3 chatBodyHtml 重写（原 1541-1569 行）
r3_old = get_lines(js0, 1541, 1569)
r3_new = L(
"  /** R91-A：不再有服务端三态（loading/err/guest），本视图只渲染 M5 本机会话管理面板，",
"   *  也不再发起 GET /api/ai/history 拉取（登录与否均可用）。 */",
"  function chatBodyHtml() {",
"    return m5PanelHtml();",
"  }",
)

# R4 bindChatView + paintChat 重写（原 1572-1598 行）
r4_old = get_lines(js0, 1572, 1598)
r4_new = L(
"  /** 打开子视图后：本地渲染 M5 面板并同步一次主页「AI对话记录」角标（R91-A：不再拉服务端） */",
"  function bindChatView(el) {",
"    var box = el.querySelector('#xtpChatBody');",
"    if (!box) { return; }",
"    paintChat(box);",
"    renderPage();",
"  }",
"  function paintChat(box) {",
"    box.innerHTML = chatBodyHtml();",
"    m5Bind(box);",
"  }",
)

# R5 prefetchAiChat 移除（原 1599-1608 行）
r5_old = get_lines(js0, 1599, 1608)
r5_new = L(
"  /* R91-A：prefetchAiChat 已移除——角标改本机口径，不再为角标预拉 GET /api/ai/history */",
)

# R11 M5 头注释更新（原 1618-1619 行）
r11_old = get_lines(js0, 1618, 1619)
r11_new = L(
"   *      **有 GET + POST(chat) + DELETE(history)（R91-A 新增 DELETE）** → 前端可清空服务端记录。",
"   *      故本页「管理」作用于【本机会话】；服务端记录不再展示（R91-A 移除 chatServerHtml），",
"   *      仅在「清空全部」时同步调用 DELETE /api/ai/history。",
)

# R9 quicktip（原 1894 行）
r9_old = get_lines(js0, 1894, 1894)
r9_new = L(
"      '<span class=\"xtp-m5-quicktip\">「清空全部」会同时删除本机与服务端记录；单条/批量删除仅作用于本机会话。</span></div>';",
)

# R7 m5PanelHtml srv/emptyTip（原 1909-1914 行）
r7_old = get_lines(js0, 1909, 1914)
r7_new = L(
"    var total = chatSessions().length;",
"    var hasFilter = !!(M5.kw.trim() || M5.tag || M5.favOnly || M5.range !== 'all');",
"    var emptyTip = (total === 0)",
"      ? '本机暂无会话记录。去 AI 问答页对话后，会自动出现在这里。'",
"      : '没有符合条件的对话（当前筛选：' + esc(m5ActiveFilterLabel()) + '，本机共 ' + total + ' 条）。';",
)

# R8 列表头（原 1919 行）
r8_old = get_lines(js0, 1919, 1919)
r8_new = L(
"      '<div class=\"xtp-chat-sub\">本机对话记录<span>可管理 · 共 ' + total + ' 条 · 当前 ' + list.length + ' 条</span></div>' +",
)

# R10 m5ClearAll（原 1928-1943 行）
r10_old = get_lines(js0, 1928, 1943)
r10_new = L(
"  /** 清空全部（二次确认，说明后果：不可恢复、条数；R91-A：同步删除服务端记录） */",
"  function m5ClearAll() {",
"    var n = chatSessions().length;",
"    var online = aiApiReady();",
"    if (!n && !online) { toast('本已无对话记录'); return; }",
"    var totalMsg = 0, arr = chatSessions(), i;",
"    for (i = 0; i < arr.length; i++) { totalMsg += (arr[i].messages || []).length; }",
"    var tip;",
"    if (n && online) {",
"      tip = '将删除本机全部 ' + n + ' 条会话（共 ' + totalMsg + ' 条消息），并同时删除服务端的全部对话记录，此操作不可恢复。\\n建议先「备份」。确定继续吗？';",
"    } else if (n) {",
"      tip = '将删除本机全部 ' + n + ' 条会话（共 ' + totalMsg + ' 条消息），此操作不可恢复。\\n（当前未登录，服务端记录无法在此删除）\\n建议先「备份」。确定继续吗？';",
"    } else {",
"      tip = '本机已无会话记录。将删除服务端的全部对话记录，此操作不可恢复。确定继续吗？';",
"    }",
"    confirmBox('清空全部对话记录', tip, '清空', true, function () {",
"      localStorage.removeItem('ai_chat_history');",
"      writeJSON(META_KEY, {});",
"      m5Reset();",
"      m5Repaint();",
"      if (!online) { toast('已清空本机会话（未登录，服务端记录未处理）'); renderPage(); return; }",
"      /* R91-A：同步删除服务端记录；失败则降级为只清本机并在 toast 如实说明 */",
"      window.api('/api/ai/history', { method: 'DELETE' }).then(function () {",
"        toast(n ? '已清空本机与服务端对话记录' : '已清空服务端对话记录');",
"        renderPage();",
"      })['catch'](function () {",
"        toast(n ? '已清空本机会话；服务端记录删除失败，请稍后重试' : '服务端记录删除失败，请稍后重试');",
"        renderPage();",
"      });",
"    });",
"  }",
)

# R6 boot 中的 prefetchAiChat() 调用（原 2816 行）
r6_old = get_lines(js0, 2816, 2816)
r6_new = L(
"    /* R91-A：不再预拉服务端对话记录（prefetchAiChat 已移除，角标改本机口径） */",
)

js = js0
js = apply(js, 'R1 chatBadge', r1_old, r1_new)
js = apply(js, 'R2 chatServerHtml remove', r2_old, r2_new)
js = apply(js, 'R3 chatBodyHtml', r3_old, r3_new)
js = apply(js, 'R4 bindChatView/paintChat', r4_old, r4_new)
js = apply(js, 'R5 prefetchAiChat remove', r5_old, r5_new)
js = apply(js, 'R6 boot call', r6_old, r6_new)
js = apply(js, 'R7 m5Panel emptyTip', r7_old, r7_new)
js = apply(js, 'R8 m5Panel sub header', r8_old, r8_new)
js = apply(js, 'R9 quicktip', r9_old, r9_new)
js = apply(js, 'R10 m5ClearAll', r10_old, r10_new)
js = apply(js, 'R11 M5 header comment', r11_old, r11_new)

with open(JS_PATH, 'wb') as f:
    f.write(js)
with open(JS_PATH, 'rb') as f:
    js1 = f.read()
crlf1, llf1, lcr1 = line_stats(js1)
w('xt-profile.js AFTER: size=%d crlf=%d loneLF=%d loneCR=%d (delta=%+d B)' % (len(js1), crlf1, llf1, lcr1, len(js1)-len(js0)))
if llf1 or lcr1 or js1 != js:
    raise SystemExit('ABORT: xt-profile.js 写后校验失败')
w('[OK] xt-profile.js 写后回读一致，纯 CRLF')

# ---------------- ai.py ----------------
with open(PY_PATH, 'rb') as f:
    py0 = f.read()
pcrlf0, pllf0, plcr0 = line_stats(py0)
w('ai.py BEFORE: size=%d crlf=%d loneLF=%d loneCR=%d' % (len(py0), pcrlf0, pllf0, plcr0))
if pllf0 or plcr0:
    raise SystemExit('ABORT: ai.py 行尾不纯，拒绝编辑')

# 在 GET /history 之后、POST /chat 之前插入 DELETE /history（原 196-199 行作锚）
anchor_old = get_lines(py0, 196, 199)
del_block = L(
'@router.delete("/history")',
'def ai_history_delete(ids: str = "", user: User = Depends(get_current_user),',
'                      db: Session = Depends(get_db)):',
'    """R91-A：删除我的 AI 对话记录（与 GET /history 同库同鉴权，按 user_id 隔离）。',
'',
'    - 不带 ids：清空本人全部记录（前端「AI对话记录管理 → 清空全部」调用）；',
'    - ids=1,2,3（可选）：仅删除指定主键 id 的本人记录，他人 id 静默忽略（不报错）。',
'    说明：ai_logs 为扁平消息表（无会话维度），故不支持按 session_id 删除；',
'    AiUsage（每日调用计数）与模型用量账本不受影响。',
'    """',
'    id_list: list[int] = []',
'    for part in ids.split(","):',
'        part = part.strip()',
'        if not part:',
'            continue',
'        try:',
'            id_list.append(int(part))',
'        except ValueError:',
'            raise HTTPException(400, f"非法的记录 id：{part}")',
'    q = db.query(AiLog).filter(AiLog.user_id == user.id)',
'    if id_list:',
'        q = q.filter(AiLog.id.in_(id_list))',
'    deleted = q.delete(synchronize_session=False)',
'    db.commit()',
'    return {"ok": True, "deleted": deleted}',
)
anchor_new = get_lines(py0, 196, 196) + b'\r\n\r\n' + del_block + b'\r\n\r\n' + b'@router.post("/chat")'

py = py0
py = apply(py, 'P1 DELETE /history', anchor_old, anchor_new)

with open(PY_PATH, 'wb') as f:
    f.write(py)
with open(PY_PATH, 'rb') as f:
    py1 = f.read()
pcrlf1, pllf1, plcr1 = line_stats(py1)
w('ai.py AFTER: size=%d crlf=%d loneLF=%d loneCR=%d (delta=%+d B)' % (len(py1), pcrlf1, pllf1, plcr1, len(py1)-len(py0)))
if pllf1 or plcr1 or py1 != py:
    raise SystemExit('ABORT: ai.py 写后校验失败')
w('[OK] ai.py 写后回读一致，纯 CRLF')

# ---------------- 命中核验 ----------------
def cnt(data, s):
    return data.count(s.encode('utf-8'))

checks = [
    ('xt: 「暂不支持删除」=0', cnt(js1, '暂不支持删除') == 0),
    ('xt: chatServerHtml( =0', cnt(js1, 'chatServerHtml(') == 0),
    ('xt: quicktip 旧文案=0', cnt(js1, '本页管理的是本机会话，服务端记录仅供查看') == 0),
    ('xt: 「服务端记录仍保留」=0', cnt(js1, '服务端记录仍保留') == 0),
    ('xt: DELETE 调用>=1', cnt(js1, "method: 'DELETE'") >= 1),
    ('xt: 「已清空本机与服务端对话记录」>=1', cnt(js1, '已清空本机与服务端对话记录') >= 1),
    ('xt: fetchAiChat 调用点=0（仅保留定义）', cnt(js1, 'fetchAiChat(') == 1),
    ('xt: prefetchAiChat 残留引用=0', cnt(js1, 'prefetchAiChat(') == 0),
    ('xt: AI_CHAT.total 展示引用=0', cnt(js1, 'AI_CHAT.total') == 0),
    ('py: @router.delete 存在', cnt(py1, '@router.delete("/history")') == 1),
]
allpass = True
for name, ok in checks:
    w('[%s] %s' % ('PASS' if ok else 'FAIL', name))
    if not ok:
        allpass = False
w('ALL=%s' % ('PASS' if allpass else 'FAIL'))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('edit-done')
