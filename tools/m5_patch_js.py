# -*- coding: utf-8 -*-
"""
R88-M5 patch · 个人资料页「AI 对话记录管理」全套
目标文件 assets/xt-profile.js（CRLF）
步骤：
  1) 在 prefetchAiChat 之后插入 M5 管理功能函数块（数据层 + 筛选 + 渲染 + 动作）
  2) 改写 chatBody()：外壳加入管理工具条与 #xtpChatBody
  3) 改写 bindChatView()/paintChat()：绑定 M5 事件
  4) 将 chatBodyHtml() 的本机区块替换为 M5 管理列表（服务端区块保持只读）
二进制读写保 CRLF；每步断言锚点唯一 + 复验行尾。
"""
import os

BASE = r"D:\下载的文件\学习工作台"
JS = os.path.join(BASE, "assets", "xt-profile.js")


def load(p):
    with open(p, "rb") as f:
        return f.read()


def save(p, b):
    with open(p, "wb") as f:
        f.write(b)


def check_eol(b, label):
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    assert lf - crlf == 0, label + " loneLF=" + str(lf - crlf)
    assert b.count(b"\r") - crlf == 0, label + " loneCR=" + str(b.count(b"\r") - crlf)


def B(s):
    return s.encode("utf-8")


def replace_once(b, anchor, repl, label):
    cnt = b.count(anchor)
    assert cnt == 1, label + " anchor count=" + str(cnt)
    return b.replace(anchor, repl, 1)


NL = "\r\n"

js = load(JS)
js_before = len(js)
check_eol(js, "xt-profile.js-before")
assert js_before == 108663, "unexpected size " + str(js_before)

# =====================================================================
# 1) 插入 M5 函数块（在 prefetchAiChat 函数结束、数字动画注释之前）
# =====================================================================
anchor_ins = B(
    "  function prefetchAiChat() {" + NL +
    "    try {" + NL +
    "      if (isOtherMode()) { return; }" + NL +
    "      if (!aiApiReady()) { return; }" + NL +
    "      fetchAiChat(false).then(function () {" + NL +
    "        if (AI_CHAT.phase === 'ok') { renderPage(); }" + NL +
    "      });" + NL +
    "    } catch (e) { /* 静默：预热失败不影响页面可用 */ }" + NL +
    "  }"
)

