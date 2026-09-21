# -*- coding: utf-8 -*-
# R72 任务三：页面定点修改（更多/关于/个人中心/学习工作台/学习概括）
import io, os, re

BASE = r'D:\下载的文件\学习工作台'

def load(p):
    raw = open(p, 'rb').read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    t = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    return t, bom

def save(p, t, bom):
    out = t.replace('\n', '\r\n').encode('utf-8')
    if bom:
        out = b'\xef\xbb\xbf' + out
    open(p, 'wb').write(out)
    return out.count(b'\n') - out.count(b'\r\n')

def sub_exact(t, old, new, cnt):
    o = old.replace('\r\n', '\n')
    n = t.count(o)
    if n != cnt:
        raise SystemExit('ABORT exact: found=%d expect=%d :: %r' % (n, cnt, o[:90]))
    return t.replace(o, new.replace('\r\n', '\n'))

def sub_re(t, pat, new, cnt):
    n = len(re.findall(pat, t))
    if n != cnt:
        raise SystemExit('ABORT regex: found=%d expect=%d :: %s' % (n, cnt, pat[:90]))
    return re.sub(pat, new.replace('\r\n', '\n'), t, count=cnt)

logs = []

# ============================ 更多.html ============================
p = os.path.join(BASE, '更多.html')
t, bom = load(p)
before = len(t)
# (1) 删导入题库 CSS 块
t = sub_re(t, r'<style>\n  /\* 【批次 20260913k】导入题库[\s\S]*?\n</style>\n', '', 1)
# (2) 删导入题库 全屏视图 DOM
t = sub_re(t, r'\n  <div class="importer-view" id="importerView" role="dialog" aria-label="导入题库">\n[\s\S]*?\n  </div>\n', '\n', 1)
# (3) 删导入题库 逻辑 script 块
t = sub_re(t, r'\n<script>\n\(function\(\)\{\n    /\* 打开导入题库全屏视图[\s\S]*?\n\}\)\(\);\n</script>\n', '\n', 1)
# (4) 导入题库卡 onclick -> 独立页
t = sub_exact(t, 'onclick="openImporterView()"', 'onclick="location.href=\'导入题库.html\'"', 1)
# (5) 删「穿越英语」主列表卡
t = sub_exact(t,
'          <div class="morepage-card morepage-list-item" onclick="if(window.openQuest){openQuest()}else{location.href=\'学习工作台.html\'}">\n'
'            <div class="mpc-icon"><span class="nav-icon" data-icon="zap" data-icon-size="20"></span></div>\n'
'            <div class="mpc-title">穿越英语</div>\n'
'            <div class="mpc-desc">闯关式剧情学英语</div>\n'
'          </div>\n',
'', 1)
# (6) 删「穿越英语」旧弹层项
t = sub_exact(t,
'      <div class="bottom-more-item" onclick="if(window.openQuest){openQuest()}else{location.href=\'工具.html\'};toggleToolsPanel()">\n'
'        <div class="bm-icon"><span class="nav-icon" data-icon="zap" data-icon-size="20"></span></div><div class="bm-label">穿越英语</div>\n'
'      </div>\n',
'', 1)
lone = save(p, t, bom)
logs.append('更多.html bytes %d->%d loneLF=%d 穿越英语残留=%d' % (before, len(t), lone, t.count('穿越英语')))

