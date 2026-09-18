# -*- coding: utf-8 -*-
"""R74-B 好友资料页优化 —— 字节级补丁脚本
改动文件：assets/xt-profile.js / assets/xt-profile.css / assets/api.js
（chat-local.js 本批无改动，仅做备份）
"""
import os
import shutil
import sys

ROOT = r'D:\下载的文件\学习工作台'
ASSETS = os.path.join(ROOT, 'assets')
BAK = '.bak-pre-r74-20260917'


def rd(p):
    with open(p, 'rb') as f:
        return f.read()


def wr(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def assert_crlf_only(b, name):
    """确认没有裸 LF（每个 \\n 前必是 \\r）"""
    bad = 0
    for i in range(len(b)):
        if b[i:i + 1] == b'\n' and b[i - 1:i] != b'\r':
            bad += 1
    assert bad == 0, '%s has %d bare LF' % (name, bad)


# ---------------------------------------------------------------- 备份
for fn in ['xt-profile.js', 'xt-profile.css', 'api.js', 'chat-local.js']:
    src = os.path.join(ASSETS, fn)
    dst = src + BAK
    if not os.path.exists(dst):
        shutil.copy2(src, dst)
        print('[backup] created', dst)
    else:
        print('[backup] exists ', dst)

# ================================================================ xt-profile.js
p = os.path.join(ASSETS, 'xt-profile.js')
raw = rd(p)
assert_crlf_only(raw, 'xt-profile.js(before)')
data = raw.decode('utf-8')
# 全文件统一 CRLF → 先归一为 \n 做替换，再统一还原 CRLF
assert '\r' not in data.replace('\r\n', ''), 'unexpected lone CR'
data = data.replace('\r\n', '\n')

def rep(s, old, new, tag):
    n = s.count(old)
    assert n == 1, 'tag %r: expected 1 occurrence, got %d' % (tag, n)
    return s.replace(old, new)

# ---- R1: TA 状态缓存 + otherHeroHtml 头部 ----
data = rep(data, """  /** TA hero：视觉与本人 hero 一致，但**不挂 data-act="edit"**、头像不可点、无右箭头。
      注意：不使用 id="xtpHero"/"xtpHeroAvatar"，故 bindHero() 在 TA 视角不会绑定任何行为。 */
  function otherHeroHtml(uid, u) {
    var name = String((u && u.nickname) || '').trim() || 'TA';
""", """  /* R74-B TA 视角页状态（模块级缓存：渲染函数与事件委托统一读最新值，重绘不重复绑定） */
  var OTHER_UID = '';           // 当前查看的服务端数字 uid
  var OTHER_USER = null;        // GET /api/users/{uid} 返回的用户对象（公开白名单字段）
  var OTHER_REMARK = '';        // 好友备注名（仅好友态；来源 GET /api/friends 列表项 peerRemark）
  var OTHER_MOMENT_COUNT = -1;  // 动态条数（<0 = 未知，不显示数值）
  var OTHER_MOMENTS = null;     // null=加载中；'forbidden'=仅好友可见；'error'=加载失败；数组=最近动态

  /** TA hero：视觉与本人 hero 一致，但**不挂 data-act="edit"**、头像不可点、无右箭头。
      R74-B：右侧新增操作区（好友 = 发消息 + 删除好友；非好友 = 加好友）；
      ID 显示服务端数字 uid（GET /api/users/{uid} 的 id 字段，URL 参数兜底）；
      好友且已设置备注名时，昵称旁显示备注名胶囊。
      注意：不使用 id="xtpHero"/"xtpHeroAvatar"，故 bindHero() 在 TA 视角不会绑定任何行为。 */
  function otherHeroHtml(uid, u) {
    var name = String((u && u.nickname) || '').trim() || 'TA';
    var isFriend = !!(u && u.isFriend === true);
    var remark = isFriend ? String(OTHER_REMARK || '').trim() : '';
""", 'R1-hero-head')

# ---- R2: hero 尾部（备注胶囊 + 服务端 uid + 右侧操作区）+ otherHeroActsHtml ----
data = rep(data, """    var metaHtml = meta.length
      ? '<div class="xtp-hero-id" style="color:var(--xtp-aux)">' + esc(meta.join(' · ')) + '</div>'
      : '';
    return '<section class="xtp-hero" id="xtpHeroOther" style="cursor:default">' +
      '<div class="xtp-hero-avatar" id="xtpOtherAvatar" style="cursor:default">' + avInner + '</div>' +
      '<div class="xtp-hero-main">' +
        '<div class="xtp-hero-name-row"><div class="xtp-hero-name">' + esc(name) + '</div></div>' +
        '<div class="xtp-hero-id">ID：<b>' + esc(String(uid)) + '</b></div>' +
        (motto ? '<div class="xtp-hero-motto">' + esc(motto) + '</div>' : '') +
        metaHtml +
      '</div>' +
      '</section>';
  }
""", """    var metaHtml = meta.length
      ? '<div class="xtp-hero-id" style="color:var(--xtp-aux)">' + esc(meta.join(' · ')) + '</div>'
      : '';
    var remarkHtml = remark
      ? '<span class="xtp-hero-remark" title="好友备注名">备注：' + esc(remark) + '</span>'
      : '';
    var sid = (u && u.id && /^\\d+$/.test(String(u.id))) ? String(u.id) : String(uid);
    return '<section class="xtp-hero xtp-hero-other" id="xtpHeroOther" style="cursor:default">' +
      '<div class="xtp-hero-avatar" id="xtpOtherAvatar" style="cursor:default">' + avInner + '</div>' +
      '<div class="xtp-hero-main">' +
        '<div class="xtp-hero-name-row"><div class="xtp-hero-name">' + esc(name) + '</div>' + remarkHtml + '</div>' +
        '<div class="xtp-hero-id">ID：<b>' + esc(sid) + '</b></div>' +
        (motto ? '<div class="xtp-hero-motto">' + esc(motto) + '</div>' : '') +
        metaHtml +
      '</div>' +
      otherHeroActsHtml(uid, u) +
      '</section>';
  }

  /** TA hero 右侧操作区（R74-B）：isFriend===true → 发消息 + 删除好友；false → 加好友；
      关系未知 → 不渲染。按钮统一 data-other-act，由 bindOtherActions 委托分发；
      样式 .xtp-hero-act（xt-profile.css）。 */
  function otherHeroActsHtml(uid, u) {
    var btns = '';
    if (u && u.isFriend === true) {
      btns += '<button class="xtp-hero-act" type="button" data-other-act="chat">' +
        '<span class="nav-icon" data-icon="message-square" data-icon-size="14"></span>发消息</button>';
      btns += '<button class="xtp-hero-act danger" type="button" data-other-act="delfriend">' +
        '<span class="nav-icon" data-icon="delete" data-icon-size="14"></span>删除好友</button>';
    } else if (u && u.isFriend === false) {
      btns += '<button class="xtp-hero-act primary" type="button" data-other-act="addfriend">' +
        '<span class="nav-icon" data-icon="user" data-icon-size="14"></span>加好友</button>';
    }
    if (!btns) { return ''; }
    return '<div class="xtp-hero-acts">' + btns + '</div>';
  }
""", 'R2-hero-tail')

# ---- R3: 移除独立动作区 otherActionsHtml（并入 hero） ----
data = rep(data, """  /** TA 动作区：isFriend===true → 「发消息」；false → 「加好友」；始终 → 「TA 的动态」。
      按钮样式复用全站 .btn / .btn-outline / .btn-primary（common.css）。 */
  function otherActionsHtml(uid, u) {
    var btns = '';
    if (u && u.isFriend === true) {
      btns += '<button class="btn btn-outline" type="button" data-other-act="chat">' +
        '<span class="nav-icon" data-icon="message-square" data-icon-size="14"></span> 发消息</button>';
    } else if (u && u.isFriend === false) {
      btns += '<button class="btn btn-primary" type="button" data-other-act="addfriend">' +
        '<span class="nav-icon" data-icon="user" data-icon-size="14"></span> 加好友</button>';
    }
    btns += '<button class="btn btn-outline" type="button" data-other-act="moments">' +
      '<span class="nav-icon" data-icon="rss" data-icon-size="14"></span> TA 的动态</button>';
    return '<div class="xtp-sec" id="xtpOtherActions" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:0">' + btns + '</div>';
  }
""", """  /* R74-B：原独立动作区（otherActionsHtml）已并入 hero 右侧操作区（otherHeroActsHtml）。 */
""", 'R3-drop-actions')

# ---- R4: otherGroupDefs（备注名行 + 动态列表组 + 非好友隐藏关于） + otherMomentsListHtml ----
data = rep(data, """  /** TA 分组（仅公开白名单字段；空值行不渲染）。
      momentCount < 0 表示条数未知 → 「TA 的动态」不显示数值。 */
  function otherGroupDefs(uid, u, momentCount) {
    var city = String((u && u.city) || '').trim();
    var goal = String((u && u.goal) || '').trim();
    var created = fmtDate(u && u.createdAt);
    var ptxt = presenceText(u && u.online, u && u.lastSeenAt);
    var aboutRows = [];
    if (city) { aboutRows.push({ icon: 'map', title: '地区', val: city, info: true }); }
    if (goal) { aboutRows.push({ icon: 'target', title: '目标', val: goal, info: true }); }
    if (created) { aboutRows.push({ icon: 'clock', title: '入驻时间', val: created, info: true }); }
    if (ptxt) { aboutRows.push({ icon: 'zap', title: '在线状态', val: ptxt, info: true }); }

    var notesCount = 0, hasNotes = false;
    if (u && isArr(u.notes)) { notesCount = u.notes.length; hasNotes = true; }
    else if (u && u.stats && typeof u.stats === 'object' && typeof u.stats.published === 'number') {
      notesCount = num(u.stats.published); hasNotes = true;
    }

    var momentsVal = (typeof momentCount === 'number' && momentCount >= 0) ? String(momentCount) : '';
    var contentRows = [
      { icon: 'rss', title: 'TA 的动态', val: momentsVal, href: '动态.html?user=' + encodeURIComponent(uid) },
      { icon: 'file-text', title: 'TA 的公开贴', val: hasNotes ? String(notesCount) : '', href: '社区.html' }
    ];

    var out = [];
    if (aboutRows.length) { out.push({ title: 'TA 的资料', rows: aboutRows }); }
    out.push({ title: 'TA 的内容', rows: contentRows });
    out.push({ title: '系统', rows: [{ icon: 'info', title: '关于', act: 'about' }] });
    return out;
  }
""", """  /** TA 分组（仅公开白名单字段；空值行不渲染）。
      R74-B：好友态「TA 的资料」首行新增「备注名」（点击弹层设置）；
      「TA 的动态」改为列表模块（otherMomentsListHtml：最近若干条 + 查看全部入口）；
      非好友态隐藏「系统 → 关于」。momentCount < 0 表示条数未知 → 不显示数值。 */
  function otherGroupDefs(uid, u, momentCount, moments) {
    var city = String((u && u.city) || '').trim();
    var goal = String((u && u.goal) || '').trim();
    var created = fmtDate(u && u.createdAt);
    var ptxt = presenceText(u && u.online, u && u.lastSeenAt);
    var aboutRows = [];
    if (u && u.isFriend === true) {
      aboutRows.push({ icon: 'pen', title: '备注名', val: String(OTHER_REMARK || '').trim() || '未设置', oact: 'remark' });
    }
    if (city) { aboutRows.push({ icon: 'map', title: '地区', val: city, info: true }); }
    if (goal) { aboutRows.push({ icon: 'target', title: '目标', val: goal, info: true }); }
    if (created) { aboutRows.push({ icon: 'clock', title: '入驻时间', val: created, info: true }); }
    if (ptxt) { aboutRows.push({ icon: 'zap', title: '在线状态', val: ptxt, info: true }); }

    var notesCount = 0, hasNotes = false;
    if (u && isArr(u.notes)) { notesCount = u.notes.length; hasNotes = true; }
    else if (u && u.stats && typeof u.stats === 'object' && typeof u.stats.published === 'number') {
      notesCount = num(u.stats.published); hasNotes = true;
    }

    var contentRows = [
      { icon: 'file-text', title: 'TA 的公开贴', val: hasNotes ? String(notesCount) : '', href: '社区.html' }
    ];

    var out = [];
    if (aboutRows.length) { out.push({ title: 'TA 的资料', rows: aboutRows }); }
    out.push({ title: 'TA 的内容', rows: contentRows });
    out.push({ title: 'TA 的动态', html: otherMomentsListHtml(uid, momentCount, moments) });
    if (!(u && u.isFriend === false)) {
      out.push({ title: '系统', rows: [{ icon: 'info', title: '关于', act: 'about' }] });
    }
    return out;
  }

  /** TA 的动态列表模块（R74-B）：最近若干条（文案 + 时间 + 图片数，样式复用 .xtp-li 卡片行），
      尾行「查看全部动态」入口 → 动态空间.html?user=<uid>。
      moments：null=加载中；'forbidden'=仅好友可见（非好友 403）；'error'=加载失败；数组=动态列表。 */
  function otherMomentsListHtml(uid, momentCount, moments) {
    var body = '';
    if (moments === 'forbidden') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">动态仅好友可见</div></div>';
    } else if (moments === 'error') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">动态加载失败，请稍后重试</div></div>';
    } else if (moments === null || typeof moments === 'undefined') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">加载中…</div></div>';
    } else if (!isArr(moments) || !moments.length) {
      body = '<div class="xtp-li"><div class="xtp-li-meta">TA 还没有发布动态</div></div>';
    } else {
      var max = moments.length < 5 ? moments.length : 5;
      for (var i = 0; i < max; i++) {
        var m = moments[i] || {};
        var txt = String(m.content || '').replace(/\\s+/g, ' ').trim();
        if (txt.length > 60) { txt = txt.slice(0, 60) + '…'; }
        var imgN = (isArr(m.images) && m.images.length) ? (' · ' + m.images.length + ' 张图片') : '';
        body += '<div class="xtp-li xtp-li-tap" data-other-act="moments">' +
          '<div class="xtp-li-body">' + esc(txt || '（无文字内容）') + '</div>' +
          '<div class="xtp-li-meta">' + esc(fmtTime(m.createdAt) || '时间未知') + esc(imgN) + '</div>' +
          '</div>';
      }
    }
    var momentsVal = (typeof momentCount === 'number' && momentCount >= 0) ? String(momentCount) : '';
    var entry = cellHtml({ icon: 'rss', title: '查看全部动态', val: momentsVal, href: '动态空间.html?user=' + encodeURIComponent(uid) });
    return body + entry;
  }
""", 'R4-groups')

# ---- R5: paintOther + otherRepaint ----
data = rep(data, """  /** TA 视角整页绘制（与 renderPage() 并列）。
      TA 视角**不存在**：学习记录 / 我的笔记 / 我的收藏 / 学习数据 / 作品集 /
      AI对话记录 / 退出登录 —— 这些均为本人专属，groupDefs() 不会在此使用。 */
  function paintOther(root, uid, u, momentCount) {
    var groups = otherGroupDefs(uid, u, momentCount);
    var html = otherHeroHtml(uid, u) + otherActionsHtml(uid, u);
    for (var gi = 0; gi < groups.length; gi++) { html += groupHtml(groups[gi]); }
    html += '<div class="xtp-tip">资料来自服务端公开信息；性别 / 生日 / 手机号 / 邮箱等隐私字段不对外展示。</div>';
    root.innerHTML = html;
    bindOtherActions(root, uid, u);
    if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    bindRoot();
  }
""", """  /** TA 视角整页绘制（与 renderPage() 并列）。
      TA 视角**不存在**：学习记录 / 我的笔记 / 我的收藏 / 学习数据 / 作品集 /
      AI对话记录 / 退出登录 —— 这些均为本人专属，groupDefs() 不会在此使用。
      R74-B：动作按钮并入 hero 右侧；「TA 的动态」为列表模块；
      moments 为可选参数（缺省沿用模块级缓存 OTHER_MOMENTS）。 */
  function paintOther(root, uid, u, momentCount, moments) {
    OTHER_UID = uid;
    OTHER_USER = u;
    if (typeof momentCount === 'number') { OTHER_MOMENT_COUNT = momentCount; }
    if (typeof moments !== 'undefined') { OTHER_MOMENTS = moments; }
    var groups = otherGroupDefs(uid, u, momentCount, moments);
    var html = otherHeroHtml(uid, u);
    for (var gi = 0; gi < groups.length; gi++) { html += groupHtml(groups[gi]); }
    html += '<div class="xtp-tip">资料来自服务端公开信息；性别 / 生日 / 手机号 / 邮箱等隐私字段不对外展示。</div>';
    root.innerHTML = html;
    bindOtherActions(root, uid, u);
    if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    bindRoot();
  }

  /** TA 视角局部重绘（R74-B：备注名保存等无需重新拉取时使用，基于模块级缓存） */
  function otherRepaint() {
    var root = $('xtProfileRoot');
    if (!root || !OTHER_USER) { return; }
    paintOther(root, OTHER_UID, OTHER_USER, OTHER_MOMENT_COUNT, OTHER_MOMENTS);
  }
""", 'R5-paint')

# ---- R6: bindOtherActions（委托到持久容器 + 防重复绑定） ----
data = rep(data, """  /** 动作区事件委托（按钮无 data-href/view/act，故与 bindRoot 的 if 链互不干扰） */
  function bindOtherActions(root, uid, u) {
    var box = root.querySelector ? root.querySelector('#xtpOtherActions') : null;
    if (!box) { return; }
    box.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== box) {
        if (el.getAttribute) {
          var a = el.getAttribute('data-other-act');
          if (a === 'chat') { location.href = '私聊.html?uid=' + encodeURIComponent(uid) + '&name=' + encodeURIComponent(String((u && u.nickname) || 'TA').trim() || 'TA'); return; }
          if (a === 'addfriend') { otherAddFriend(uid); return; }
          if (a === 'moments') { location.href = '动态.html?user=' + encodeURIComponent(uid); return; }
        }
        el = el.parentNode;
      }
    });
  }
""", """  /** 动作事件委托（R74-B：hero 右侧按钮 + 备注名行 + 动态列表行，统一 data-other-act）。
      绑定在持久容器 #xtProfileRoot 上（data-other-bound 防重复绑定），
      点击时读模块级缓存 OTHER_UID / OTHER_USER / OTHER_REMARK，保证重绘后行为最新；
      这些元素无 data-href/view/act，故与 bindRoot 的 if 链互不干扰。 */
  function bindOtherActions(root, uid, u) {
    OTHER_UID = uid;
    OTHER_USER = u;
    if (!root || root.getAttribute('data-other-bound') === '1') { return; }
    root.setAttribute('data-other-bound', '1');
    root.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== root) {
        if (el.getAttribute) {
          var a = el.getAttribute('data-other-act');
          if (a === 'chat') {
            var nm = String((OTHER_REMARK || (OTHER_USER && OTHER_USER.nickname)) || 'TA').trim() || 'TA';
            location.href = '私聊.html?uid=' + encodeURIComponent(OTHER_UID) + '&name=' + encodeURIComponent(nm);
            return;
          }
          if (a === 'addfriend') { otherAddFriend(OTHER_UID); return; }
          if (a === 'delfriend') { otherDelFriend(OTHER_UID, OTHER_USER); return; }
          if (a === 'remark') { otherSetRemark(OTHER_UID, OTHER_USER); return; }
          if (a === 'moments') { location.href = '动态空间.html?user=' + encodeURIComponent(OTHER_UID); return; }
        }
        el = el.parentNode;
      }
    });
  }
""", 'R6-bind')

# ---- R7: loadOtherMoments + loadOtherRemark + otherDelFriend + otherSetRemark ----
data = rep(data, """  /** TA 的动态条数（非好友 403 / 网络失败 → 静默降级，不显示数值、不弹错） */
  function loadOtherMomentCount(uid, onCount) {
    try {
      if (typeof window.api !== 'function') { return; }
      window.api('/api/moments/user/' + encodeURIComponent(uid) + '?limit=50', { method: 'GET' }).then(function (r) {
        var n = 0;
        if (r && isArr(r.items)) { n = r.items.length; }
        if (typeof onCount === 'function') { onCount(n); }
      })['catch'](function () { /* 静默：拿不到就不显示条数 */ });
    } catch (e) { /* 忽略 */ }
  }
""", """  /** TA 的最近动态 + 条数（R74-B：动态列表模块数据源）。
      onDone(count, moments)：count<0 = 条数未知；moments = 数组 / 'forbidden'（非好友 403，仅好友可见）/ 'error'。 */
  function loadOtherMoments(uid, onDone) {
    try {
      if (typeof window.api !== 'function') { if (onDone) { onDone(-1, 'error'); } return; }
      window.api('/api/moments/user/' + encodeURIComponent(uid) + '?limit=50', { method: 'GET' }).then(function (r) {
        var items = (r && isArr(r.items)) ? r.items : [];
        if (onDone) { onDone(items.length, items); }
      })['catch'](function (e) {
        var msg = String((e && e.message) || '');
        var forb = (msg.indexOf('403') >= 0 || msg.indexOf('好友') >= 0);
        if (onDone) { onDone(-1, forb ? 'forbidden' : 'error'); }
      });
    } catch (e2) { if (onDone) { onDone(-1, 'error'); } }
  }

  /** 好友备注名（R74-B，仅好友态拉取；来源 GET /api/friends 列表项的 peerRemark；失败静默为空） */
  function loadOtherRemark(uid, cb) {
    try {
      if (typeof window.api !== 'function') { if (cb) { cb(''); } return; }
      window.api('/api/friends', { method: 'GET' }).then(function (r) {
        var list = isArr(r) ? r : (r && isArr(r.items) ? r.items : []);
        var rmk = '';
        for (var i = 0; i < list.length; i++) {
          if (list[i] && Number(list[i].id) === Number(uid)) { rmk = String(list[i].peerRemark || ''); break; }
        }
        if (cb) { cb(rmk); }
      })['catch'](function () { if (cb) { cb(''); } });
    } catch (e) { if (cb) { cb(''); } }
  }

  /** 删除好友（R74-B）：uiConfirm 二次确认（本页未加载 app.js 时回退本页 confirmBox 弹层，
      绝不用原生 confirm）；DELETE /api/friends/{peer_id}；成功后重新拉取资料页
      （isFriend 变 false，hero 右侧切换为「加好友」）。 */
  function otherDelFriend(uid, u) {
    var nm = String((u && u.nickname) || 'TA');
    function doDel() {
      try {
        if (typeof window.api !== 'function') { toast('网络组件未就绪，请稍后重试', true); return; }
        window.api('/api/friends/' + encodeURIComponent(uid), { method: 'DELETE' }).then(function () {
          toast('已删除好友');
          OTHER_REMARK = '';
          setTimeout(function () { renderOtherPage(uid); }, 400);
        })['catch'](function (e) { toast('删除失败：' + ((e && e.message) ? e.message : e), true); });
      } catch (e2) { toast('删除失败，请稍后重试', true); }
    }
    var msg = '确定要删除好友「' + nm + '」吗？删除后将解除好友关系。';
    if (typeof window.uiConfirm === 'function') {
      window.uiConfirm(msg, '删除').then(function (ok) { if (ok) { doDel(); } });
    } else {
      confirmBox('删除好友', msg, '删除', true, doDel);
    }
  }

  /** 设置好友备注名（R74-B）：复用本页既有弹层输入 openFieldEditor（禁用原生 prompt）；
      PUT /api/friends/{peer_id}/remark（优先 api.js 的 apiSetFriendRemark 封装，最多 20 字符）；
      保存成功后昵称旁显示备注名（otherRepaint 局部重绘，不整页刷新）。 */
  function otherSetRemark(uid, u) {
    var nm = String((u && u.nickname) || 'TA');
    function afterSave(val) {
      OTHER_REMARK = String(val || '');
      toast(OTHER_REMARK ? '备注名已保存' : '备注名已清除');
      otherRepaint();
    }
    openFieldEditor({
      title: '好友备注名',
      value: String(OTHER_REMARK || ''),
      placeholder: '给「' + nm + '」设置备注名',
      maxLen: 20,
      note: '备注名仅自己可见，最多 20 个字符；留空保存即清除备注。',
      validate: function (v) { return v.length > 20 ? '备注名最多 20 个字符' : ''; },
      onSave: function (v) {
        var val = String(v || '').slice(0, 20);
        try {
          if (typeof window.apiSetFriendRemark === 'function') {
            window.apiSetFriendRemark(uid, val).then(function () { afterSave(val); })['catch'](function (e) { toast('保存失败：' + ((e && e.message) ? e.message : e), true); });
          } else if (typeof window.api === 'function') {
            window.api('/api/friends/' + encodeURIComponent(uid) + '/remark', { method: 'PUT', body: { remark: val } }).then(function () { afterSave(val); })['catch'](function (e) { toast('保存失败：' + ((e && e.message) ? e.message : e), true); });
          } else {
            toast('网络组件未就绪，请稍后重试', true);
          }
        } catch (e2) { toast('保存失败，请稍后重试', true); }
      }
    });
  }
""", 'R7-loaders')

# ---- R8: renderOtherPage（并行拉备注名 + 动态列表，各自就绪后局部重绘） ----
data = rep(data, """  /** TA 视角渲染入口（需已登录）：拉 /api/users/{uid} → 绘制；isMe 则回本人视角。 */
  function renderOtherPage(uid) {
    var root = $('xtProfileRoot');
    if (!root) { return; }
    root.innerHTML = '<div class="xtp-empty">加载中…</div>';
    var done = false;
    function fail(msg) {
      if (done) { return; }
      done = true;
      root.innerHTML = '<div class="xtp-empty">' + esc(msg || '加载失败') + '</div>';
    }
    try {
      if (typeof window.api !== 'function') { fail('网络组件未就绪，请稍后重试'); return; }
      window.api('/api/users/' + encodeURIComponent(uid), { method: 'GET' }).then(function (u) {
        if (done) { return; }
        if (!u || typeof u !== 'object') { fail('用户不存在'); return; }
        // 服务端已算好 isMe（等价于用 /api/auth/me 的 id 与 viewUid() 比较）；
        // 是自己则回到不带参数的本人视角，避免历史里留两条。
        if (u.isMe === true) { done = true; location.replace('个人资料.html'); return; }
        done = true;
        paintOther(root, uid, u, -1);
        loadOtherMomentCount(uid, function (n) { paintOther(root, uid, u, n); });
      })['catch'](function (e) { fail((e && e.message) ? e.message : '加载失败'); });
    } catch (e2) { fail('加载失败'); }
  }
""", """  /** TA 视角渲染入口（需已登录）：拉 /api/users/{uid} → 绘制；isMe 则回本人视角。
      R74-B：好友态并行拉取备注名与最近动态列表，各自就绪后局部重绘（otherRepaint）。 */
  function renderOtherPage(uid) {
    var root = $('xtProfileRoot');
    if (!root) { return; }
    root.innerHTML = '<div class="xtp-empty">加载中…</div>';
    OTHER_UID = uid;
    OTHER_USER = null;
    OTHER_REMARK = '';
    OTHER_MOMENT_COUNT = -1;
    OTHER_MOMENTS = null;
    var done = false;
    function fail(msg) {
      if (done) { return; }
      done = true;
      root.innerHTML = '<div class="xtp-empty">' + esc(msg || '加载失败') + '</div>';
    }
    try {
      if (typeof window.api !== 'function') { fail('网络组件未就绪，请稍后重试'); return; }
      window.api('/api/users/' + encodeURIComponent(uid), { method: 'GET' }).then(function (u) {
        if (done) { return; }
        if (!u || typeof u !== 'object') { fail('用户不存在'); return; }
        // 服务端已算好 isMe（等价于用 /api/auth/me 的 id 与 viewUid() 比较）；
        // 是自己则回到不带参数的本人视角，避免历史里留两条。
        if (u.isMe === true) { done = true; location.replace('个人资料.html'); return; }
        done = true;
        OTHER_USER = u;
        otherRepaint();
        // 好友备注名（仅好友态拉取，失败静默不显示）
        if (u.isFriend === true) {
          loadOtherRemark(uid, function (rmk) {
            if (OTHER_USER === u) { OTHER_REMARK = String(rmk || ''); otherRepaint(); }
          });
        }
        // 最近动态列表（非好友 403 → 「仅好友可见」占位）
        loadOtherMoments(uid, function (count, moments) {
          if (OTHER_USER === u) { OTHER_MOMENT_COUNT = count; OTHER_MOMENTS = moments; otherRepaint(); }
        });
      })['catch'](function (e) { fail((e && e.message) ? e.message : '加载失败'); });
    } catch (e2) { fail('加载失败'); }
  }
""", 'R8-render')

# ---- R9: otherReferrer 识别动态空间.html ----
data = rep(data, """  /** 同源（或 file: 同目录）的 动态 / 社区 页 referrer；否则返回空串 */
  function otherReferrer() {
    var ref = String(document.referrer || '');
    if (!ref) { return ''; }
    if (!/动态\\.html|社区\\.html/.test(ref)) { return ''; }
""", """  /** 同源（或 file: 同目录）的 动态空间 / 社区 页 referrer；否则返回空串 */
  function otherReferrer() {
    var ref = String(document.referrer || '');
    if (!ref) { return ''; }
    if (!/动态空间\\.html|社区\\.html/.test(ref)) { return ''; }
""", 'R9-referrer')

# ---- R10: cellHtml 支持 data-other-act（备注名行） ----
data = rep(data, """    else if (it.act) { attr = ' data-act="' + esc(it.act) + '"'; }
    return '<div class="xtp-cell"' + (info ? '' : ' role="button" tabindex="0"') + attr + '>' +
""", """    else if (it.act) { attr = ' data-act="' + esc(it.act) + '"'; }
    else if (it.oact) { attr = ' data-other-act="' + esc(it.oact) + '"'; }
    return '<div class="xtp-cell"' + (info ? '' : ' role="button" tabindex="0"') + attr + '>' +
""", 'R10-cell-oact')

# ---- R11: groupHtml 支持自定义行 HTML ----
data = rep(data, """  function groupHtml(g) {
    var rows = (g && g.rows) ? g.rows : [];
    var s = '', i;
    for (i = 0; i < rows.length; i++) { s += cellHtml(rows[i]); }
    var title = (g && g.title) ? '<div class="xtp-group-title">' + esc(g.title) + '</div>' : '';
    return title + '<div class="xtp-group">' + s + '</div>';
  }
""", """  function groupHtml(g) {
    var title = (g && g.title) ? '<div class="xtp-group-title">' + esc(g.title) + '</div>' : '';
    /* R74-B：支持整组自定义行 HTML（TA 的动态列表模块用 .xtp-li 行，样式与本页卡片一致） */
    if (g && g.html) { return title + '<div class="xtp-group">' + g.html + '</div>'; }
    var rows = (g && g.rows) ? g.rows : [];
    var s = '', i;
    for (i = 0; i < rows.length; i++) { s += cellHtml(rows[i]); }
    return title + '<div class="xtp-group">' + s + '</div>';
  }
""", 'R11-group-html')

# ---- 自检：旧引用清零 / 新引用就位 ----
# 注意：'我的动态.html' 本身包含子串 '动态.html'，故用带引号前缀的精确匹配
assert data.count("'动态.html") == 0, 'xt-profile.js still references 动态.html'
assert data.count('动态空间.html') >= 2, '动态空间.html missing'
assert data.count('我的动态.html') == 1, '我的动态.html must be kept'

out = data.replace('\n', '\r\n').encode('utf-8')
assert_crlf_only(out, 'xt-profile.js(after)')
wr(p, out)
print('[patched] xt-profile.js  bytes:', len(out))

# ================================================================ xt-profile.css
p = os.path.join(ASSETS, 'xt-profile.css')
raw = rd(p)
assert_crlf_only(raw, 'xt-profile.css(before)')
css = raw.decode('utf-8')
assert 'xtp-hero-acts' not in css, 'css already patched?'

css_add = """
/* ------------------------------------- 11. TA 视角（R74-B）hero 操作区 & 动态列表 */
/* hero 右侧操作按钮：好友 = 发消息 + 删除好友；非好友 = 加好友（见 otherHeroActsHtml） */
.xtp-hero-acts {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.xtp-hero-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--xtp-line);
  border-radius: 8px;
  background: transparent;
  color: var(--xtp-text);
  font-size: 12px;
  line-height: 1;
  padding: 8px 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}
.xtp-hero-act:active { background: var(--xtp-press); }
.xtp-hero-act.primary { background: var(--xtp-primary); border-color: var(--xtp-primary); color: #fff; }
.xtp-hero-act.danger { color: var(--xtp-danger); border-color: var(--xtp-danger); }
/* 昵称旁的好友备注名胶囊 */
.xtp-hero-remark {
  flex: none;
  max-width: 40%;
  font-size: 11px;
  line-height: 1;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--xtp-chip);
  color: var(--xtp-sub);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* TA 动态列表行可点击（跳 动态空间.html） */
.xtp-li-tap { cursor: pointer; }
.xtp-li-tap:active { background: var(--xtp-press); }
/* 小屏：hero 换行，操作按钮整行右对齐排布（固定值 + @media，禁用 min/max） */
@media (max-width: 400px) {
  .xtp-hero.xtp-hero-other { flex-wrap: wrap; }
  .xtp-hero-acts { flex-direction: row; width: 100%; justify-content: flex-end; }
}
"""
css_out = css + css_add.replace('\n', '\r\n')
out = css_out.encode('utf-8')
assert_crlf_only(out, 'xt-profile.css(after)')
wr(p, out)
print('[patched] xt-profile.css  bytes:', len(out))

# ================================================================ api.js
p = os.path.join(ASSETS, 'api.js')
raw = rd(p)
assert_crlf_only(raw, 'api.js(before)')
apidata = raw.decode('utf-8')
old = "'动态.html?user=\" + u.id"
new = "'动态空间.html?user=\" + u.id"
assert apidata.count(old) == 1, 'api.js old ref count != 1'
apidata = apidata.replace(old, new)
assert apidata.count("'动态.html") == 0, 'api.js still references 动态.html'
out = apidata.encode('utf-8')
assert_crlf_only(out, 'api.js(after)')
wr(p, out)
print('[patched] api.js  bytes:', len(out))

# ================================================================ ES2017 禁令自查（三个 js）
FORBIDDEN = ['?.', '??', 'replaceAll(', 'Object.fromEntries', '.at(']
for fn in ['xt-profile.js', 'api.js', 'chat-local.js']:
    txt = rd(os.path.join(ASSETS, fn)).decode('utf-8')
    for tok in FORBIDDEN:
        c = txt.count(tok)
        print('[es2017-check] %-16s %-20s hits=%d' % (fn, tok, c))

print('ALL PATCHES OK')
