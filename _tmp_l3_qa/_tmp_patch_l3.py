# -*- coding: utf-8 -*-
"""L3 patch: AI.html (CRLF) + assets/ai-page.js (LF). Byte-safe, preserves line endings."""
import io, sys

ROOT = 'D:\\下载的文件\\学习工作台\\'
REPORT = []


def crlf(s):
    s = s.replace('\r\n', '\n')
    return s.replace('\n', '\r\n')


def patch(path, pairs):
    with open(path, 'rb') as f:
        raw = f.read()
    crlf_mode = raw.count(b'\r\n') == raw.count(b'\n') and raw.count(b'\n') > 0
    txt = raw.decode('utf-8')
    for i, (old, new) in enumerate(pairs):
        o = crlf(old) if crlf_mode else old.replace('\r\n', '\n')
        n = crlf(new) if crlf_mode else new.replace('\r\n', '\n')
        cnt = txt.count(o)
        if cnt != 1:
            REPORT.append('FAIL  %s  pair#%d  occurrences=%d' % (path, i, cnt))
            sys.exit(2)
        txt = txt.replace(o, n, 1)
        REPORT.append('ok    %s  pair#%d' % (path, i))
    with open(path, 'wb') as f:
        f.write(txt.encode('utf-8'))
    with open(path, 'rb') as f:
        b = f.read()
    REPORT.append('      -> crlf=%d lf=%d' % (b.count(b'\r\n'), b.count(b'\n')))


HTML = ROOT + 'AI.html'
JS = ROOT + r'assets\ai-page.js'

html_pairs = []

# ---- P1: 统一 .ai-input-wrap（两个槽位共用一套宽度/边距） ----
html_pairs.append((
    '.ai-welcome .ai-input-wrap{width:100%;max-width:760px;margin-top:8px;}',
    '/* 输入区外观统一（需求 C）：空态与对话态共用同一套宽度/边距，\n'
    '   两个槽位（#aiWelcomeInputSlot / #aiDockInputSlot）外层不再各写一套，\n'
    '   避免互切时输入框宽度跳变。768px 与 .ai-msg 对齐。 */\n'
    '.ai-input-wrap{width:100%;max-width:768px;margin:0 auto;box-sizing:border-box;}'
))

# ---- P2: .ai-input-box 不再"未聚焦即隐形" ----
html_pairs.append((
    '/* 对标 DeepSeek：未聚焦＝浅灰一块、几乎无边框（不是"白卡片+描边"那种输入框）；\n'
    '   聚焦＝转白底 + 极淡描边 + 轻阴影。视觉上是一块"输入区"，不是一个"文本框" */\n'
    '.ai-input-box{\n'
    '  background:var(--ai-bg);border:1px solid transparent;border-radius:var(--ai-radius);\n'
    '  padding:14px 16px 10px;box-shadow:none;\n'
    '  transition:background .15s,border-color .15s,box-shadow .15s;\n'
    '}\n'
    '.ai-input-box.focus{\n'
    '  background:var(--ai-card);border-color:rgba(0,0,0,.06);box-shadow:0 2px 12px rgba(0,0,0,.06);\n'
    '}',
    '/* 需求 C：输入区"不变脸" —— 空态与对话态始终是同一个包住所有按钮的大圆角方框。\n'
    '   原来未聚焦是「背景=页面底色 + 边框透明」，容器等于隐形、控件像散在页面上，\n'
    '   一聚焦才突然变成白卡片 → 观感跳变。现在未聚焦也保留白底+淡描边+极轻阴影，\n'
    '   聚焦只做「加重」（橙描边 + 稍大阴影），形态与尺寸完全不动。 */\n'
    '.ai-input-box{\n'
    '  background:var(--ai-card);border:1px solid var(--ai-border);border-radius:var(--ai-radius);\n'
    '  padding:14px 16px 10px;box-shadow:0 1px 2px rgba(0,0,0,.04);\n'
    '  transition:background .15s,border-color .15s,box-shadow .15s;\n'
    '}\n'
    '.ai-input-box.focus{\n'
    '  background:var(--ai-card);border-color:rgba(255,140,0,.42);box-shadow:0 4px 16px rgba(0,0,0,.09);\n'
    '}'
))