# ============================ 关于.html ============================
p = os.path.join(BASE, '关于.html')
t, bom = load(p)
before = len(t)
# 侧栏 演示 -> 我的文件
t = sub_exact(t,
"      <div class=\"nav-item\" onclick=\"location.href='演示.html'\">\n"
'        <span class="nav-icon" data-icon="palette"></span><span>演示</span>\n'
'      </div>',
"      <div class=\"nav-item\" onclick=\"location.href='我的文件.html'\">\n"
'        <span class="nav-icon" data-icon="folder"></span><span>我的文件</span>\n'
'      </div>', 1)
# chips：删「演示」补「我的文件」
t = sub_exact(t,
'              <span class="ab-chip">演示</span>\n'
'              <span class="ab-chip">万能金句 / 场景话术</span>',
'              <span class="ab-chip">我的文件</span>\n'
'              <span class="ab-chip">万能金句 / 场景话术</span>', 1)
# 顺手的工具：补「我的文件」
t = sub_exact(t,
'            <div class="ab-text">导入自己的题库 · 专注计时 · 外观主题 · 发贴与回收站 · Markdown 导出 · 数据备份</div>',
'            <div class="ab-text">我的文件（题库 / 作品归档） · 导入自己的题库 · 专注计时 · 外观主题 · 发贴与回收站 · Markdown 导出 · 数据备份</div>', 1)
# 更新日志：追加 v2.3
t = sub_exact(t,
'            <div class="ab-text">v2.2 更新：AI 问答页上线（模型列表面板 · 倍率 · MAX 模式 · 深度思考 · 上下文长度）· AI 伙伴改版为小助手与暖心学伴，接入全站统一 AI 底座 ·「关于」改为独立页面 · 全站导航接入 AI · 多处界面细节打磨</div>\n'
'            <div class="ab-log">v2.1：错题本按模块与错因筛选 · 学习数据轮播 · 倒计时置顶<br>v2.0：学习工作台改版 · 底部导航统一为 首页 / 互动 / 我的 / AI / 更多</div>',
'            <div class="ab-text">v2.3 更新：全新「我的文件」页上线，统一归集题库 / 作品 / 笔记 ·「演示」功能下线，作品集迁入「我的文件」 · 导入题库独立成页，导入即同步登记 · 会话通知接入原生桥、模型设置优化 · 其他界面细节打磨</div>\n'
'            <div class="ab-log">v2.2：AI 问答页上线（模型列表面板 · 倍率 · MAX 模式 · 深度思考 · 上下文长度）· AI 伙伴改版为小助手与暖心学伴，接入全站统一 AI 底座 ·「关于」改为独立页面 · 全站导航接入 AI<br>v2.1：错题本按模块与错因筛选 · 学习数据轮播 · 倒计时置顶<br>v2.0：学习工作台改版 · 底部导航统一为 首页 / 互动 / 我的 / AI / 更多</div>', 1)
# 版本号三处（HTML + 脚本）
t = sub_exact(t, '<span class="ab-ver" id="aboutVersion">v2.2</span>', '<span class="ab-ver" id="aboutVersion">v2.3</span>', 1)
t = sub_exact(t, "if (el) el.textContent = 'v2.2';", "if (el) el.textContent = 'v2.3';", 1)
lone = save(p, t, bom)
logs.append('关于.html bytes %d->%d loneLF=%d v2.2残留=%d 我的文件chip=%d' % (before, len(t), lone, t.count('v2.2'), t.count('ab-chip">我的文件')))

# ============================ 学习工作台.html ============================
p = os.path.join(BASE, '学习工作台.html')
t, bom = load(p)
before = len(t)
t = sub_exact(t,
'      <div class="nav-item" data-page="ppt" data-page-node-id="IQO2ZglSBbf5nWXkhEDn1O">\n'
'        <span class="nav-icon" data-page-node-id="qCBPUAWjqPjtdqZAm2cyvA" data-icon="palette"></span><span data-page-node-id="OAXdAsu7yU2m8xzENlxaBm">演示</span>\n'
'      </div>',
'      <div class="nav-item" data-page="files" data-page-node-id="IQO2ZglSBbf5nWXkhEDn1O">\n'
'        <span class="nav-icon" data-page-node-id="qCBPUAWjqPjtdqZAm2cyvA" data-icon="folder"></span><span data-page-node-id="OAXdAsu7yU2m8xzENlxaBm">我的文件</span>\n'
'      </div>', 1)
lone = save(p, t, bom)
logs.append('学习工作台.html bytes %d->%d loneLF=%d' % (before, len(t), lone))

# ============================ 学习概括.html ============================
p = os.path.join(BASE, '学习概括.html')
t, bom = load(p)
before = len(t)
t = sub_exact(t,
"      <div class=\"nav-item\" onclick=\"location.href='演示.html'\">\n"
'        <span class="nav-icon" data-icon="palette"></span><span>演示</span>',
"      <div class=\"nav-item\" onclick=\"location.href='我的文件.html'\">\n"
'        <span class="nav-icon" data-icon="folder"></span><span>我的文件</span>', 1)
lone = save(p, t, bom)
logs.append('学习概括.html bytes %d->%d loneLF=%d 演示.html残留=%d' % (before, len(t), lone, t.count("演示.html")))

