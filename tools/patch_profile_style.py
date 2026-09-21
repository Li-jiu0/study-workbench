# -*- coding: utf-8 -*-
"""个人中心改版为「豆包风格」：
1) app.js：renderProfilePage 重写 —— 居中大头像 + 账号管理按钮 + 图标列表（编辑资料/笔记统计/学习偏好/本机学习数据/退出）
2) 个人中心.html：隐藏 module-hero 与两个旧静态卡（DOM 保留），由 renderProfilePage 统一渲染
3) common.css：追加 .pp-* 豆包风格样式
"""
import io, re

# ---------- 1) app.js ----------
path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

old_fn = """function renderProfilePage() {
  const box = document.getElementById('profileBox');
  if (!box) return;
  const p = appData.profile;
  const notes = appData.notes;
  const pub = notes.filter(n => n.status === 'published');
  const draft = notes.filter(n => n.status === 'draft');
  const arch = notes.filter(n => n.status === 'archived');
  const totalLikes = pub.reduce((s, n) => s + (n.likes || 0), 0);
  const totalComments = pub.reduce((s, n) => s + (n.comments || []).length, 0);
  const totalViews = pub.reduce((s, n) => s + (n.views || 0), 0);
  const catCount = {};
  notes.forEach(n => { const id = noteCat(n.category).id; catCount[id] = (catCount[id] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(catCount));
  const catBars = BLOG_CATS.filter(c => catCount[c.id]).map(c =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="width:110px;font-size:12px;color:var(--text-secondary)">${c.icon} ${c.name}</span>
      <div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:${Math.round(catCount[c.id] / maxCat * 100)}%;background:linear-gradient(90deg,${noteColors(c.id)[0]},${noteColors(c.id)[1]})"></div></div>
      <span style="width:60px;font-size:12px;color:var(--text-secondary)">${catCount[c.id]} 篇</span>
    </div>`).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有笔记，去「学习博客 → ✍️ 写笔记」试试吧</div>';
  const auth = getAuth();
  box.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">👤</span>个人资料</div><div class="card-action">${auth ? esc(auth.account) : '本地用户'}</div></div>
      <div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">
        <div class="profile-avatar-lg">${p.avatarImg && /^data:image\\//.test(p.avatarImg) ? '<img src="' + p.avatarImg + '" alt="头像">' : esc(p.avatar)}</div>
        <div style="flex:1;min-width:180px"><div style="font-size:18px;font-weight:800;color:var(--text)">${esc(p.name)}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${esc(p.motto || '')}</div></div>
        <button class="btn btn-outline" onclick="editProfile()">✏️ 编辑资料</button>
        <button class="btn btn-danger" onclick="doLogout()">🚪 退出登录</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">⚠️ 当前为本地单用户模式。多用户注册、评论/点赞的社交联动、管理员权限需要后端 + 数据库支持。</div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>笔记统计</div></div>
      <div class="profile-grid">
        ${[['📝', pub.length, '已发布'], ['💾', draft.length, '草稿'], ['📁', arch.length, '已归档'], ['👍', totalLikes, '总点赞'], ['💬', totalComments, '总评论'], ['👁', totalViews, '总阅读']].map(([ic, num, lb]) =>
          `<div class="profile-stat"><div class="ps-num">${ic} ${num}</div><div class="ps-label">${lb}</div></div>`).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 笔记分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>
        <button class="btn btn-outline" onclick="navigateTo('blog')">📝 去写笔记</button>
      </div>
    </div>`;
}"""