# ---- P3: 深度思考 chip 底色（容器变白卡后，chip 需换成页面底色才看得见） ----
html_pairs.append((
    '  border:1px solid var(--ai-border);background:var(--ai-card);color:var(--ai-sub);font-size:13px;\n'
    '  cursor:pointer;transition:all .15s;font-weight:500;\n'
    '}\n'
    '.ai-chip svg{width:15px;height:15px;}',
    '  border:1px solid var(--ai-border);background:var(--ai-bg);color:var(--ai-sub);font-size:13px;\n'
    '  cursor:pointer;transition:all .15s;font-weight:500;\n'
    '}\n'
    '.ai-chip svg{width:15px;height:15px;}'
))

# ---- P4: 模型按钮底色同上 ----
html_pairs.append((
    '  border:1px solid var(--ai-border);background:var(--ai-card);color:var(--ai-sub);font-size:13px;\n'
    '  cursor:pointer;transition:all .15s;font-weight:500;max-width:160px;',
    '  border:1px solid var(--ai-border);background:var(--ai-bg);color:var(--ai-sub);font-size:13px;\n'
    '  cursor:pointer;transition:all .15s;font-weight:500;max-width:160px;'
))

# ---- P5: 模型面板 z-index 99 -> 330 ----
html_pairs.append((
    '.ai-input-box{position:relative;}\n'
    '.ai-model-panel{\n'
    '  position:absolute;left:0;right:auto;bottom:calc(100% + 10px);z-index:99;width:300px;',
    '.ai-input-box{position:relative;}\n'
    '/* z-index 330：必须高于移动端抽屉遮罩 .ai-sidebar-overlay(250)、抽屉 .ai-history(260)\n'
    '   与底部导航(200)，否则从侧栏「模型」打开时面板被整个盖住＝点了没反应 */\n'
    '.ai-model-panel{\n'
    '  position:absolute;left:0;right:auto;bottom:calc(100% + 10px);z-index:330;width:300px;'
))

# ---- P6: 侧栏按钮文案可跟随模型（超长截断，不撑破侧栏） ----
html_pairs.append((
    '.ai-hist-foot .ai-hist-foot-btn .nav-icon{width:18px;height:18px;flex-shrink:0;}',
    '.ai-hist-foot .ai-hist-foot-btn .nav-icon{width:18px;height:18px;flex-shrink:0;}\n'
    '/* 侧栏「模型」按钮文案跟随选中模型，可能较长：超长截断而不是撑破侧栏 */\n'
    '.ai-hist-foot .ai-hist-foot-btn .ai-foot-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
))

# ---- P7: 去掉窄屏给欢迎态单独放开宽度的覆盖 ----
html_pairs.append((
    '  .ai-welcome .ai-input-wrap{max-width:none;}',
    '  /* 窄屏不再给欢迎态单独放开宽度（原 max-width:none 会让空态比对话态更宽 → 跳变） */\n'
    '  .ai-welcome .ai-input-wrap{max-width:768px;}'
))

js_pairs = []

# ---- J1: 侧栏「模型」文案跟随选中模型 ----
js_pairs.append((
    '  function updateModelLabel() {\n'
    '    if (!aiModelLabel) return;\n'
    '    var id = getSelectedModelId();\n'
    '    if (id === \'auto\') { aiModelLabel.textContent = \'自动\'; return; }\n'
    '    var m = getModelById(id);\n'
    '    aiModelLabel.textContent = m ? m.name : \'自动\';\n'
    '  }',
    '  /* 输入框标签与侧栏「模型」入口共用同一个名字（不写死，始终由选中项推导） */\n'
    '  function currentModelName() {\n'
    '    var id = getSelectedModelId();\n'
    '    if (id === \'auto\') return \'自动\';\n'
    '    var m = getModelById(id);\n'
    '    return m ? m.name : \'自动\';\n'
    '  }\n'
    '  function updateModelLabel() {\n'
    '    var nm = currentModelName();\n'
    '    if (aiModelLabel) aiModelLabel.textContent = nm;\n'
    '    var sideBtn = $(\'aiModelInfoBtn\');\n'
    '    if (sideBtn) {\n'
    '      var lb = sideBtn.querySelector(\'.ai-foot-label\');\n'
    '      if (lb) lb.textContent = \'模型 · \' + nm;\n'
    '      sideBtn.setAttribute(\'title\', \'当前模型：\' + nm + \'（点击切换）\');\n'
    '    }\n'
    '  }'
))