# ============================ 个人中心.html ============================
p = os.path.join(BASE, '个人中心.html')
t, bom = load(p)
before = len(t)
# 侧栏 演示 -> 我的文件（紧凑单行）
t = sub_exact(t,
'<div class="nav-item" data-page="ppt"> <span class="nav-icon" data-icon="palette"></span><span>演示</span> </div>',
'<div class="nav-item" data-page="files"> <span class="nav-icon" data-icon="folder"></span><span>我的文件</span> </div>', 1)
# (13) 入口卡 -> 我的文件
t = sub_exact(t,
'          <!-- N9-4（批次 20260916 L12）：「我的作品集」入口卡。作品读 localStorage\n'
'               （本页新增：xtc:lib:pf:folio:works；聚合演示页：xtc:lib:pptw:works），收藏存 xtc:lib:pf:folio:fav。 -->\n'
'          <div class="subpage-group-card" onclick="SubpageRouter.navigate(\'folio\')">\n'
'            <div class="sgc-icon" data-icon="briefcase"></div>\n'
'            <div class="sgc-main"><div class="sgc-title">我的作品集</div><div class="sgc-desc">PPT / 写作 / 设计作品，可收藏留念</div></div>\n'
'            <div class="sgc-arrow">›</div>\n'
'          </div>',
'          <!-- R72-7：「我的作品集」已并入「我的文件」独立页；此处改为直达入口卡。 -->\n'
'          <div class="subpage-group-card" onclick="location.href=\'我的文件.html\'">\n'
'            <div class="sgc-icon" data-icon="folder"></div>\n'
'            <div class="sgc-main"><div class="sgc-title">我的文件</div><div class="sgc-desc">题库 / 作品 / 笔记，一处归档</div></div>\n'
'            <div class="sgc-arrow">›</div>\n'
'          </div>', 1)
# (12) 删 folio section
t = sub_exact(t,
'        <!-- ==================== N9-4（批次 20260916 L12）：我的作品集 ====================\n'
'             纯页内实现：DOM + CSS（.xtf-）+ JS 全在本文件，不新增 assets 文件。\n'
'             数据：本页新增作品存 localStorage 键 xtc:lib:pf:folio:works；\n'
'                   只读聚合 演示.html 的 PPT 作品集 xtc:lib:pptw:works（来源标「演示 · PPT」，不可在本页删除）；\n'
'                   收藏表存 xtc:lib:pf:folio:fav（{<作品id>:1}），对两个来源都生效，刷新后仍在。\n'
'             渲染 / 交互逻辑见本文件底部「我的作品集」脚本。 -->\n'
'        <section data-subpage="folio">\n'
'          <div class="card" id="myFolioCard">\n'
'            <div class="card-header">\n'
'              <div class="card-title"><span class="title-icon" data-icon="briefcase"></span>我的作品集</div>\n'
'              <div class="card-action" onclick="xtFolioOpenAdd()">＋ 添加作品</div>\n'
'            </div>\n'
'            <div class="xtf-bar" id="xtFolioBar"></div>\n'
'            <div class="xtf-grid" id="xtFolioGrid">加载中…</div>\n'
'            <div class="xtf-tip">作品保存在本机浏览器（localStorage），换设备 / 清缓存会丢失，重要作品请自行备份。演示页「PPT 作品集」里的作品会自动聚合到这里，可在演示页管理。</div>\n'
'          </div>\n'
'        </section>',
'        <!-- R72-7：原「我的作品集」section（含弹窗与脚本）已整体迁至 我的文件.html，此处删除。 -->', 1)
# (12) 删添加作品弹窗
t = sub_exact(t,
'        <!-- 添加作品弹窗（T19 .app-modal 基础设施：ESC / 点遮罩 / ✕ 关闭 + 锁滚动） -->\n'
'        <div class="modal-overlay app-modal-mask xtf-mask" id="xtFolioAddModal">\n'
'          <div class="modal app-modal" style="max-width:520px">\n'
'            <button class="app-modal-close" type="button" onclick="xtFolioCloseAdd()" title="关闭">×</button>\n'
'            <div class="modal-title">添加作品</div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">作品标题</div>\n'
'              <input type="text" class="form-input" id="xfTitle" maxlength="40" placeholder="如：秋招简历 V3 / 四级冲刺 PPT">\n'
'              <div class="xtf-err" id="xfTitleErr">请填写作品标题</div>\n'
'            </div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">类型</div>\n'
'              <select class="form-input" id="xfType"></select>\n'
'            </div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">封面图片（选填，最多 4 张，自动压缩）</div>\n'
'              <input type="file" id="xfFiles" accept="image/*" multiple style="display:none" onchange="xtFolioPick(this)">\n'
'              <button class="btn btn-outline" type="button" style="font-size:var(--xt-font-sm);padding:8px 14px" onclick="document.getElementById(\'xfFiles\').click()">＋ 选择图片</button>\n'
'              <div class="xtf-thumbs" id="xfThumbs"></div>\n'
'            </div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">标签（选填，逗号分隔）</div>\n'
'              <input type="text" class="form-input" id="xfTags" maxlength="60" placeholder="如：秋招,简历,一页纸">\n'
'            </div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">作品链接（选填）</div>\n'
'              <input type="text" class="form-input" id="xfLink" maxlength="300" placeholder="https://…">\n'
'            </div>\n'
'            <div class="form-group">\n'
'              <div class="form-label">作品说明（选填）</div>\n'
'              <textarea class="form-input" id="xfDesc" maxlength="300" rows="3" style="resize:vertical" placeholder="记录这次作品的亮点 / 下次要改的地方"></textarea>\n'
'            </div>\n'
'            <div class="modal-actions">\n'
'              <button class="btn btn-outline" type="button" onclick="xtFolioCloseAdd()">取消</button>\n'
'              <button class="btn btn-primary" type="button" id="xfSaveBtn" onclick="xtFolioSave()">保存</button>\n'
'            </div>\n'
'          </div>\n'
'        </div>',
'        <!-- R72-7：原「添加作品」弹窗已迁至 我的文件.html，此处删除。 -->', 1)
# (12) 删查看作品弹窗
t = sub_exact(t,
'        <!-- 查看作品弹窗 -->\n'
'        <div class="modal-overlay app-modal-mask xtf-mask" id="xtFolioViewModal">\n'
'          <div class="modal app-modal" style="max-width:560px">\n'
'            <button class="app-modal-close" type="button" onclick="xtFolioCloseView()" title="关闭">×</button>\n'
'            <div class="modal-title" id="xfVTitle">作品</div>\n'
'            <div>\n'
'              <img class="xtf-vimg" id="xfVImg" alt="">\n'
'              <div class="xtf-vnav">\n'
'                <button class="btn btn-outline" type="button" id="xfVPrev" onclick="xtFolioNav(-1)">‹ 上一张</button>\n'
'                <span id="xfVCount" style="font-size:var(--xt-font-xs);color:var(--text-secondary)">暂无图片</span>\n'
'                <button class="btn btn-outline" type="button" id="xfVNext" onclick="xtFolioNav(1)">下一张 ›</button>\n'
'              </div>\n'
'            </div>\n'
'            <div class="xtf-meta" id="xfVMeta" style="white-space:normal"></div>\n'
'            <div class="xtf-tags" id="xfVTags"></div>\n'
'            <div id="xfVDesc" style="margin-top:10px;font-size:var(--xt-font-base);color:var(--text);line-height:1.8;white-space:pre-wrap"></div>\n'
'            <div id="xfVLink" style="margin-top:8px;font-size:var(--xt-font-sm)"></div>\n'
'            <div class="modal-actions">\n'
'              <button class="btn btn-outline" type="button" id="xfVFav" onclick="xtFolioToggleFav(\'\')">收藏</button>\n'
'              <button class="btn btn-primary" type="button" onclick="xtFolioCloseView()">关闭</button>\n'
'            </div>\n'
'          </div>\n'
'        </div>',
'        <!-- R72-7：原「查看作品」弹窗已迁至 我的文件.html，此处删除。 -->', 1)
# (12) 删 folio JS 整段
t = sub_re(t, r'\n<script>\n/\* ==================== N9-4（批次 20260916 L12）：个人中心「我的作品集」[\s\S]*?\n</script>\n', '\n', 1)
lone = save(p, t, bom)
logs.append('个人中心.html bytes %d->%d loneLF=%d xtFolio*残留=%d' % (before, len(t), lone, len(re.findall(r'xtFolio', t))))

open(os.path.join(BASE, 'tools', 'r72_pages_out.txt'), 'w', encoding='utf-8').write('\n'.join(logs))
print('\n'.join(logs))
print('PAGES OK')