M5_BLOCK = r"""  /* ==================================================================== R88-M5
   * 个人资料页「AI 对话记录管理」（清空全部 / 分类标签 / 关键字搜索 / 单条删除 /
   * 批量删除 / 时间范围筛选 / 一键导出 / 本地备份与恢复 / 标记收藏）。
   * ---------------------------------------------------------------------------
   * 数据源与边界（调研结论，务必先读）：
   *   ① 本机 localStorage.ai_chat_history = 会话数组
   *      [{id:'chat_...', title, createdAt(ms), updatedAt(ms), messages:[{role,content,hasImage?}]}]
   *      （写入方 assets/ai-page.js:1286；最多 50 会话）。**有稳定 id** → 可单条删/打标/批量/导出/备份。
   *   ② 服务端 GET /api/ai/history 只返回**扁平消息**（无 id / 无标题 / 无标签），且服务端
   *      **只有 GET + POST(chat)，没有 DELETE/PATCH** → 前端无法删除/打标服务端记录。
   *      故本页「管理」作用于【本机会话】；服务端记录保持只读展示（chatServerHtml）。
   *   ③ 标签 / 收藏等扩展信息写入本页自有键 xt_ai_chat_meta_v1（按会话 id 索引），
   *      不污染 ai_chat_history 的既有结构（否则会破坏 ai-page.js 的读取）。
   * ---------------------------------------------------------------------------
   * 覆盖策略（备份恢复）：**按 id 合并**（导入中已存在的 id 以导入数据覆盖，不存在的新增）；
   *   理由：导入是「恢复备份」语义，合并可避免一键误操作把当前数据整体抹掉；同 id 覆盖保证
   *   备份里更新过的会话能还原。全量替换风险高（一次误点即丢全部现网数据），故不采用。
   * ------------------------------------------------------------------ */

  var META_KEY = 'xt_ai_chat_meta_v1';   // { [chatId]: { tags:[String], fav:Boolean } } */

  /** 会话列表（规范化，保证每条都有 id/title/createdAt/updatedAt/messages） */
  function chatSessions() {
    var arr = aiChatArr(), out = [], i;
    for (i = 0; i < arr.length; i++) {
      var c = arr[i] || {};
      if (!c || typeof c !== 'object') { continue; }
      var id = (c.id === undefined || c.id === null) ? '' : String(c.id);
      if (!id) { continue; }
      var msgs = isArr(c.messages) ? c.messages : [];
      var title = (c.title === undefined || c.title === null) ? '' : String(c.title);
      if (!title) { title = '未命名对话'; }
      out.push({
        id: id,
        title: title,
        createdAt: num(c.createdAt),
        updatedAt: num(c.updatedAt || c.createdAt),
        messages: msgs
      });
    }
    return out;
  }
  /** 会话最后活动时间（用于排序 / 时间筛选） */
  function sessionTs(s) { return num(s.updatedAt || s.createdAt); }
  /** 会话纯文本（标题 + 全部消息文本），用于关键字搜索 */
  function sessionText(s) {
    var t = (s.title || '') + ' ', ms = s.messages || [], i;
    for (i = 0; i < ms.length; i++) {
      var m = ms[i] || {};
      if (m.content) { t += String(m.content) + ' '; }
    }
    return t;
  }
  /** 会话预览（前 2 条消息各截 60 字） */
  function sessionPreview(s) {
    var ms = s.messages || [], out = [], i, n = 0;
    for (i = 0; i < ms.length && n < 2; i++) {
      var m = ms[i] || {};
      var txt = String(m.content || '').replace(/\s+/g, ' ').trim();
      if (!txt) { continue; }
      if (txt.length > 60) { txt = txt.slice(0, 60) + '…'; }
      out.push((m.role === 'user' ? '我：' : 'AI：') + txt);
      n++;
    }
    return out.length ? out.join(' / ') : '（无文本内容）';
  }
  /** 读会话扩展信息表 */
  function chatMetaAll() {
    var m = readJSON(META_KEY, {});
    return (m && typeof m === 'object' && !isArr(m)) ? m : {};
  }
  /** 取某会话扩展信息（始终返回对象，缺省 tags=[] fav=false） */
  function chatMetaOf(id) {
    var all = chatMetaAll(), k = String(id), e = all[k];
    if (!e || typeof e !== 'object') { e = {}; }
    return { tags: isArr(e.tags) ? e.tags : [], fav: !!e.fav };
  }
  /** 写某会话扩展信息（tags 去空去重、截断到 8 个；空标签与未收藏则删除该键，保持存储干净） */
  function chatMetaSet(id, patch) {
    var all = chatMetaAll(), k = String(id);
    var cur = chatMetaOf(k);
    if (patch && has(patch, 'tags')) {
      var t = [], seen = {}, i, j;
      var src = isArr(patch.tags) ? patch.tags : [];
      for (i = 0; i < src.length; i++) {
        var v = String(src[i] === null || src[i] === undefined ? '' : src[i]).trim();
        if (!v || v.length > 12) { continue; }
        var dup = false;
        for (j = 0; j < t.length; j++) { if (t[j] === v) { dup = true; break; } }
        if (!dup) { t.push(v); }
        if (t.length >= 8) { break; }
      }
      cur.tags = t;
    }
    if (patch && has(patch, 'fav')) { cur.fav = !!patch.fav; }
    if ((!cur.tags || !cur.tags.length) && !cur.fav) { delete all[k]; }
    else { all[k] = { tags: cur.tags || [], fav: !!cur.fav }; }
    writeJSON(META_KEY, all);
    return cur;
  }
  /** 清理扩展表中已不存在会话的孤儿键 */
  function chatMetaPrune(aliveIds) {
    var all = chatMetaAll(), keep = {}, i, k;
    for (i = 0; i < aliveIds.length; i++) { keep[String(aliveIds[i])] = true; }
    var next = {}, n = 0;
    for (k in all) {
      if (has(all, k) && keep[k]) { next[k] = all[k]; n++; }
    }
    writeJSON(META_KEY, next);
    return n;
  }
  /** 全部已用标签（去重、按出现顺序） */
  function chatAllTags(sessions) {
    var seen = {}, out = [], i, j;
    for (i = 0; i < sessions.length; i++) {
      var meta = chatMetaOf(sessions[i].id);
      for (j = 0; j < meta.tags.length; j++) {
        if (!seen[meta.tags[j]]) { seen[meta.tags[j]] = true; out.push(meta.tags[j]); }
      }
    }
    return out;
  }

  /* -------------------------------------------------- M5 视图状态（不跨会话持久化） */
  var M5 = {
    kw: '',            // 关键字
    tag: '',           // 标签筛选（'' = 全部）
    range: 'all',      // all | today | d7 | d30 | custom
    from: '',          // 自定义起始（YYYY-MM-DD）
    to: '',            // 自定义结束（YYYY-MM-DD）
    favOnly: false,    // 只看收藏
    selMode: false,    // 多选模式
    sel: {},           // 选中集合 { id:true }
    panel: ''          // '' | 'filter' | 'backup'
  };
  function m5Reset() { M5.sel = {}; }
  /** 时间范围 → [fromTs, toTs]（toTs 含当天末刻；0/-1 表示不限） */
  function m5RangeBounds() {
    var now = new Date();
    var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(); // 明日 0 点（当天含）
    if (M5.range === 'today') {
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to: endOfToday };
    }
    if (M5.range === 'd7') { return { from: endOfToday - 7 * 86400000, to: endOfToday }; }
    if (M5.range === 'd30') { return { from: endOfToday - 30 * 86400000, to: endOfToday }; }
    if (M5.range === 'custom') {
      return { from: m5DayTs(M5.from, false), to: m5DayTs(M5.to, true) };
    }
    return { from: 0, to: 0 };
  }
  /** 'YYYY-MM-DD' → 时间戳；endOfDay=true 取当天 23:59:59.999；空/非法返回 0（不限） */
  function m5DayTs(s, endOfDay) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) { return 0; }
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
      endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    var t = d.getTime();
    return isFinite(t) ? t : 0;
  }
  /** 过滤后的会话（最新在前） */
  function m5Filtered() {
    var all = chatSessions(), kw = M5.kw.trim().toLowerCase();
    var b = m5RangeBounds(), out = [], i;
    for (i = 0; i < all.length; i++) {
      var s = all[i], meta = chatMetaOf(s.id);
      if (M5.favOnly && !meta.fav) { continue; }
      if (M5.tag && meta.tags.indexOf(M5.tag) < 0) { continue; }
      if (b.from || b.to) {
        var ts = sessionTs(s);
        if (b.from && ts < b.from) { continue; }
        if (b.to && ts >= b.to) { continue; }
      }
      if (kw) {
        var hay = (sessionText(s) + ' ' + meta.tags.join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) { continue; }
      }
      out.push(s);
    }
    out.sort(function (a, c) { return sessionTs(c) - sessionTs(a); });
    return out;
  }

  /* -------------------------------------------------- M5 渲染 */
  function m5RangeLabel() {
    if (M5.range === 'today') { return '今天'; }
    if (M5.range === 'd7') { return '近 7 天'; }
    if (M5.range === 'd30') { return '近 30 天'; }
    if (M5.range === 'custom') {
      if (M5.from || M5.to) { return (M5.from || '…') + '~' + (M5.to || '…'); }
      return '自定义';
    }
    return '全部时间';
  }
  /** 顶部工具条：搜索 + 时间 + 标签 + 收藏 + 管理动作 */
  function m5ToolbarHtml() {
    var tags = chatAllTags(chatSessions());
    var tagOpts = '<option value="">全部标签</option>', i;
    for (i = 0; i < tags.length; i++) {
      tagOpts += '<option value="' + esc(tags[i]) + '"' + (M5.tag === tags[i] ? ' selected' : '') + '>' + esc(tags[i]) + '</option>';
    }
    var s = '<div class="xtp-m5-tools">' +
      '<div class="xtp-m5-search">' +
        '<span class="nav-icon" data-icon="search" data-icon-size="16"></span>' +
        '<input type="text" id="xtpM5Kw" placeholder="搜索标题 / 内容 / 标签" value="' + esc(M5.kw) + '">' +
        (M5.kw ? '<button type="button" class="xtp-m5-sclear" id="xtpM5Clear" title="清空">&times;</button>' : '') +
      '</div>' +
      '<div class="xtp-m5-filters">' +
        '<select id="xtpM5Range" class="xtp-m5-select" title="时间范围">' +
          '<option value="all"' + (M5.range === 'all' ? ' selected' : '') + '>全部时间</option>' +
          '<option value="today"' + (M5.range === 'today' ? ' selected' : '') + '>今天</option>' +
          '<option value="d7"' + (M5.range === 'd7' ? ' selected' : '') + '>近 7 天</option>' +
          '<option value="d30"' + (M5.range === 'd30' ? ' selected' : '') + '>近 30 天</option>' +
          '<option value="custom"' + (M5.range === 'custom' ? ' selected' : '') + '>自定义</option>' +
        '</select>' +
        '<select id="xtpM5Tag" class="xtp-m5-select" title="标签筛选">' + tagOpts + '</select>' +
        '<button type="button" class="xtp-m5-toggle' + (M5.favOnly ? ' on' : '') + '" id="xtpM5Fav"><span class="nav-icon" data-icon="star" data-icon-size="14"></span> 收藏</button>' +
        '<button type="button" class="xtp-m5-toggle' + (M5.selMode ? ' on' : '') + '" id="xtpM5SelBtn">' + (M5.selMode ? '取消多选' : '多选') + '</button>' +
      '</div>' +
      (M5.range === 'custom'
        ? '<div class="xtp-m5-custom">' +
            '<label>从 <input type="date" id="xtpM5From" value="' + esc(M5.from) + '"></label>' +
            '<label>到 <input type="date" id="xtpM5To" value="' + esc(M5.to) + '"></label>' +
          '</div>'
        : '') +
      '</div>';
    return s;
  }
  /** 底部动作条：清空全部 / 导出 / 备份 / 恢复（多选模式下换成批量操作条） */
  function m5ActionsHtml() {
    if (M5.selMode) {
      var cnt = m5SelCount();
      return '<div class="xtp-m5-batch">' +
        '<button type="button" class="xtp-m5-abtn" id="xtpM5SelAll">' + (m5AllSelected() ? '取消全选' : '全选') + '</button>' +
        '<span class="xtp-m5-selcnt">已选 ' + cnt + ' 条</span>' +
        '<button type="button" class="xtp-m5-abtn danger" id="xtpM5DelSel"' + (cnt ? '' : ' disabled') + '>删除所选</button>' +
        '</div>';
    }
    return '<div class="xtp-m5-actions">' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Export"><span class="nav-icon" data-icon="download" data-icon-size="15"></span> 导出</button>' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Backup"><span class="nav-icon" data-icon="save" data-icon-size="15"></span> 备份</button>' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Restore"><span class="nav-icon" data-icon="upload" data-icon-size="15"></span> 恢复</button>' +
      '<button type="button" class="xtp-m5-abtn danger" id="xtpM5ClearAll"><span class="nav-icon" data-icon="trash" data-icon-size="15"></span> 清空全部</button>' +
      '</div>';
  }
  function m5SelCount() { var k, n = 0; for (k in M5.sel) { if (has(M5.sel, k) && M5.sel[k]) { n++; } } return n; }
  function m5AllSelected() {
    var list = m5Filtered(), i;
    if (!list.length) { return false; }
    for (i = 0; i < list.length; i++) { if (!M5.sel[list[i].id]) { return false; } }
    return true;
  }
  /** 单条会话卡 */
  function m5CardHtml(s) {
    var meta = chatMetaOf(s.id);
    var tagsHtml = '', i;
    for (i = 0; i < meta.tags.length; i++) {
      tagsHtml += '<span class="xtp-m5-tag">' + esc(meta.tags[i]) + '</span>';
    }
    var checked = M5.sel[s.id] ? ' checked' : '';
    var selBox = M5.selMode
      ? '<label class="xtp-m5-check"><input type="checkbox" class="xtpM5Cb" data-id="' + esc(s.id) + '"' + checked + '></label>'
      : '';
    var star = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon' + (meta.fav ? ' on' : '') + ' xtpM5Fav" data-id="' + esc(s.id) + '" title="收藏"><span class="nav-icon" data-icon="star" data-icon-size="15"></span></button>';
    var tagBtn = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon xtpM5Tag" data-id="' + esc(s.id) + '" title="标签"><span class="nav-icon" data-icon="tag" data-icon-size="15"></span></button>';
    var delBtn = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon danger xtpM5Del" data-id="' + esc(s.id) + '" title="删除"><span class="nav-icon" data-icon="trash" data-icon-size="15"></span></button>';
    return '<div class="xtp-li xtp-m5-card" data-id="' + esc(s.id) + '">' +
      selBox +
      '<div class="xtp-m5-body">' +
        '<div class="xtp-li-title">' + esc(s.title) +
          '<span class="xtp-m5-cnt">' + esc(String((s.messages || []).length)) + ' 条</span></div>' +
        '<div class="xtp-li-meta">' + esc(fmtTime(tsText(sessionTs(s)))) + (tagsHtml ? '' : '') + '</div>' +
        '<div class="xtp-li-body">' + esc(sessionPreview(s)) + '</div>' +
        (tagsHtml ? '<div class="xtp-m5-tags">' + tagsHtml + '</div>' : '') +
      '</div>' +
      '<div class="xtp-m5-ops">' + star + tagBtn + delBtn + '</div>' +
      '</div>';
  }
  /** M5 管理列表（含工具条 + 列表 + 动作条） */
  function m5PanelHtml() {
    var list = m5Filtered(), i, s = '';
    for (i = 0; i < list.length; i++) { s += m5CardHtml(list[i]); }
    var total = chatSessions().length;
    var emptyTip = (total === 0)
      ? '暂无本机 AI 对话记录。在 AI 问答页对话后会自动出现在这里。'
      : '没有符合条件的对话，试试调整搜索 / 筛选条件。';
    return m5ToolbarHtml() +
      '<div class="xtp-chat-sub">本机对话记录<span>可管理 · 共 ' + total + ' 条 · 当前 ' + list.length + ' 条</span></div>' +
      (list.length
        ? '<section class="xtp-sec"><div class="xtp-list">' + s + '</div></section>'
        : '<div class="xtp-empty">' + esc(emptyTip) + '</div>') +
      m5ActionsHtml();
  }

  /* -------------------------------------------------- M5 动作 */
  /** 清空全部（二次确认，说明后果：不可恢复、条数） */
  function m5ClearAll() {
    var n = chatSessions().length;
    if (!n) { toast('本已无对话记录'); return; }
    var totalMsg = 0, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { totalMsg += (arr[i].messages || []).length; }
    confirmBox('清空全部对话记录',
      '将删除本机全部 ' + n + ' 条会话（共 ' + totalMsg + ' 条消息），此操作不可恢复。\n建议先「备份」。确定继续吗？',
      '清空', true, function () {
        localStorage.removeItem('ai_chat_history');
        writeJSON(META_KEY, {});
        m5Reset();
        m5Repaint();
        toast('已清空全部对话记录');
      });
  }
  /** 单条删除（二次确认） */
  function m5DelOne(id) {
    var s = null, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { if (arr[i].id === String(id)) { s = arr[i]; break; } }
    if (!s) { return; }
    confirmBox('删除这条对话',
      '将删除「' + s.title + '」（' + (s.messages || []).length + ' 条消息），不可恢复。确定删除吗？',
      '删除', true, function () {
        var list = chatSessions(), out = [], j;
        for (j = 0; j < list.length; j++) { if (list[j].id !== String(id)) { out.push(list[j]); } }
        m5WriteSessions(out);
        var meta = chatMetaAll(); if (has(meta, String(id))) { delete meta[String(id)]; writeJSON(META_KEY, meta); }
        delete M5.sel[String(id)];
        m5Repaint();
        toast('已删除');
      });
  }
  /** 批量删除所选（二次确认） */
  function m5DelSelected() {
    var ids = [], k;
    for (k in M5.sel) { if (has(M5.sel, k) && M5.sel[k]) { ids.push(k); } }
    if (!ids.length) { toast('未选择任何对话'); return; }
    confirmBox('批量删除对话',
      '将删除所选 ' + ids.length + ' 条对话，此操作不可恢复。确定删除吗？',
      '删除', true, function () {
        var list = chatSessions(), out = [], i, j, del = {}, meta = chatMetaAll();
        for (i = 0; i < ids.length; i++) { del[ids[i]] = true; }
        for (i = 0; i < list.length; i++) { if (!del[list[i].id]) { out.push(list[i]); } }
        m5WriteSessions(out);
        for (j = 0; j < ids.length; j++) { if (has(meta, ids[j])) { delete meta[ids[j]]; } }
        writeJSON(META_KEY, meta);
        M5.sel = {};
        M5.selMode = false;
        m5Repaint();
        toast('已删除 ' + ids.length + ' 条');
      });
  }
  /** 打标（输入框弹层，逗号分隔） */
  function m5EditTags(id) {
    var s = null, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { if (arr[i].id === String(id)) { s = arr[i]; break; } }
    if (!s) { return; }
    var meta = chatMetaOf(s.id);
    var cur = meta.tags.join(', ');
    var mask = openModal(
      '<div class="xtp-modal-title">编辑标签</div>' +
      '<div class="xtp-modal-tip">为「' + esc(s.title) + '」设置标签，多个标签用逗号分隔（最多 8 个，每个 ≤12 字）。</div>' +
      '<input type="text" class="xtp-modal-input" id="xtpM5TagInput" style="margin-top:12px" value="' + esc(cur) + '" placeholder="如：学习 / 重要 / 待整理">' +
      '<div class="xtp-modal-actions"><button type="button" id="xtpM5TagCancel">取消</button>' +
      '<button type="button" class="primary" id="xtpM5TagOk">保存</button></div>'
    );
    var inp = mask.querySelector('#xtpM5TagInput');
    if (inp && inp.focus) { inp.focus(); }
    mask.querySelector('#xtpM5TagCancel').addEventListener('click', closeModal);
    mask.querySelector('#xtpM5TagOk').addEventListener('click', function () {
      var parts = String((inp && inp.value) || '').split(/[,，]/);
      chatMetaSet(s.id, { tags: parts });
      closeModal();
      m5Repaint();
      toast('标签已更新');
    });
  }
  /** 切换收藏 */
  function m5ToggleFav(id) {
    var meta = chatMetaOf(id);
    chatMetaSet(id, { fav: !meta.fav });
    m5Repaint();
  }

  /* -------------------------------------------------- 导出 / 备份 / 恢复 */
  function m5Stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  /** 组装导出/备份包（exports：'full'=全部本机会话+元信息；'filtered'=当前筛选结果） */
  function m5Pack(scope) {
    var sessions = (scope === 'filtered') ? m5Filtered() : chatSessions();
    var meta = chatMetaAll(), metaOut = {}, i;
    for (i = 0; i < sessions.length; i++) {
      var id = sessions[i].id;
      if (has(meta, id)) { metaOut[id] = meta[id]; }
    }
    return {
      type: 'xt-ai-chat-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: sessions.length,
      sessions: sessions,
      meta: metaOut
    };
  }
  /** 触发浏览器下载（file:// 下 a[download] 亦可用；失败回退复制） */
  function m5Download(obj, filename) {
    var text = JSON.stringify(obj, null, 2);
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { } }, 0);
      toast('已导出：' + filename);
      return true;
    } catch (e) {
      // 老内核无 Blob/URL 或下载被拦：回退复制到剪贴板
      copyText(text, '导出数据');
      return false;
    }
  }
  function m5Export() {
    var all = chatSessions();
    if (!all.length) { toast('暂无可导出的记录'); return; }
    m5Download(m5Pack('full'), 'ai-chat-export_' + m5Stamp() + '.json');
  }
  function m5Backup() {
    var all = chatSessions();
    if (!all.length) { toast('暂无可备份的记录'); return; }
    m5Download(m5Pack('full'), 'ai-chat-backup_' + m5Stamp() + '.json');
  }
  /** 恢复：选择 JSON 文件 → 解析校验 → 二次确认（说明覆盖策略）→ 按 id 合并 */
  function m5Restore() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      try { document.body.removeChild(inp); } catch (e) { }
      if (!f) { return; }
      var rdr = new FileReader();
      rdr.onload = function () {
        var data = null;
        try { data = JSON.parse(String(rdr.result || '')); } catch (e) { data = null; }
        var sessions = (data && isArr(data.sessions)) ? data.sessions : null;
        if (!sessions) { toast('文件格式不正确，未导入', true); return; }
        // 校验：至少要有若干可用会话
        var ok = [], i;
        for (i = 0; i < sessions.length; i++) {
          var c = sessions[i] || {};
          if (c && typeof c === 'object' && (c.id !== undefined && c.id !== null) && String(c.id)) { ok.push(c); }
        }
        if (!ok.length) { toast('文件中没有可导入的对话记录', true); return; }
        var curN = chatSessions().length;
        confirmBox('恢复对话记录',
          '文件含 ' + ok.length + ' 条对话。将与本机现有 ' + curN + ' 条【按 id 合并】：' +
          '相同 id 以文件数据覆盖，新 id 追加。此操作会改写本机记录，确定导入吗？',
          '导入', false, function () {
            var merged = m5Merge(ok, data && data.meta);
            m5Repaint();
            toast('已导入，合并后共 ' + merged + ' 条');
          });
      };
      rdr.onerror = function () { toast('读取文件失败', true); };
      try { rdr.readAsText(f); } catch (e) { toast('无法读取该文件', true); }
    });
    inp.click();
  }
  /** 按 id 合并导入会话 + 元信息；返回合并后总条数 */
  function m5Merge(importSessions, importMeta) {
    var cur = chatSessions(), idx = {}, out = [], i;
    for (i = 0; i < cur.length; i++) { idx[cur[i].id] = i; out.push(cur[i]); }
    for (i = 0; i < importSessions.length; i++) {
      var c = importSessions[i] || {};
      var id = String(c.id);
      var msgs = isArr(c.messages) ? c.messages : [];
      var rec = {
        id: id,
        title: (c.title === undefined || c.title === null || c.title === '') ? '未命名对话' : String(c.title),
        createdAt: num(c.createdAt),
        updatedAt: num(c.updatedAt || c.createdAt),
        messages: msgs
      };
      if (has(idx, id)) { out[idx[id]] = rec; } else { idx[id] = out.length; out.push(rec); }
    }
    m5WriteSessions(out);
    // 合并元信息
    if (importMeta && typeof importMeta === 'object' && !isArr(importMeta)) {
      var all = chatMetaAll(), k;
      for (k in importMeta) {
        if (!has(importMeta, k)) { continue; }
        var e = importMeta[k] || {};
        var tags = isArr(e.tags) ? e.tags : [];
        var fav = !!e.fav;
        if (tags.length || fav) { all[k] = { tags: tags, fav: fav }; }
      }
      writeJSON(META_KEY, all);
    }
    // 清理孤儿元信息
    var ids = [], j;
    for (j = 0; j < out.length; j++) { ids.push(out[j].id); }
    chatMetaPrune(ids);
    return out.length;
  }
  /** 写回 ai_chat_history（仅用规范化字段，保持 ai-page.js 可读） */
  function m5WriteSessions(list) {
    writeJSON('ai_chat_history', list);
  }

  /* -------------------------------------------------- M5 重绘与事件绑定 */
  function m5Repaint() {
    var box = $('xtpChatBody');
    if (box) { paintChat(box); }
  }
  function m5Bind(root) {
    if (!root) { return; }
    var q;
    // 搜索框（输入防抖 200ms）
    var kw = root.querySelector('#xtpM5Kw');
    if (kw) {
      var t = null;
      kw.addEventListener('input', function () {
        if (t) { clearTimeout(t); }
        t = setTimeout(function () {
          M5.kw = String(kw.value || '');
          m5Reset();
          m5Repaint();
          var nk = $('xtpM5Kw'); if (nk && nk.focus && nk.setSelectionRange) { try { nk.focus(); nk.setSelectionRange(nk.value.length, nk.value.length); } catch (e) { } }
        }, 200);
      });
    }
    q = root.querySelector('#xtpM5Clear');
    if (q) { q.addEventListener('click', function () { M5.kw = ''; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5Range');
    if (q) { q.addEventListener('change', function () { M5.range = q.value || 'all'; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5Tag');
    if (q) { q.addEventListener('change', function () { M5.tag = q.value || ''; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5From');
    if (q) { q.addEventListener('change', function () { M5.from = q.value || ''; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5To');
    if (q) { q.addEventListener('change', function () { M5.to = q.value || ''; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5Fav');
    if (q) { q.addEventListener('click', function () { M5.favOnly = !M5.favOnly; m5Reset(); m5Repaint(); }); }
    q = root.querySelector('#xtpM5SelBtn');
    if (q) { q.addEventListener('click', function () { M5.selMode = !M5.selMode; M5.sel = {}; m5Repaint(); }); }
    q = root.querySelector('#xtpM5SelAll');
    if (q) { q.addEventListener('click', function () {
      if (m5AllSelected()) { M5.sel = {}; }
      else { var list = m5Filtered(), i; for (i = 0; i < list.length; i++) { M5.sel[list[i].id] = true; } }
      m5Repaint();
    }); }
    q = root.querySelector('#xtpM5DelSel');
    if (q) { q.addEventListener('click', m5DelSelected); }
    q = root.querySelector('#xtpM5ClearAll');
    if (q) { q.addEventListener('click', m5ClearAll); }
    q = root.querySelector('#xtpM5Export');
    if (q) { q.addEventListener('click', m5Export); }
    q = root.querySelector('#xtpM5Backup');
    if (q) { q.addEventListener('click', m5Backup); }
    q = root.querySelector('#xtpM5Restore');
    if (q) { q.addEventListener('click', m5Restore); }
    // 列表内：多选框 / 收藏 / 标签 / 删除
    var boxes = root.querySelectorAll('.xtpM5Cb'), i;
    for (i = 0; i < boxes.length; i++) {
      boxes[i].addEventListener('change', function (ev) {
        var id = ev.target.getAttribute('data-id');
        if (ev.target.checked) { M5.sel[id] = true; } else { delete M5.sel[id]; }
        m5Repaint();
      });
    }
    var favs = root.querySelectorAll('.xtpM5Fav'), j;
    for (j = 0; j < favs.length; j++) {
      favs[j].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5ToggleFav(ev.currentTarget.getAttribute('data-id'));
      });
    }
    var tagbs = root.querySelectorAll('.xtpM5Tag'), m;
    for (m = 0; m < tagbs.length; m++) {
      tagbs[m].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5EditTags(ev.currentTarget.getAttribute('data-id'));
      });
    }
    var dels = root.querySelectorAll('.xtpM5Del'), p;
    for (p = 0; p < dels.length; p++) {
      dels[p].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5DelOne(ev.currentTarget.getAttribute('data-id'));
      });
    }
  }"""

# 源码 .py 为 LF，块内实际是 \n → 统一转 CRLF 后再编码
M5_BLOCK_CRLF = M5_BLOCK.replace("\r\n", "\n").replace("\n", NL)
block_bytes = B(anchor_ins.decode("utf-8") + NL + M5_BLOCK_CRLF)
js = replace_once(js, anchor_ins, block_bytes, "M5-block")

check_eol(js, "xt-profile.js-after-block")
save(JS, js)
print("STEP1 M5 block inserted  bytes " + str(js_before) + " -> " + str(len(js)))