# ---- J2: 侧栏入口：先收抽屉/遮罩再开面板 ----
js_pairs.append((
    '  function toggleModelPanel() {\n'
    '    var e = $(\'aiModelPanel\'); if (!e) return;\n'
    '    if (e.classList.contains(\'open\')) closeModelPanel(); else openModelPanel();\n'
    '  }',
    '  function toggleModelPanel() {\n'
    '    var e = $(\'aiModelPanel\'); if (!e) return;\n'
    '    if (e.classList.contains(\'open\')) closeModelPanel(); else openModelPanel();\n'
    '  }\n'
    '  /* 收起移动端抽屉 + 遮罩（桌面端没有 open 态，调用无副作用） */\n'
    '  function closeSidebar() {\n'
    '    if (aiHistory) aiHistory.classList.remove(\'open\');\n'
    '    if (aiSidebarOverlay) aiSidebarOverlay.classList.remove(\'open\');\n'
    '  }\n'
    '  /* 侧栏「模型」入口：与输入框里的 #aiModelBtn 复用同一个 #aiModelPanel，\n'
    '     只是先收抽屉 + 关遮罩再开，否则窄屏下面板被 .ai-sidebar-overlay(250) /\n'
    '     .ai-history(260) 整个盖住＝点了没反应 */\n'
    '  function toggleModelPanelFromSidebar() {\n'
    '    var e = $(\'aiModelPanel\');\n'
    '    var willOpen = !(e && e.classList.contains(\'open\'));\n'
    '    closeSidebar();\n'
    '    closeUserMenu();\n'
    '    if (willOpen) openModelPanel(); else closeModelPanel();\n'
    '  }\n'
    '  /* 侧栏「设置」入口：先收抽屉再开弹窗，避免关掉设置后抽屉还挂在背景里 */\n'
    '  function openSettingsFromSidebar() { closeSidebar(); closeUserMenu(); openSettings(); }'
))

# ---- J3: doc 级"点外部关闭"要豁免两个面板入口 ----
js_pairs.append((
    '    bindEl(doc, \'click\', function (e) {\n'
    '      if (aiUserMenu && aiUserMenu.classList.contains(\'open\') && aiUserArea && !aiUserArea.contains(e.target)) closeUserMenu();\n'
    '      var p = $(\'aiModelPanel\');\n'
    '      if (p && p.classList.contains(\'open\') && !p.contains(e.target) && (!aiModelBtn || (e.target !== aiModelBtn && !aiModelBtn.contains(e.target)))) closeModelPanel();\n'
    '    });',
    '    bindEl(doc, \'click\', function (e) {\n'
    '      if (aiUserMenu && aiUserMenu.classList.contains(\'open\') && aiUserArea && !aiUserArea.contains(e.target)) closeUserMenu();\n'
    '      var p = $(\'aiModelPanel\');\n'
    '      if (!p || !p.classList.contains(\'open\')) return;\n'
    '      var t = e.target;\n'
    '      if (p.contains(t)) return;\n'
    '      // 面板的两个入口本身要豁免：否则按钮先开、冒泡到 doc 又立刻关＝点了没反应\n'
    '      if (aiModelBtn && (t === aiModelBtn || aiModelBtn.contains(t))) return;\n'
    '      var infoBtn = $(\'aiModelInfoBtn\');\n'
    '      if (infoBtn && (t === infoBtn || infoBtn.contains(t))) return;\n'
    '      closeModelPanel();\n'
    '    });'
))

# ---- J4: 侧栏两个按钮改绑新入口 ----
js_pairs.append((
    '    bindById(\'aiModelInfoBtn\', \'click\', toggleModelPanel);\n'
    '    bindById(\'aiSettingsBtn\', \'click\', openSettings);',
    '    bindById(\'aiModelInfoBtn\', \'click\', toggleModelPanelFromSidebar);\n'
    '    bindById(\'aiSettingsBtn\', \'click\', openSettingsFromSidebar);'
))

patch(HTML, html_pairs)
patch(JS, js_pairs)

with io.open(ROOT + '_tmp_patch_l3_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(REPORT))
