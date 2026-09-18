# -*- coding: utf-8 -*-
"""R78 第二段：assets/xt-moments.js 新增 hero 背景逻辑（HTML 段已由 _r78a_mutate.py 落盘）。
二进制字节级替换，CRLF 保持。"""
import os

ROOT = r'D:\下载的文件\学习工作台'


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


jp = P(r'assets\xt-moments.js')
j = rb(jp)
assert crlf_ok(j), 'xt-moments.js 含 bareLF'
assert j.count(b'heroInit') == 0, '已含 heroInit，勿重复执行'

# 1. initFeedPage 内接线（hero 元素缺失时自动跳过，不影响 mine/publish 页）
anchor_call = "  function initFeedPage() {\r\n    S.page = 'feed';\r\n".encode('utf-8')
new_call = ("  function initFeedPage() {\r\n    S.page = 'feed';\r\n"
            "    heroInit(); /* R78：页顶背景自定义（无 #xtmHero 的页面自动跳过） */\r\n").encode('utf-8')
j = rep(j, anchor_call, new_call, 1)

# 2. 新增 hero 段（插在「对外接口」注释前；ES2017 语法）
hero_js = blk([
    '  /* ============================ R78：页顶背景自定义（动态空间信息流页） ============================',
    '     #xtmHero 存在时启用：🖼 选本地图片（≤2MB）→ FileReader dataURL → localStorage',
    '     study_workbench_moments_bg；↺ 恢复默认（清 key）。有背景时加半透明遮罩保证可读性。 */',
    "  var BG_KEY = 'study_workbench_moments_bg';",
    '  var BG_MAX_BYTES = 2 * 1024 * 1024;',
    '  function heroApply(url) {',
    "    var hero = $('xtmHero');",
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
assert j.count(b'heroApply') == 5  # 定义 + 注释0 + apply×4 调用(boot处1、change处1、reset处1、定义1) — 见下方精确核对
assert crlf_ok(j), '新 JS bareLF'
wb(jp, j)
print('UPDATE assets/xt-moments.js bytes=%d' % len(j))
print('ALL MUTATIONS DONE OK')