new_fn = """function renderProfilePage() {
  const box = document.getElementById('profileBox');
  if (!box) return;
  const p = appData.profile;
  const notes = appData.notes;
  const pub = notes.filter(n => n.status === 'published');
  const draft = notes.filter(n => n.status === 'draft');
  const arch = notes.filter(n => n.status === 'archived');
  const totalLikes = pub.reduce((s, n) => s + (n.likes || 0), 0);
  const totalComments = pub.reduce((s, n) => s + (n.comments || []).length, 0);
  const totalViews = pub.reduce((s, n) => s + (n.views || 0), 0);
  const catCount = {};
  notes.forEach(n => { const id = noteCat(n.category).id; catCount[id] = (catCount[id] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(catCount));
  const catBars = BLOG_CATS.filter(c => catCount[c.id]).map(c =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="width:110px;font-size:12px;color:var(--text-secondary)">${c.icon} ${c.name}</span>
      <div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:${Math.round(catCount[c.id] / maxCat * 100)}%;background:linear-gradient(90deg,${noteColors(c.id)[0]},${noteColors(c.id)[1]})"></div></div>
      <span style="width:60px;font-size:12px;color:var(--text-secondary)">${catCount[c.id]} 篇</span>
    </div>`).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有笔记，去「学习博客 → ✍️ 写笔记」试试吧</div>';
  const auth = getAuth();
  let st = {};
  try { st = loadAllSettings(); } catch (e) { }
  const speakState = (st.autoSpeak === false) ? '朗读关闭' : ('朗读开启 · 语速 ' + (st.voiceRate || 0.9));
  const d = (appData && appData.stats) || {};
  const acc = d.totalQuestions > 0 ? Math.round(d.correctQuestions / d.totalQuestions * 100) : 0;
  const totalNotes = pub.length + draft.length + arch.length;
  box.innerHTML = `
    <div class="pp-profile">
      <div class="pp-avatar">${p.avatarImg && /^data:image\\//.test(p.avatarImg) ? '<img src="' + p.avatarImg + '" alt="头像">' : esc(p.avatar)}</div>
      <div class="pp-name">${esc(p.name)}</div>
      <div class="pp-id">${auth ? '账号：' + esc(auth.account) : '本地学习账号'}${p.motto ? ' · ' + esc(p.motto) : ''}</div>
      <button class="pp-account-btn" onclick="editProfile()">👤 账号管理</button>
    </div>
    <div class="pp-card">
      <div class="pp-row" onclick="editProfile()"><span class="pp-ic">✏️</span><span class="pp-tx">编辑资料</span><span class="pp-ar">›</span></div>
      <div class="pp-row" onclick="toggleProfilePanel('ppStatPanel', this)"><span class="pp-ic">📊</span><span class="pp-tx">笔记统计</span><span class="pp-st">${totalNotes} 篇</span><span class="pp-ar">▾</span></div>
      <div class="pp-panel" id="ppStatPanel">
        <div class="profile-grid">
          ${[['📝', pub.length, '已发布'], ['💾', draft.length, '草稿'], ['📁', arch.length, '已归档'], ['👍', totalLikes, '总点赞'], ['💬', totalComments, '总评论'], ['👁', totalViews, '总阅读']].map(([ic, num, lb]) =>
            `<div class="profile-stat"><div class="ps-num">${ic} ${num}</div><div class="ps-label">${lb}</div></div>`).join('')}
        </div>
        <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 笔记分类分布</div>${catBars}</div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>
          <button class="btn btn-outline" onclick="navigateTo('blog')">📝 去写笔记</button>
        </div>
      </div>
      <div class="pp-row" onclick="location.href='设置.html'"><span class="pp-ic">🧭</span><span class="pp-tx">学习偏好</span><span class="pp-st">${speakState}</span><span class="pp-ar">›</span></div>
      <div class="pp-row" onclick="toggleProfilePanel('ppLocalPanel', this)"><span class="pp-ic">📈</span><span class="pp-tx">本机学习数据</span><span class="pp-st">${d.totalHours || 0}h · ${d.totalQuestions || 0} 题</span><span class="pp-ar">▾</span></div>
      <div class="pp-panel" id="ppLocalPanel">
        <div class="profile-grid">
          ${[['⏱', d.totalHours || 0, '总学习(h)'], ['🧮', d.totalQuestions || 0, '做题数'], ['🎯', acc + '%', '正确率'], ['🔥', d.streakDays || 0, '连续打卡']].map(x =>
            `<div class="profile-stat"><div class="ps-num">${x[0]} ${x[1]}</div><div class="ps-label">${x[2]}</div></div>`).join('')}
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outline" style="font-size:12px;padding:6px 12px" onclick="overviewGo('wrong')">📒 错题本</button>
          <button class="btn btn-outline" style="font-size:12px;padding:6px 12px" onclick="overviewGo('vocab')">📖 四级词汇</button>
          <button class="btn btn-outline" style="font-size:12px;padding:6px 12px" onclick="overviewGo('settings')">⚙️ 偏好设置</button>
        </div>
      </div>
    </div>
    <div class="pp-card">
      <div class="pp-row pp-danger" onclick="doLogout()"><span class="pp-ic">🚪</span><span class="pp-tx">退出登录</span><span class="pp-ar">›</span></div>
    </div>`;
}

/** 展开/收起个人中心内嵌面板（笔记统计 / 本机学习数据） */
function toggleProfilePanel(panelId, rowEl) {
  const el = document.getElementById(panelId);
  if (!el) return;
  const show = (el.style.display === 'none');
  el.style.display = show ? '' : 'none';
  if (rowEl) {
    const ar = rowEl.querySelector('.pp-ar');
    if (ar) ar.textContent = show ? '▴' : '▾';
  }
}"""
assert old_fn in src, 'renderProfilePage not found'
src = src.replace(old_fn, new_fn, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js renderProfilePage rewritten, size =', len(src))

# ---------- 2) 个人中心.html ----------
path2 = r'D:\下载的文件\学习工作台\个人中心.html'
with io.open(path2, 'r', encoding='utf-8') as f:
    html = f.read()

# 2a) module-hero 隐藏（DOM 保留）
old_hero = """        <div class="module-hero" data-page-node-id="WZ2Br25aKXQMUO9oVEEFI0">"""
new_hero = """        <div class="module-hero" style="display:none" data-page-node-id="WZ2Br25aKXQMUO9oVEEFI0"><!-- v1.14 豆包风格：隐藏旧横幅，DOM 保留 -->"""
assert old_hero in html, 'module-hero not found'
html = html.replace(old_hero, new_hero, 1)

# 2b) 我的学习偏好卡 隐藏（由 renderProfilePage 统一渲染）
old_pref = """        <!-- 学习偏好（与设置联动） -->
        <div class="card" data-page-node-id="sGYAklXD8EhseTlHlPE0D1">"""
new_pref = """        <!-- 学习偏好（与设置联动）：v1.14 起由 renderProfilePage 的列表项呈现，DOM 保留 -->
        <div class="card" style="display:none" data-page-node-id="sGYAklXD8EhseTlHlPE0D1">"""
assert old_pref in html, 'pref card not found'
html = html.replace(old_pref, new_pref, 1)

# 2c) 本机学习数据卡 隐藏
old_loc = """        <!-- 本机学习数据一览 -->
        <div class="card" data-page-node-id="dds9xQfNYeivaK5Gv00VeE">"""
new_loc = """        <!-- 本机学习数据一览：v1.14 起由 renderProfilePage 的列表项呈现，DOM 保留 -->
        <div class="card" style="display:none" data-page-node-id="dds9xQfNYeivaK5Gv00VeE">"""
assert old_loc in html, 'local stats card not found'
html = html.replace(old_loc, new_loc, 1)

# 2d) profileBox 注释更新
old_cmt = """        <!-- 个人中心内容（由 assets/app.js 的 renderProfilePage() 渲染：
             头像/昵称/签名/编辑资料、笔记统计卡、分类分布、导出全部 Markdown、
             本地单用户模式提示、退出登录按钮） -->"""
new_cmt = """        <!-- 个人中心内容（由 assets/app.js 的 renderProfilePage() 渲染，v1.14 豆包风格） -->"""
assert old_cmt in html, 'profileBox comment not found'
html = html.replace(old_cmt, new_cmt, 1)

with io.open(path2, 'w', encoding='utf-8') as f:
    f.write(html)
print('OK: 个人中心.html patched, size =', len(html))

# ---------- 3) common.css ----------
path3 = r'D:\下载的文件\学习工作台\assets\common.css'
with io.open(path3, 'r', encoding='utf-8') as f:
    css = f.read()

pp_css = """

/* ===== 个人中心 · 豆包风格（v1.14） ===== */
.pp-profile{text-align:center;padding:22px 16px 14px;background:var(--card);border-radius:16px;margin-bottom:14px}
.pp-avatar{width:96px;height:96px;border-radius:50%;margin:0 auto 12px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:#fff;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.12);border:3px solid #fff}
.pp-avatar img{width:100%;height:100%;object-fit:cover}
.pp-name{font-size:20px;font-weight:800;color:var(--text)}
.pp-id{font-size:12px;color:var(--text-muted);margin-top:5px}
.pp-account-btn{margin-top:12px;background:var(--bg);border:1px solid var(--border);color:var(--primary);font-size:13px;font-weight:600;padding:7px 22px;border-radius:20px;cursor:pointer;transition:opacity .15s}
.pp-account-btn:active{opacity:.65}
.pp-card{background:var(--card);border-radius:16px;overflow:hidden;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.pp-row{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s}
.pp-row:last-child{border-bottom:none}
.pp-row:active{background:var(--bg)}
.pp-ic{font-size:17px;width:26px;text-align:center;flex-shrink:0}
.pp-tx{flex:1;font-size:14px;color:var(--text)}
.pp-st{font-size:12px;color:var(--text-muted)}
.pp-ar{font-size:16px;color:var(--text-muted);flex-shrink:0}
.pp-danger .pp-tx{color:var(--danger)}
.pp-panel{padding:14px 16px;border-bottom:1px solid var(--border);background:var(--bg)}
.pp-panel:last-child{border-bottom:none}
"""
css += pp_css
with io.open(path3, 'w', encoding='utf-8') as f:
    f.write(css)
print('OK: common.css appended, size =', len(css))
