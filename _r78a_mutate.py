# -*- coding: utf-8 -*-
"""R78：动态空间顶部背景自定义 + 我的动态卡改列表按钮。
动态空间.html：移除 .mo-entry 入口卡（含其内联 CSS）→ 换为 .xtm-hero（可换背景）+ .xtm-listrow 列表按钮；
xt-moments.js：新增 heroInit/heroApply（localStorage study_workbench_moments_bg，≤2MB，FileReader dataURL）。
xt-moments.css：本次无需改动（.mo-entry 系 CSS 全部在页面内联块中，可整块清理；新样式沿用页面内联口径，
且版本戳不得 bump，内联可避免旧 CSS 缓存导致样式丢失）——仍按铁律做了备份。
全部二进制字节级替换，CRLF 保持。
"""
import os
import shutil

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r78-20260917'


def P(rel):
    return os.path.join(ROOT, rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def rep(data, old, new, expect):
    cnt = data.count(old)
    assert cnt == expect, 'COUNT MISMATCH %r: got %d expect %d' % (old[:60], cnt, expect)
    return data.replace(old, new)


def crlf_ok(data):
    return data.count(b'\r\n') == data.count(b'\n')


def blk(lines):
    return ('\r\n'.join(lines) + '\r\n').encode('utf-8')


def log(msg):
    print(msg)


# ---------- 0. 备份（三个授权文件全部备份） ----------
targets = ['动态空间.html', r'assets\xt-moments.css', r'assets\xt-moments.js']
for t in targets:
    src = P(t)
    assert os.path.exists(src), 'missing ' + t
    shutil.copyfile(src, src + BAK)
log('BACKUP done: %d files -> *%s' % (len(targets), BAK))

# ---------- 1. 动态空间.html ----------
hp = P('动态空间.html')
h = rb(hp)
assert crlf_ok(h), '动态空间.html 含 bareLF'

# 说明：本脚本 HTML 段已成功落盘并验证；JS 段改由 _r78b_mutate_js.py 执行（勿重跑本脚本，HTML 锚点已消费）

# 1a. 整块替换内联样式：.mo-entry 系 → .xtm-hero / .xtm-listrow 系
old_style = blk([
    '<style>',
    '  /* R74：入口卡样式（自原「动态」落地页迁入，与页内卡片风格一致） */',
    '  .mo-entry{display:flex;flex-wrap:wrap;margin:12px 0 14px}',
    '  .mo-entry-card{flex:1;min-width:140px;margin:0 7px 8px 0;background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--shadow);text-decoration:none;color:var(--text);display:block;box-sizing:border-box}',
    '  .mo-entry-icon{font-size:22px}',
    '  .mo-entry-t{font-size:14px;font-weight:700;margin-top:6px;word-break:break-word}',
    '  .mo-entry-s{font-size:12px;color:var(--text-secondary);margin-top:2px}',
    '</style>',
])
new_style = blk([
    '<style>',
    '  /* R78：页顶背景自定义 hero +「我的动态」列表按钮（替换原 R74 入口卡及其样式）。',
    '     视觉口径与页内 .xtm-card / .xtm-avatar 一致；长度全部固定值，窄屏由页面既有断点接管。 */',
    '  .xtm-hero{position:relative;margin:12px 0 14px;padding:6px 46px 6px 0;background-size:cover;background-position:center;border-radius:16px}',
    '  .xtm-hero.has-bg{background-color:#1b2432}',
    '  .xtm-hero-mask{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.45);border-radius:16px;display:none}',
    '  .xtm-hero.has-bg .xtm-hero-mask{display:block}',
    '  .xtm-hero-btn{position:absolute;top:8px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '  .xtm-hero-btn:active{background:rgba(0,0,0,.55)}',
    '  #xtmBgBtn{right:8px}',
    '  #xtmBgReset{right:44px}',
    '  .xtm-listrow{display:flex;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;box-shadow:var(--shadow);text-decoration:none;color:var(--text);box-sizing:border-box}',
    '  .xtm-listrow-icon{width:38px;height:38px;border-radius:12px;flex-shrink:0;margin-right:10px;background:linear-gradient(135deg,var(--primary-light),#e9ecff);display:flex;align-items:center;justify-content:center;font-size:17px;overflow:hidden}',
    '  .xtm-listrow-main{flex:1;min-width:0}',
    '  .xtm-listrow-t{font-size:14px;font-weight:700;color:var(--text)}',
    '  .xtm-listrow-s{font-size:12px;color:var(--text-secondary);margin-top:2px}',
    '  .xtm-listrow-arrow{color:var(--text-secondary);font-size:20px;flex-shrink:0;padding-left:6px}',
    '</style>',
])
h = rep(h, old_style, new_style, 1)

# 1b. 入口卡区 → hero 区 + 列表按钮
old_entry = blk([
    '    <!-- R74：入口卡区（自原「动态」落地页迁入）。原「朋友圈信息流」入口已由本页信息流主体承接，此处保留「我的动态」直达卡 -->',
    '    <div class="mo-entry">',
    '      <a class="mo-entry-card" href="我的动态.html">',
    '        <div class="mo-entry-icon">👤</div>',
    '        <div class="mo-entry-t">我的动态</div>',
    '        <div class="mo-entry-s">我 → 头像 → 动态</div>',
    '      </a>',
    '    </div>',
])
new_entry = blk([
    '    <!-- R78：页顶背景自定义 hero +「我的动态」列表按钮（替换原 R74 入口卡）。',
    '         🖼 换背景（本地图片 ≤2MB，dataURL 存 localStorage study_workbench_moments_bg，逻辑在 assets/xt-moments.js）',
    '         ↺ 恢复默认（清 localStorage 回落默认样式）；有背景时遮罩层保证文字可读。 -->',
    '    <div class="xtm-hero" id="xtmHero">',
    '      <div class="xtm-hero-mask" id="xtmHeroMask"></div>',
    '      <button class="xtm-hero-btn" id="xtmBgBtn" type="button" title="更换页顶背景" aria-label="换背景">🖼</button>',
    '      <button class="xtm-hero-btn" id="xtmBgReset" type="button" title="恢复默认背景" aria-label="恢复默认" style="display:none">↺</button>',
    '      <input type="file" id="xtmBgFile" accept="image/*" style="display:none">',
    '      <a class="xtm-listrow" id="xtmMineRow" href="我的动态.html">',
    '        <div class="xtm-listrow-icon">👤</div>',
    '        <div class="xtm-listrow-main">',
    '          <div class="xtm-listrow-t">我的动态</div>',
    '          <div class="xtm-listrow-s">我 → 头像 → 动态</div>',
    '        </div>',
    '        <div class="xtm-listrow-arrow">›</div>',
    '      </a>',
    '    </div>',
])
h = rep(h, old_entry, new_entry, 1)

assert h.count('mo-entry'.encode('utf-8')) == 0, 'mo-entry 残留'
assert h.count('class="xtm-listrow"'.encode('utf-8')) == 1
assert h.count('id="xtmBgBtn"'.encode('utf-8')) == 1
assert h.count('id="xtmBgReset"'.encode('utf-8')) == 1
assert h.count('id="xtmBgFile"'.encode('utf-8')) == 1
assert h.count('study_workbench_moments_bg'.encode('utf-8')) == 1
assert h.count(b'clamp(') == 0 and h.count(b'min(') == 0 and h.count(b'max(') == 0
assert crlf_ok(h), '新 HTML bareLF'
wb(hp, h)
log('UPDATE 动态空间.html bytes=%d' % len(h))

# ---------- 2. assets/xt-moments.js ----------
jp = P(r'assets\xt-moments.js')
j = rb(jp)
assert crlf_ok(j), 'xt-moments.js 含 bareLF'

# 2a. initFeedPage 内接线（hero 元素缺失时自动跳过，不影响 mine/publish 页）
anchor_call = '  function initFeedPage() {\r\n    S.page = \'feed\';\r\n'.encode('utf-8')
new_call = ('  function initFeedPage() {\r\n    S.page = \'feed\';\r\n'
            '    heroInit(); /* R78：页顶背景自定义（无 #xtmHero 的页面自动跳过） */\r\n').encode('utf-8')
j = rep(j, anchor_call, new_call, 1)

# 2b. 新增 hero 段（插在「对外接口」注释前；ES2017 语法）
hero_js = blk([
    '  /* ============================ R78：页顶背景自定义（动态空间信息流页） ============================',
    '     #xtmHero 存在时启用：🖼 选本地图片（≤2MB）→ FileReader dataURL → localStorage',
    '     study_workbench_moments_bg；↺ 恢复默认（清 key）。有背景时加半透明遮罩保证可读性。 */',
    "  var BG_KEY = 'study_workbench_moments_bg';",
    '  var BG_MAX_BYTES = 2 * 1024 * 1024;',
    '  function heroApply(url) {',
    '    var hero = $(\'xtmHero\');',
    '    if (!hero) return;',
    "    var mask = $('xtmHeroMask');",
    "    var reset = $('xtmBgReset');",
    '    if (url) {',
    '      hero.style.backgroundImage = \'url("\' + String(url).replace(/"/g, \'%22\') + \'")\';',
    "      hero.classList.add('has-bg');",
    "      if (mask) mask.style.display = 'block';",
    "      if (reset) reset.style.display = '';",
    '    } else {',
    "      hero.style.backgroundImage = '';",
    "      hero.classList.remove('has-bg');",
    "      if (mask) mask.style.display = 'none';",
    "      if (reset) reset.style.display = 'none';",
    '    }',
    '  }',
    '  function heroInit() {',
    "    var hero = $('xtmHero');",
    '    if (!hero) return;',
    '    var saved = \'\';',
    '    try { saved = localStorage.getItem(BG_KEY) || \'\'; } catch (e) { saved = \'\'; }',
    "    if (saved && saved.indexOf('data:image/') === 0) heroApply(saved);",
    '    else {',
    '      if (saved) { try { localStorage.removeItem(BG_KEY); } catch (e) {} }',
    "      heroApply('');",
    '    }',
    "    var btn = $('xtmBgBtn');",
    "    var file = $('xtmBgFile');",
    "    var reset = $('xtmBgReset');",
    '    if (btn && file) {',
    '      btn.onclick = function () { file.value = \'\'; file.click(); };',
    '    }',
    '    if (file) {',
    "      file.addEventListener('change', function () {",
    '        var f = (this.files && this.files[0]) || null;',
    '        this.value = \'\';',
    '        if (!f) return;',
    "        if (f.size > BG_MAX_BYTES) { toast('背景图不能超过 2MB，请换一张'); return; }",
    '        var rd = new FileReader();',
    '        rd.onload = function (e) {',
    '          var url = String((e.target && e.target.result) || \'\');',
    "          if (url.indexOf('data:image/') !== 0) { toast('仅支持图片文件'); return; }",
    '          try { localStorage.setItem(BG_KEY, url); } catch (er) { toast(\'背景保存失败：本地存储空间不足\'); return; }',
    '          heroApply(url);',
    "          toast('✅ 背景已更新');",
    '        };',
    "        rd.onerror = function () { toast('读取图片失败，请重试'); };",
    '        rd.readAsDataURL(f);',
    '      });',
    '    }',
    '    if (reset) {',
    '      reset.onclick = function () {',
    '        try { localStorage.removeItem(BG_KEY); } catch (e) {}',
    "        heroApply('');",
    "        toast('已恢复默认背景');",
    '      };',
    '    }',
    '  }',
    '',
])
anchor_api = '  /* ============================ 对外接口 ============================ */'.encode('utf-8')
j = rep(j, anchor_api, hero_js + anchor_api, 1)

assert j.count('study_workbench_moments_bg'.encode('utf-8')) == 2  # 注释 + BG_KEY 赋值
assert j.count(b'heroInit') == 2  # 定义 + initFeedPage 接线
assert crlf_ok(j), '新 JS bareLF'
wb(jp, j)
log('UPDATE assets/xt-moments.js bytes=%d' % len(j))

log('ALL MUTATIONS DONE OK')
