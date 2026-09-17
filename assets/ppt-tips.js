/* =====================================================================
   ppt-tips.js · B1「PPT · 技巧提升」学练闭环渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   ---------------------------------------------------------------------
   挂载方式（ADR-2 注册表模式）：
     · 幂等注册 window.PPTV2['ppt-tips']（幂等：宿主页 演示.html 已由 T00 预埋
       注册表分发逻辑，本文件**不改任何 HTML 结构**，挂载点沿用 #pptPanelSlot）。
     · 學练闭环三个 tab：技巧速览（原 5 张卡片原样保留 + 可展开深入）
                        → 技巧练习（每个技巧 2-3 题，共 13 题，全部带解析）
                        → 实战任务（6 项 checklist，可勾选留存）
     · 原 5 张卡的 title/body 逐字保留在 first tab（零删除）。
     · 不依赖 app.js / mini.js 的任何渲染函数；XTC 可用时优先复用其组件。
     · 不调用 saveData()；localStorage 键前缀 xtc:lib:pt:
       （★ 独立二级键 xtc:lib:，绝不使用 xtc:learn: 通用契约命名空间）。
     · 每次 innerHTML 后补一次 window.lucideAutoRender()（icon-map 只扫一次）。
     · ES5 语法：无箭头函数 / 无可选链 / 无模板字符串。
   ---------------------------------------------------------------------
   2026-09-15 · P0 五项改造（需求 N9-14 / W2-T4，只增不改）：
     ① 正反例对比图：数据侧 items[i].cases[{k,t,bad,good,note}]，本文件用
        PT_caseSvg() 内联 SVG 自绘（k = key/align/image/anim/flow），file://
        与老 WebView 都能渲染，**不外链任何图片资源**。
     ② 标记已学：每节底部「我已学完本节」按钮，存 xtc:lib:pt:<id>:learned；
        顶部细进度条随 #pptPanelBody 滚动更新（本节已读 %）。
     ③ 「小测 N 题」「正反例 M 组」由死标签改为页内可点击入口：
        小测 → 页内答题区（优先 XTC.renderQuiz，缺失时本地兜底 PT_localQuiz，
        交卷给分 + 逐题解析）；正反例 → 页内翻页对比。一律**不做全屏 modal**（ADR-3）。
     ④ 正文卡片化：detail.groups 拆成可折叠要点小卡（默认只开第一张），
        关键句（「」引号内 / 冒号前 / **标记**）加粗高亮。
     ⑤ 顶部导航栏去橙：在宿主页 演示.html 的 <style> 内覆盖 .ppt-view-top
        （浅灰/白 + common.css 令牌），本文件不碰 common.css。
     localStorage 全部经 PT_get/PT_set 包裹，不可用时不抛错、静默回退。
   ---------------------------------------------------------------------
   2026-09-16 · L8（N9-14 收口，三件事。本批 A5 已把 ⑥⑦⑧ 全部接线落地）：
     ⑥ PT_art()：data-ppt-tips.js 的 casesArt[]（11 组数据驱动图元）此前**没有渲染器，
        是死数据**。现按数据侧约定的 200×130 画布，把 r/c/l/t 四类图元现场绘成内联
        SVG，并由 PT_figure() 接入正反例画廊，图随 data 走，**零外部图片依赖**，
        file:// 与老 WebView 通吃，不会出现 404。
     ⑦ 对比图回填位：PT_CASE_IMG 映射表 + PT_figure()。表里有真实截图就出 <img>，
        图缺失（404 / naturalWidth=0）由 PT_bindFigures() 摘掉 <img> 露出下层手绘
        SVG 兜底；**表为空时页面一个图片请求都不发**，杜绝占位图 404 刷屏。
        回填步骤见 PT_CASE_IMG 上方注释块。
     ⑧ cases[]（文字版模板图）与 casesArt[]（图元版）合成同一组正反例画廊
        PT_casePool()，同题材重复项由数据侧 dup 标记过滤，
        window.PptTips.setHideDup(false) 可一键恢复全陈列（数据一行未删）。
        casesArt 在前、cases 在后；画廊计数与翻页均走同一池，三处口径一致。
   ===================================================================== */
(function () {
  'use strict';

  var VIEW_ID = 'ppt-tips';
  var STYLE_ID = 'ppt-tips-style-v2';
  var LS_PREFIX = 'xtc:lib:pt:';
  var TAB_KEY = LS_PREFIX + 'tab';
  var TAB_SCAN = 'scan';
  var TAB_QUIZ = 'quiz';
  var TAB_TASK = 'task';
  var curTab = TAB_SCAN;

  /* ---- 2026-09-15 P0 新增运行状态（仅内存，不落盘） ---- */
  var PT_cur = null;     // 当前数据对象（页内区块回调复用）
  var PT_inline = {};    // { itemId: 'quiz' | 'cases' | '' } 页内区块展开态
  var PT_caseIdx = {};   // { itemId: 0 } 正反例翻页下标

  /* =====================================================================
     ★★ 占位点 / 资源回填点（2026-09-16 L8）★★
     =====================================================================
     现状：assets/images/ppt-tips/ 目录尚不存在，实拍对比图未交付。
           本文件因此**默认不发任何图片请求**，对比图全部由内联 SVG 手绘
           （老的 file:// 与安卓 WebView 都能画），页面不会 404、不会报错。

     回填三步（拿到实拍图后，资源方无需动逻辑，只动这张表）：
       1) 把图片放进 assets/images/ppt-tips/ ，建议命名：
            <技巧id>_<序号>_bad.png / <技巧id>_<序号>_good.png
            技巧 id 依次为 tips-key / tips-align / tips-image / tips-anim / tips-flow
            例：assets/images/ppt-tips/tips-align_0_bad.png
       2) 按下表 key 规则写进 PT_CASE_IMG（同一个表中可只填部分 key，未填的继续
          用手绘 SVG，不会报错）：
            key = <技巧id> + '|' + <kind> + '|' + <组内序号> + '|' + <bad|good>
            kind = art（casesArt 的图元组，序号从 0 起，按 casesArt 数组顺序）
                 = tpl（cases 的模板组，序号从 0 起，按过滤后的展示顺序）
       3) 想先看小李 diag 效果，浏览器控制台跑：
            PptTips.imgInfo()              // 列出全部可回填 key
            PptTips.setImgMap({...})       // 临时塞一张图试看
     注意：图缺失时 PT_bindFigures() 会把 <img> 摘掉、露出手绘 SVG 兜底，
           绝不会留下一个坏掉的图标或刷一片 404。  */
  var PT_CASE_IMG = {
    /* 示例（保持注释状态，勿直接放开，指向不存在的文件会白跑一次请求）：
    'tips-align|art|0|bad':  'assets/images/ppt-tips/tips-align_0_bad.png',
    'tips-align|art|0|good': 'assets/images/ppt-tips/tips-align_0_good.png'
    */
  };

  /* true：与 art 图元组同题材的旧文字组（数据侧 dup:1）不在画廊里重复出现。
     false：27 组全陈列。数据一行没删，随时可翻回来。 */
  var PT_HIDE_DUP = true;

  /* ==================== helper（PT_ 前缀） ==================== */

  function PT_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function PT_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + PT_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  function PT_hydrate(root) {
    try {
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); return; }
    } catch (e) { /* 忽略 */ }
    var X = window.XTC;
    if (X && typeof X.renderIcons === 'function') {
      try { X.renderIcons(root || document); } catch (e2) { /* 忽略 */ }
    }
  }

  function PT_key(id, kind) {
    var k = LS_PREFIX + String(id) + ':' + kind;
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略 */ }
    }
    return k;
  }

  function PT_get(key, def) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }

  function PT_set(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function PT_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
    } catch (e) { /* 忽略 */ }
  }

  function PT_qBest(id) {
    var v = PT_get(PT_key(id, 'best'), null);
    if (!v || typeof v !== 'object') return null;
    return v;
  }

  function PT_taskDone(id) { return PT_get(PT_key(id, 'task'), 0) === 1; }

  function PT_data() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[VIEW_ID];
    if (!d || d.v !== 2 || !d.items || !d.items.length) return null;
    return d;
  }

  /* ---- P0-2：已学标记（键 xtc:lib:pt:<id>:learned） ---- */
  function PT_learned(id) { return PT_get(PT_key(id, 'learned'), 0) === 1; }

  /* ---- P0-4：小卡展开态（键 xtc:lib:pt:grp:<id>，默认展开第一张） ---- */
  function PT_grpKey(id) { return LS_PREFIX + 'grp:' + String(id); }

  function PT_grpOpen(id, len) {
    var raw = PT_get(PT_grpKey(id), null);
    var v = (raw === null) ? 0 : parseInt(raw, 10);
    if (isNaN(v)) v = 0;
    if (v >= len) v = 0;
    if (v < -1) v = -1;
    return v;
  }

  function PT_item(data, id) {
    var items = (data && data.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function PT_cases(data, id) {
    var it = PT_item(data, id);
    return (it && it.cases) || [];
  }

  function PT_name(data, id) {
    var it = PT_item(data, id);
    return it ? (it.name || id) : id;
  }

  /* ---- P0-4：关键句加粗高亮（**标记** / 「」引号 / 冒号前短语） ---- */
  function PT_hlSeg(seg) {
    var re = /“([^”]{1,16})”/g;
    var out = '', last = 0, m, hit = false;
    while ((m = re.exec(seg))) {
      hit = true;
      out += PT_esc(seg.slice(last, m.index));
      out += '<b class="hl">“' + PT_esc(m[1]) + '”</b>';
      last = m.index + m[0].length;
    }
    if (hit) { out += PT_esc(seg.slice(last)); return out; }
    var p = seg.indexOf('：');
    if (p > 0 && p <= 26) {
      return '<b class="hl">' + PT_esc(seg.slice(0, p)) + '</b>' + PT_esc(seg.slice(p));
    }
    return PT_esc(seg);
  }

  function PT_hl(s) {
    var t = (s === null || s === undefined) ? '' : String(s);
    var parts = t.split('**');
    var out = '', i;
    for (i = 0; i < parts.length; i++) {
      if (i % 2 === 1) out += '<b class="hl">' + PT_esc(parts[i]) + '</b>';
      else out += PT_hlSeg(parts[i]);
    }
    return out;
  }

  /* ==================== P0-1：正反例对比图（内联 SVG 自绘） ==================== */

  function PT_svgWrap(inner) {
    return '<svg class="pt-svg" viewBox="0 0 240 140" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }

  function PT_svgFrame() {
    return '<rect x="1.5" y="1.5" width="237" height="137" rx="8" fill="#FFFFFF" stroke="#E8ECF0" stroke-width="1"/>' +
      '<rect x="16" y="14" width="96" height="9" rx="4.5" fill="#DDE3EA"/>';
  }

  /* 快捷键提效：多步手动 vs 一键 */
  function PT_svgKey(bad) {
    var s = PT_svgFrame(), i, xs = [16, 72, 128];
    if (bad) {
      for (i = 0; i < 6; i++) {
        var x = xs[i % 3], y = (i < 3) ? 36 : 72;
        s += '<rect x="' + x + '" y="' + y + '" width="48" height="22" rx="5" fill="#F1F3F5" stroke="#DDE3EA"/>';
      }
      s += '<line x1="64" y1="47" x2="72" y2="47" stroke="#B2BEC3" stroke-width="1"/>';
      s += '<line x1="120" y1="47" x2="128" y2="47" stroke="#B2BEC3" stroke-width="1"/>';
      s += '<line x1="40" y1="58" x2="40" y2="72" stroke="#B2BEC3" stroke-width="1"/>';
      s += '<text x="196" y="52" text-anchor="middle" font-size="9" fill="#C0392B">6 步</text>';
      s += '<text x="120" y="126" text-anchor="middle" font-size="9" fill="#C0392B">逐个手动 · 来回切换菜单</text>';
    } else {
      s += '<rect x="26" y="44" width="76" height="32" rx="8" fill="#E6FBFA" stroke="#36CFC9"/>';
      s += '<text x="64" y="65" text-anchor="middle" font-size="10" fill="#2AB5AF">Ctrl+D</text>';
      s += '<line x1="106" y1="60" x2="128" y2="60" stroke="#36CFC9" stroke-width="1.2"/>';
      s += '<polygon points="134,60 124,56 124,64" fill="#36CFC9"/>';
      s += '<rect x="138" y="44" width="80" height="32" rx="8" fill="#F5F7FA" stroke="#DDE3EA"/>';
      s += '<text x="178" y="65" text-anchor="middle" font-size="9" fill="#6B7280">6 张卡就位</text>';
      s += '<text x="120" y="106" text-anchor="middle" font-size="9" fill="#2E7D32">1 步完成 · 等距自动偏移</text>';
    }
    return PT_svgWrap(s);
  }

  /* 对齐三件套：错位 vs 对齐 + 等距 */
  function PT_svgAlign(bad) {
    var s = PT_svgFrame();
    if (bad) {
      s += '<rect x="14" y="44" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<rect x="80" y="58" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<rect x="152" y="38" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<line x1="10" y1="44" x2="230" y2="44" stroke="#FF6B6B" stroke-width="1" stroke-dasharray="4 3"/>';
      s += '<line x1="109" y1="44" x2="109" y2="58" stroke="#FF6B6B" stroke-width="1"/>';
      s += '<line x1="181" y1="44" x2="181" y2="38" stroke="#FF6B6B" stroke-width="1"/>';
      s += '<text x="120" y="126" text-anchor="middle" font-size="9" fill="#C0392B">高低不齐 · 间距不等</text>';
    } else {
      s += '<rect x="14" y="44" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<rect x="91" y="44" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<rect x="168" y="44" width="58" height="38" rx="4" fill="#CFE3FF" stroke="#9CC3F0"/>';
      s += '<line x1="10" y1="44" x2="230" y2="44" stroke="#36CFC9" stroke-width="1" stroke-dasharray="4 3"/>';
      s += '<line x1="72" y1="106" x2="91" y2="106" stroke="#36CFC9" stroke-width="1"/>';
      s += '<line x1="72" y1="102" x2="72" y2="110" stroke="#36CFC9" stroke-width="1"/>';
      s += '<line x1="91" y1="102" x2="91" y2="110" stroke="#36CFC9" stroke-width="1"/>';
      s += '<line x1="149" y1="106" x2="168" y2="106" stroke="#36CFC9" stroke-width="1"/>';
      s += '<line x1="149" y1="102" x2="149" y2="110" stroke="#36CFC9" stroke-width="1"/>';
      s += '<line x1="168" y1="102" x2="168" y2="110" stroke="#36CFC9" stroke-width="1"/>';
      s += '<text x="120" y="128" text-anchor="middle" font-size="9" fill="#2E7D32">顶端对齐 · 间距等分</text>';
    }
    return PT_svgWrap(s);
  }

  /* 图片处理：比例各异 vs 统一比例 */
  function PT_svgImage(bad) {
    var s = PT_svgFrame();
    if (bad) {
      s += '<rect x="14" y="34" width="58" height="46" rx="3" fill="#CFE3FF" stroke="#C9D6E4"/>';
      s += '<rect x="78" y="44" width="46" height="30" rx="3" fill="#FFE3D1" stroke="#C9D6E4"/>';
      s += '<rect x="130" y="30" width="52" height="54" rx="3" fill="#E3DAF7" stroke="#C9D6E4"/>';
      s += '<rect x="188" y="48" width="40" height="24" rx="3" fill="#D9F2EF" stroke="#C9D6E4"/>';
      s += '<line x1="18" y1="72" x2="68" y2="40" stroke="#C0392B" stroke-width="1" stroke-dasharray="3 3"/>';
      s += '<text x="120" y="126" text-anchor="middle" font-size="9" fill="#C0392B">比例各异 · 高低错落</text>';
    } else {
      var xs = [14, 72, 130, 188], i;
      for (i = 0; i < xs.length; i++) {
        s += '<rect x="' + xs[i] + '" y="42" width="48" height="36" rx="3" fill="#CFE3FF" stroke="#9CC3F0"/>';
      }
      s += '<line x1="10" y1="94" x2="230" y2="94" stroke="#36CFC9" stroke-width="1" stroke-dasharray="4 3"/>';
      s += '<text x="120" y="126" text-anchor="middle" font-size="9" fill="#2E7D32">统一 4:3 · 同一处理</text>';
    }
    return PT_svgWrap(s);
  }

  /* 动画克制：花式乱飞 vs 统一淡入 */
  function PT_svgAnim(bad) {
    var s = PT_svgFrame();
    if (bad) {
      s += '<g transform="rotate(-12 47 70)"><rect x="24" y="52" width="46" height="34" rx="4" fill="#FFE3D1" stroke="#FF9F68"/></g>';
      s += '<g transform="rotate(10 121 70)"><rect x="98" y="52" width="46" height="34" rx="4" fill="#E3DAF7" stroke="#8B5CF6"/></g>';
      s += '<g transform="rotate(-8 195 70)"><rect x="172" y="52" width="46" height="34" rx="4" fill="#D9F2EF" stroke="#18C29C"/></g>';
      s += '<path d="M20 112 Q 120 134 220 108" fill="none" stroke="#FAAD14" stroke-width="1.2" stroke-dasharray="4 3"/>';
      s += '<polygon points="220,108 210,104 212,113" fill="#FAAD14"/>';
      s += '<text x="120" y="128" text-anchor="middle" font-size="9" fill="#C0392B">5 种效果 · 1.0s · 带音效</text>';
    } else {
      s += '<rect x="24" y="52" width="46" height="34" rx="4" fill="#E6FBFA" stroke="#36CFC9" opacity="0.45"/>';
      s += '<rect x="98" y="52" width="46" height="34" rx="4" fill="#E6FBFA" stroke="#36CFC9" opacity="0.7"/>';
      s += '<rect x="172" y="52" width="46" height="34" rx="4" fill="#E6FBFA" stroke="#36CFC9"/>';
      s += '<text x="47" y="100" text-anchor="middle" font-size="8" fill="#6B7280">0.3s</text>';
      s += '<text x="121" y="100" text-anchor="middle" font-size="8" fill="#6B7280">0.3s</text>';
      s += '<text x="195" y="100" text-anchor="middle" font-size="8" fill="#6B7280">0.3s</text>';
      s += '<text x="120" y="126" text-anchor="middle" font-size="9" fill="#2E7D32">同一种淡入 · 0.3s</text>';
    }
    return PT_svgWrap(s);
  }

  /* 演示衔接：文字墙 vs 一页一结论 */
  function PT_svgFlow(bad) {
    var s = '<rect x="1.5" y="1.5" width="237" height="137" rx="8" fill="#FFFFFF" stroke="#E8ECF0" stroke-width="1"/>';
    if (bad) {
      s += '<rect x="16" y="16" width="120" height="9" rx="4.5" fill="#DDE3EA"/>';
      var ys = [36, 46, 56, 66, 76, 86, 96, 106, 116];
      var ws = [206, 194, 202, 178, 206, 188, 198, 168, 146];
      for (var i = 0; i < ys.length; i++) {
        s += '<rect x="16" y="' + ys[i] + '" width="' + ws[i] + '" height="6" rx="3" fill="#DDE3EA"/>';
      }
      s += '<text x="120" y="132" text-anchor="middle" font-size="9" fill="#C0392B">整页文字 · 读字不听讲</text>';
    } else {
      s += '<rect x="16" y="16" width="150" height="12" rx="6" fill="#36CFC9"/>';
      s += '<circle cx="21" cy="56" r="3" fill="#36CFC9"/><rect x="32" y="52" width="120" height="7" rx="3.5" fill="#DDE3EA"/>';
      s += '<circle cx="21" cy="76" r="3" fill="#36CFC9"/><rect x="32" y="72" width="104" height="7" rx="3.5" fill="#DDE3EA"/>';
      s += '<circle cx="21" cy="96" r="3" fill="#36CFC9"/><rect x="32" y="92" width="88" height="7" rx="3.5" fill="#DDE3EA"/>';
      s += '<text x="120" y="132" text-anchor="middle" font-size="9" fill="#2E7D32">标题是结论 · 只留三行</text>';
    }
    return PT_svgWrap(s);
  }

  /* ==================== P0-1（补）：casesArt 图元 → 内联 SVG ====================
     画布由数据侧约定为 200 × 130；四类图元：
       r 矩形 {x,y,w,h,f 填充,s 描边,r 圆角,d 虚线}
       c 圆   {x,y,r,f 填充,s 描边,d 虚线}
       l 线   {x,y,x2,y2,c 颜色,d 虚线}
       t 文字 {x,y,s 内容,f 字号,c 颜色,b 粗体,a start|middle|end}
     全部最大 ES2017 / 老 WebView 可用元素，不用 transform-box 之类新技术。 */

  function PT_n(v, def) {
    var n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  function PT_color(v, def) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (!s) return def;
    return PT_esc(s);
  }

  function PT_artPrim(p) {
    if (!p || !p.k) return '';
    var k = p.k, d = p.d ? ' stroke-dasharray="4 3"' : '';
    if (k === 'r') {
      return '<rect x="' + PT_n(p.x, 0) + '" y="' + PT_n(p.y, 0) +
        '" width="' + PT_n(p.w, 0) + '" height="' + PT_n(p.h, 0) +
        '" rx="' + PT_n(p.r, 0) + '" ry="' + PT_n(p.r, 0) +
        '" fill="' + PT_color(p.f, '#E5E7EB') +
        '" stroke="' + PT_color(p.s, 'none') + '" stroke-width="1"' + d + '/>';
    }
    if (k === 'c') {
      return '<circle cx="' + PT_n(p.x, 0) + '" cy="' + PT_n(p.y, 0) +
        '" r="' + PT_n(p.r, 3) + '" fill="' + PT_color(p.f, '#E5E7EB') +
        '" stroke="' + PT_color(p.s, 'none') + '" stroke-width="1"' + d + '/>';
    }
    if (k === 'l') {
      return '<line x1="' + PT_n(p.x, 0) + '" y1="' + PT_n(p.y, 0) +
        '" x2="' + PT_n(p.x2, 0) + '" y2="' + PT_n(p.y2, 0) +
        '" stroke="' + PT_color(p.c, '#CBD5E1') + '" stroke-width="1"' + d + '/>';
    }
    if (k === 't') {
      var a = (p.a === 'middle' || p.a === 'end') ? ' text-anchor="' + p.a + '"' : '';
      var b = p.b ? ' font-weight="700"' : '';
      return '<text x="' + PT_n(p.x, 0) + '" y="' + PT_n(p.y, 0) +
        '" font-size="' + PT_n(p.f, 9) + '" fill="' + PT_color(p.c, '#475569') +
        '"' + a + b + '>' + PT_esc(p.s || '') + '</text>';
    }
    return '';
  }

  /* @param {Array} list 图元数组；@return {string} 内联 <svg> 串 */
  function PT_art(list) {
    var arr = list || [];
    var s = '<rect x="0.5" y="0.5" width="199" height="129" rx="6" fill="#FFFFFF" stroke="#E8ECF0" stroke-width="1"/>';
    for (var i = 0; i < arr.length; i++) s += PT_artPrim(arr[i]);
    return '<svg class="pt-svg pt-svg-art" viewBox="0 0 200 130" preserveAspectRatio="xMidYMid meet">' + s + '</svg>';
  }

  /* ==================== P0-1（补·L8-⑧）：正反例画廊统一池 ====================
     cases[]（文字模板图，数据侧 k = key/align/image/anim/flow，由 PT_caseSvg 画）
     与 casesArt[]（图元图，数据侧 art[] 图元，由 PT_art 画）合成同一组画廊条目：
       { t 标题, kind:'tpl'|'art', seq 组内序号, bad:{cap,art|k}, good:{cap,art|k}, note }
     同题材重复项（数据侧 dup:1，仅 art 组带该标记）默认被 PT_HIDE_DUP 过滤掉，
     数据一行未删；window.PptTips.setHideDup(false) 可恢复全陈列。 */

  /* @param {Object} it 单个技巧 item
     @param {boolean} hideDup 是否滤掉数据侧 dup:1 的文字组
     @return {Array} 画廊条目数组 */
  function PT_casePool(it, hideDup) {
    var pool = [];
    var i, c, arts, tpls;
    if (!it) return pool;
    arts = it.casesArt || [];
    for (i = 0; i < arts.length; i++) {
      c = arts[i] || {};
      pool.push({
        t: c.t || '',
        kind: 'art',
        seq: i,
        dup: 0,
        bad: { cap: (c.bad && c.bad.cap) || '', art: (c.bad && c.bad.art) || [] },
        good: { cap: (c.good && c.good.cap) || '', art: (c.good && c.good.art) || [] },
        note: c.note || ''
      });
    }
    tpls = it.cases || [];
    for (i = 0; i < tpls.length; i++) {
      c = tpls[i] || {};
      /* dup 标记只在 hideDup 为真时生效；数据未删，随时翻回来 */
      if (hideDup && c.dup) continue;
      pool.push({
        t: c.t || '',
        kind: 'tpl',
        seq: i,
        dup: c.dup ? 1 : 0,
        bad: { cap: c.bad || '', k: c.k || 'key' },
        good: { cap: c.good || '', k: c.k || 'key' },
        note: c.note || ''
      });
    }
    return pool;
  }

  /* ==================== P0-1（补·L8-⑦）：图片回填位 ====================
     PT_CASE_IMG 里填了真实截图 key 就出 <img>，图缺失（加载失败 / naturalWidth=0）
     由 PT_bindFigures() 摘掉 <img>、露出下层手绘 SVG 兜底；表为空时一个图片请求都不发。 */

  /* @return {string} 该侧要显示的图片路径，无则 '' */
  function PT_imgSrc(id, kind, seq, mode) {
    var key = String(id) + '|' + kind + '|' + seq + '|' + mode;
    var v = PT_CASE_IMG[key];
    return (typeof v === 'string' && v) ? v : '';
  }

  /* 单侧图形：有截图出 <img>（下层仍垫一份手绘 SVG 兜底），否则只出手绘 SVG。
     @param {Object} it 技巧 item；@param {string} id；@param {Object} e 画廊条目
     @param {string} mode 'bad' | 'good'；@return {string} innerHTML 片段 */
  function PT_figure(it, id, e, mode) {
    var one = (mode === 'bad') ? e.bad : e.good;
    var svg = '';
    if (e.kind === 'art') svg = PT_art(one.art || []);
    else svg = PT_caseSvg(one.k || 'key', mode);
    var src = PT_imgSrc(id, e.kind, e.seq, mode);
    var h = '<div class="pt-fig">';
    if (src) {
      h += '<div class="pt-fig-wrap">';
      h += '<img class="pt-fig-img" alt="' + PT_esc(e.t || '') + '" data-fig-key="' +
        PT_esc(String(id) + '|' + e.kind + '|' + e.seq + '|' + mode) + '" src="' + PT_esc(src) + '">';
      /* 手绘 SVG 垫在 <img> 下面：图片一旦被摘掉，这一层自然露出，不留白屏 */
      h += '<div class="pt-fig-fb">' + svg + '</div>';
      h += '</div>';
    } else {
      /* 表里没有这张图 → 连 <img> 都不生成，页面零图片请求 */
      h += svg;
    }
    h += '</div>';
    return h;
  }

  /* 把加载失败的 <img> 摘掉，露出手绘 SVG 兜底（老 WebView 无 naturalWidth 时按 onerror 处理） */
  function PT_bindFigures(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    var imgs = root.querySelectorAll('img.pt-fig-img'), i;
    for (i = 0; i < imgs.length; i++) {
      (function (im) {
        function drop() {
          if (im.parentNode) im.parentNode.removeChild(im);
        }
        /* 已缓存且解码失败的图：naturalWidth 为 0 */
        try {
          if (im.complete && typeof im.naturalWidth === 'number' && im.naturalWidth === 0) { drop(); return; }
        } catch (e) { /* 忽略 */ }
        im.onerror = drop;
      })(imgs[i]);
    }
  }

  /* 列出全部可回填 key（QA / 资源方对表用） */
  function PT_imgInfo() {
    var data = PT_data(), list = [], items, i, j, e, pool;
    if (!data) return list;
    items = data.items || [];
    for (i = 0; i < items.length; i++) {
      pool = PT_casePool(items[i], false);
      for (j = 0; j < pool.length; j++) {
        e = pool[j];
        list.push(String(items[i].id) + '|' + e.kind + '|' + e.seq + '|bad');
        list.push(String(items[i].id) + '|' + e.kind + '|' + e.seq + '|good');
      }
    }
    return list;
  }

  /* k → 绘图模板；mode = 'bad' | 'good' */
  function PT_caseSvg(k, mode) {
    var bad = (mode === 'bad');
    if (k === 'align') return PT_svgAlign(bad);
    if (k === 'image') return PT_svgImage(bad);
    if (k === 'anim') return PT_svgAnim(bad);
    if (k === 'flow') return PT_svgFlow(bad);
    return PT_svgKey(bad);
  }

  /* 单侧（反面 / 正面）小图 + 说明。d 为画廊条目（kind/seq/cap 等） */
  function PT_side(it, e, mode) {
    var isBad = (mode === 'bad');
    var cap = isBad ? (e.bad && e.bad.cap) : (e.good && e.good.cap);
    return '<div class="pt-cmp-side ' + mode + '">' +
      '<div class="pt-cmp-h">' + PT_icon(isBad ? 'x-circle' : 'check-circle', 13) +
      (isBad ? '反面做法' : '正面做法') + '</div>' +
      PT_figure(it, it.id, e, mode) +
      '<div class="pt-cmp-cap">' + PT_esc(cap || '') + '</div>' +
      '</div>';
  }

  /* 正反例翻页对比（页内区块，非 modal）。
     画廊 = casesArt[]（图元版）+ cases[]（文字模板版），casesArt 在前，
     同题材重复项由 PT_HIDE_DUP 过滤。 */
  function PT_caseHtml(it) {
    var cs = PT_casePool(it, PT_HIDE_DUP);
    if (!cs.length) return '<div class="pt-empty">本节暂无正反例</div>';
    var idx = PT_caseIdx[it.id] || 0;
    if (idx < 0) idx = 0;
    if (idx >= cs.length) idx = 0;
    PT_caseIdx[it.id] = idx;
    var c = cs[idx];
    var h = '';
    h += '<div class="pt-cmp">';
    h += '<div class="pt-cmp-bar"><span class="pt-cmp-t">' + PT_esc(c.t || '') + '</span>';
    h += '<span class="pt-cmp-nav">' +
      '<span class="pt-navb" data-act="case-prev" data-id="' + PT_esc(it.id) + '">' + PT_icon('chevron-left', 14) + '</span>' +
      '<i>' + (idx + 1) + ' / ' + cs.length + '</i>' +
      '<span class="pt-navb" data-act="case-next" data-id="' + PT_esc(it.id) + '">' + PT_icon('chevron-right', 14) + '</span>' +
      '</span></div>';
    h += '<div class="pt-cmp-row">';
    h += PT_side(it, c, 'bad');
    h += '<div class="pt-cmp-mid">' + PT_icon('arrow-right', 18) + '</div>';
    h += PT_side(it, c, 'good');
    h += '</div>';
    h += '<div class="pt-cmp-note">' + PT_icon('lightbulb', 13) + '<span>' + PT_esc(c.note || '') + '</span></div>';
    h += '</div>';
    return h;
  }

  /* ==================== 样式 ==================== */

  var CSS = [
    '.pt-root{max-width:960px;margin:0 auto;color:var(--text,#1F2937)}',
    '.pt-hero{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-hero h3{margin:0 0 6px;font-size:17px;display:flex;align-items:center;gap:8px}',
    '.pt-hero p{margin:0;font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}',
    '.pt-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.pt-pill{background:var(--primary-light,#E6FBFA);color:var(--primary-dark,#2AB5AF);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600}',
    '.pt-pill.g{background:#E8F5E9;color:#2E7D32}',
    '.pt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}',
    '.pt-card{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;margin-top:12px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;cursor:pointer}',
    '.pt-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--primary-light,#E6FBFA);color:var(--primary,#36CFC9);display:inline-flex;align-items:center;justify-content:center}',
    '.pt-hmain{flex:1;min-width:200px}',
    '.pt-hmain b{font-size:15px;display:block;margin-bottom:4px}',
    '.pt-sum{font-size:12.5px;line-height:1.7;color:var(--text-secondary,#6B7280)}',
    '.pt-right{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '.pt-tag{font-size:11.5px;background:var(--bg,#F5F7FA);color:var(--text-secondary,#6B7280);border-radius:8px;padding:2px 8px}',
    '.pt-tag.g{background:#E8F5E9;color:#2E7D32}',
    '.pt-fold{font-size:12px;color:var(--text-secondary,#9CA3AF);display:flex;align-items:center;gap:3px}',
    '.pt-body{border-top:1px dashed var(--border,#E8ECF0);margin-top:12px;padding-top:12px}',
    '.pt-grp{margin-bottom:12px}',
    '.pt-grp-h{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px}',
    '.pt-grp-h .nav-icon{color:var(--primary,#36CFC9)}',
    '.pt-ul{margin:0;padding-left:20px;font-size:12.5px;line-height:1.85;color:var(--text-secondary,#6B7280)}',
    '.pt-quiz-host{margin-top:8px}',
    '.pt-task{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid var(--border,#E8ECF0);border-radius:11px;margin-bottom:8px;cursor:pointer;background:var(--card,#fff)}',
    '.pt-task:hover{border-color:var(--primary,#36CFC9)}',
    '.pt-task.on{background:#E8F5E9;border-color:#2E7D32}',
    '.pt-box{flex:none;width:17px;height:17px;border-radius:5px;border:1px solid var(--border,#E8ECF0);display:inline-flex;align-items:center;justify-content:center;margin-top:2px}',
    '.pt-task.on .pt-box{background:#2E7D32;border-color:#2E7D32;color:#fff}',
    '.pt-task b{display:block;font-size:13px;margin-bottom:2px}',
    '.pt-task span.d{font-size:12.5px;line-height:1.65;color:var(--text-secondary,#6B7280)}',
    '.pt-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;margin-top:12px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.pt-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.pt-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.pt-empty{padding:18px 0;text-align:center;font-size:12.5px;color:var(--text-secondary,#9CA3AF)}',
    '.pt-credit{margin-top:12px;font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}',
    /* ===== 2026-09-15 P0：阅读进度条（②） ===== */
    '.pt-prog{position:sticky;top:0;z-index:6;background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:12px;padding:8px 12px;margin-top:12px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-prog-in{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary,#6B7280)}',
    '.pt-prog-in i{font-style:normal;margin-left:auto;font-weight:700;color:var(--primary-dark,#2AB5AF)}',
    '.pt-prog-wrap{height:6px;border-radius:99px;background:var(--bg,#F5F7FA);margin-top:6px;overflow:hidden}',
    '.pt-prog-bar{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--primary,#36CFC9),var(--primary-dark,#2AB5AF))}',
    /* ===== 2026-09-15 P0：按钮 / 页内区块（②③） ===== */
    '.pt-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border,#E8ECF0);background:var(--card,#fff);color:var(--text,#1F2937);border-radius:10px;padding:5px 10px;font-size:12px;cursor:pointer;line-height:1.4}',
    '.pt-btn .nav-icon{width:14px;height:14px;flex:none}',
    '.pt-btn.ghost{background:var(--bg,#F5F7FA);color:var(--text-secondary,#6B7280)}',
    '.pt-btn.mini{padding:2px 8px;border-radius:8px;font-size:11.5px}',
    '.pt-btn.act{border-color:var(--primary,#36CFC9);background:var(--primary-light,#E6FBFA);color:var(--primary-dark,#2AB5AF)}',
    '.pt-btn.on{background:#E8F5E9;border-color:#2E7D32;color:#2E7D32}',
    '.pt-foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}',
    '.pt-box2{margin-top:10px;border:1px solid var(--border,#E8ECF0);border-radius:12px;background:var(--bg,#F5F7FA);padding:10px 12px}',
    '.pt-box-h{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:8px}',
    '.pt-box-h .nav-icon{color:var(--primary,#36CFC9);flex:none}',
    '.pt-box-x{margin-left:auto;border:none;background:transparent;color:var(--text-secondary,#9CA3AF);font-size:12px;cursor:pointer;padding:2px 6px;border-radius:8px;line-height:1.4}',
    /* ===== 2026-09-15 P0：正文卡片化（④） ===== */
    '.pt-mini{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:11px;margin-bottom:8px;overflow:hidden}',
    '.pt-mini-h{display:flex;align-items:center;gap:6px;padding:8px 11px;font-size:12.5px;font-weight:700;cursor:pointer}',
    '.pt-mini-h .nav-icon{color:var(--primary,#36CFC9);flex:none}',
    '.pt-mini-h .pt-fold{margin-left:auto;font-weight:400}',
    '.pt-mini-b{padding:0 12px 10px}',
    '.pt-mini-b ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.pt-mini-b b.hl,.pt-hmain b.hl{color:var(--text,#1F2937)}',
    /* ===== 2026-09-15 P0：正反例对比图（①） ===== */
    '.pt-cmp-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;font-weight:700}',
    '.pt-cmp-nav{margin-left:auto;display:flex;align-items:center;gap:6px;font-weight:400;font-size:12px;color:var(--text-secondary,#6B7280)}',
    '.pt-cmp-nav i{font-style:normal}',
    '.pt-navb{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:8px;border:1px solid var(--border,#E8ECF0);background:var(--card,#fff);cursor:pointer}',
    '.pt-cmp-row{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}',
    '.pt-cmp-side{flex:1 1 220px;min-width:0;background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:11px;padding:8px}',
    '.pt-cmp-side.bad{border-color:#F0C8C8}',
    '.pt-cmp-side.good{border-color:#BFE3C8}',
    '.pt-cmp-h{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;margin-bottom:6px}',
    '.pt-cmp-side.bad .pt-cmp-h,.pt-cmp-side.bad .pt-cmp-h .nav-icon{color:#C0392B}',
    '.pt-cmp-side.good .pt-cmp-h,.pt-cmp-side.good .pt-cmp-h .nav-icon{color:#2E7D32}',
    '.pt-svg{width:100%;height:auto;display:block;background:#fff;border-radius:8px}',
    /* ===== L8-⑦：图片回填位（有截图出 <img>，缺失露出手绘 SVG 兜底） ===== */
    '.pt-fig{position:relative}',
    '.pt-fig-wrap{position:relative}',
    '.pt-fig-img{position:relative;z-index:1;width:100%;height:auto;display:block;background:#fff;border-radius:8px}',
    '.pt-fig-fb{position:absolute;left:0;top:0;right:0;z-index:0}',
    '.pt-cmp-cap{font-size:12px;line-height:1.7;color:var(--text-secondary,#6B7280);margin-top:6px}',
    '.pt-cmp-mid{flex:none;align-self:center;display:flex;align-items:center;color:var(--primary,#36CFC9)}',
    '.pt-cmp-note{display:flex;gap:6px;align-items:flex-start;font-size:12px;line-height:1.7;color:var(--text-secondary,#6B7280);background:var(--card,#fff);border:1px dashed var(--border,#E8ECF0);border-radius:10px;padding:7px 10px;margin-top:8px}',
    '.pt-cmp-note .nav-icon{color:var(--primary,#36CFC9);flex:none;margin-top:2px}',
    /* ===== 2026-09-15 P0：页内小测（③ 本地兜底） ===== */
    '.pt-lq-q{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:11px;padding:10px 12px;margin-bottom:8px}',
    '.pt-lq-t{font-size:13px;line-height:1.7;margin-bottom:8px;color:var(--text,#1F2937)}',
    '.pt-lq-o{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.6;padding:7px 9px;border:1px solid var(--border,#E8ECF0);border-radius:10px;margin-bottom:6px;cursor:pointer;background:var(--card,#fff)}',
    '.pt-lq-k{flex:none;width:18px;height:18px;border-radius:6px;background:var(--bg,#F5F7FA);color:var(--text-secondary,#6B7280);font-size:11px;display:inline-flex;align-items:center;justify-content:center}',
    '.pt-lq-o.ok{border-color:#2E7D32;background:#E8F5E9}',
    '.pt-lq-o.no{border-color:#C0392B;background:#FDECEA}',
    '.pt-lq-x{display:none;gap:6px;align-items:flex-start;font-size:12px;line-height:1.75;color:var(--text-secondary,#6B7280);background:var(--bg,#F5F7FA);border-radius:9px;padding:7px 9px;margin-top:2px}',
    '.pt-lq-q.done .pt-lq-x{display:flex}',
    '.pt-lq-x .nav-icon{color:var(--primary,#36CFC9);flex:none;margin-top:2px}',
    '.pt-lq-bar{display:flex;align-items:center;gap:8px;margin-top:8px}',
    '.pt-lq-score{font-size:13px;font-weight:700;color:var(--text,#1F2937)}'
  ].join('\n');

  function PT_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') st.styleSheet.cssText = CSS;
    else st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 统计 ==================== */

  function PT_stats(data) {
    var items = data.items || [];
    var tasks = data.tasks || [];
    var learned = 0, marked = 0, quizDone = 0, quizPass = 0, quizTotal = 0, taskDone = 0, i;
    for (i = 0; i < items.length; i++) {
      var b = PT_qBest(items[i].id);
      quizTotal += (items[i].practice || []).length;
      if (PT_learned(items[i].id)) marked++;
      if (b && b.best > 0) {
        quizDone += b.total;
        quizPass += b.best;
        if (b.best >= Math.ceil(b.total * 0.6)) learned++;
      }
    }
    for (i = 0; i < tasks.length; i++) if (PT_taskDone(tasks[i].id)) taskDone++;
    return {
      learned: learned, marked: marked, tips: items.length,
      quizDone: quizDone, quizPass: quizPass, quizTotal: quizTotal,
      taskDone: taskDone, tasks: tasks.length
    };
  }

  /* ==================== 各 tab 内容 ==================== */

  /* P0-4：一个 group = 一张可折叠要点小卡 */
  function PT_groupHtml(it, g, idx, open) {
    var h = '';
    h += '<div class="pt-mini">';
    h += '<div class="pt-mini-h" data-act="grp" data-id="' + PT_esc(it.id) + '" data-g="' + idx + '">' +
      PT_icon(open ? 'chevron-down' : 'chevron-right', 14) + PT_esc(g.h || '') +
      '<span class="pt-fold">' + (open ? '收起' : '展开') + '</span></div>';
    if (open) {
      h += '<div class="pt-mini-b"><ul>';
      var lines = g.lines || [];
      for (var k = 0; k < lines.length; k++) h += '<li>' + PT_hl(lines[k]) + '</li>';
      h += '</ul></div>';
    }
    h += '</div>';
    return h;
  }

  /* P0-3：页内区块（小测 / 正反例），非全屏 modal */
  function PT_panelHtml(it) {
    var mode = PT_inline[it.id];
    if (!mode) return '';
    var h = '<div class="pt-box2">';
    if (mode === 'quiz') {
      h += '<div class="pt-box-h">' + PT_icon('check-circle', 15) + PT_esc(it.name || '') + ' · 课后小测' +
        '<button class="pt-box-x" type="button" data-act="panel-close" data-id="' + PT_esc(it.id) + '">收起</button></div>';
      h += '<div class="pt-quiz-host" data-quiz-inline="' + PT_esc(it.id) + '"></div>';
    } else {
      h += '<div class="pt-box-h">' + PT_icon('arrow-left-right', 15) + PT_esc(it.name || '') + ' · 正反例对比' +
        '<button class="pt-box-x" type="button" data-act="panel-close" data-id="' + PT_esc(it.id) + '">收起</button></div>';
      h += PT_caseHtml(it);
    }
    h += '</div>';
    return h;
  }

  function PT_scanHtml(data) {
    var items = data.items || [];
    var h = '', i, j;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var openId = PT_get(LS_PREFIX + 'open', '');
      var open = (openId === it.id);
      var ln = PT_learned(it.id);
      h += '<div class="pt-card" data-id="' + PT_esc(it.id) + '">';
      h += '<div class="pt-head" data-act="fold" data-id="' + PT_esc(it.id) + '">';
      h += '<span class="pt-ic">' + PT_icon(it.icon || 'zap', 17) + '</span>';
      h += '<div class="pt-hmain"><b>' + PT_esc(it.name || '') +
        (ln ? ' <span class="pt-tag g">已学完</span>' : '') + '</b>';
      h += '<div class="pt-sum">' + PT_esc(it.body || '') + '</div></div>';
      h += '<div class="pt-right">';
      var scene = it.scene || [];
      for (j = 0; j < scene.length; j++) h += '<span class="pt-tag">' + PT_esc(scene[j]) + '</span>';
      /* P0-3：「小测 N 题」「正反例 M 组」由死标签改为可点击入口 */
      var qn = (it.practice || []).length;
      var cn = PT_casePool(it, PT_HIDE_DUP).length;
      if (qn) {
        h += '<span class="pt-btn mini' + (PT_inline[it.id] === 'quiz' ? ' act' : '') +
          '" data-act="quiz" data-id="' + PT_esc(it.id) + '">' + PT_icon('check-circle', 13) + '小测 ' + qn + ' 题</span>';
      }
      if (cn) {
        h += '<span class="pt-btn mini' + (PT_inline[it.id] === 'cases' ? ' act' : '') +
          '" data-act="cases" data-id="' + PT_esc(it.id) + '">' + PT_icon('arrow-left-right', 13) + '正反例 ' + cn + ' 组</span>';
      }
      h += '<span class="pt-fold">' + PT_icon(open ? 'chevron-up' : 'chevron-down', 15) + '深入</span>';
      h += '</div></div>';

      if (open && it.detail) {
        h += '<div class="pt-body">';
        h += '<div class="pt-sum" style="margin-bottom:10px">' + PT_esc(it.detail.sum || '') + '</div>';
        var gs = it.detail.groups || [];
        var gi = PT_grpOpen(it.id, gs.length);
        for (j = 0; j < gs.length; j++) h += PT_groupHtml(it, gs[j], j, gi === j);
        h += '</div>';
      }

      h += PT_panelHtml(it);

      /* P0-2：标记已学按钮 */
      h += '<div class="pt-foot">';
      h += '<span class="pt-btn' + (ln ? ' on' : '') + '" data-act="learned" data-id="' + PT_esc(it.id) + '">' +
        PT_icon(ln ? 'badge-check' : 'check', 14) + (ln ? '已学完本节' : '我已学完本节') + '</span>';
      h += '<span class="pt-tag' + (ln ? ' g' : '') + '">' +
        (ln ? '已计入顶部「已学」统计' : '读完点左边打勾，上面进度条右侧会累计') + '</span>';
      h += '</div>';
      h += '</div>';
    }
    return h;
  }

  function PT_quizHtml(data) {
    var items = data.items || [];
    var h = '', i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var b = PT_qBest(it.id);
      h += '<div class="pt-card" data-id="' + PT_esc(it.id) + '">';
      h += '<div class="pt-head" style="cursor:default">';
      h += '<span class="pt-ic">' + PT_icon(it.icon || 'zap', 17) + '</span>';
      h += '<div class="pt-hmain"><b>' + PT_esc(it.name || '') + ' · 练习</b>';
      h += '<div class="pt-sum">' + PT_esc((it.detail && it.detail.sum) ? it.detail.sum : '') + '</div></div>';
      h += '<div class="pt-right">';
      h += '<span class="pt-tag">' + (it.practice || []).length + ' 题</span>';
      if (b) h += '<span class="pt-tag' + (b.best >= Math.ceil(b.total * 0.6) ? ' g' : '') + '">最佳 ' + b.best + '/' + b.total + '</span>';
      h += '</div></div>';
      h += '<div class="pt-quiz-host" data-quiz="' + PT_esc(it.id) + '"></div>';
      h += '</div>';
    }
    if (!items.length) h = '<div class="pt-empty">暂无练习题</div>';
    return h;
  }

  function PT_taskHtml(data) {
    var tasks = data.tasks || [];
    var h = '', i;
    for (i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var on = PT_taskDone(t.id);
      h += '<div class="pt-task' + (on ? ' on' : '') + '" data-act="task" data-id="' + PT_esc(t.id) + '">' +
        '<span class="pt-box">' + PT_icon(on ? 'check' : '', 13) + '</span>' +
        '<div style="flex:1;min-width:0"><b>' + (i + 1) + '. ' + PT_esc(t.t) + '</b>' +
        '<span class="d">' + PT_esc(t.d) + '</span></div></div>';
    }
    return h || '<div class="pt-empty">暂无任务</div>';
  }

  /* 全站正反例画廊组数：优先实时池长（casesArt + cases，走 PT_casePool 同一口径），
     数据未就绪/无 items 时回退 meta.cases + meta.casesArt 之和。
     —— 与 PT_caseHtml 翻页计数、「正反例 M 组」入口一致，避免 16/27 口径打架。 */
  function PT_poolCount(data) {
    var n = 0, items, i;
    if (data) {
      items = data.items;
      if (items && items.length) {
        for (i = 0; i < items.length; i++) n += PT_casePool(items[i], PT_HIDE_DUP).length;
        return n;
      }
      var m = data.meta || {};
      return (m.cases || 0) + (m.casesArt || 0);
    }
    return 0;
  }

  /* ==================== 主渲染 ==================== */

  function PT_setHeader(data) {
    var title = document.getElementById('pptPanelTitle');
    var tag = document.getElementById('pptPanelTag');
    var desc = document.getElementById('pptPanelDesc');
    var icon = document.getElementById('pptPanelIcon');
    if (title) title.textContent = 'PPT · 技巧提升';
    if (tag) {
      var m = data.meta || {};
      var poolN = PT_poolCount(data);
      tag.textContent = '5 专题 · ' + (m.quiz || 0) + ' 道练习 · ' + poolN + ' 组正反例 · ' + (m.tasks || 0) + ' 项实战任务';
    }
    if (desc) desc.textContent = data.intro || '';
    if (icon && typeof window.lucideIcon === 'function') {
      try { icon.innerHTML = window.lucideIcon('zap', 18); } catch (e) { /* 忽略 */ }
    } else if (icon) {
      icon.innerHTML = PT_icon('zap', 18);
      PT_hydrate(icon);
    }
  }

  function PT_render(slotEl) {
    if (!slotEl) return;
    PT_injectStyle();

    var data = PT_data();
    if (!data) {
      slotEl.innerHTML = '<div class="pt-root"><div class="pt-hero">' +
        '<p>技巧提升数据未加载（请确认 assets/data-ppt-tips.js 已在 assets/mini-ppt.js 之后引入）</p></div></div>';
      PT_hydrate(slotEl);
      return;
    }
    var X = window.XTC;
    PT_cur = data;
    PT_setHeader(data);

    var savedTab = PT_get(TAB_KEY, '');
    if (savedTab === TAB_SCAN || savedTab === TAB_QUIZ || savedTab === TAB_TASK) curTab = savedTab;

    var html = '';
    html += '<div class="pt-root">';
    /* P0-2：顶部细进度条（随滚动更新） */
    html += '<div class="pt-prog" id="ptProg">' +
      '<div class="pt-prog-in"><span id="ptProgTxt">本节已读 0%</span>' +
      '<i id="ptProgLearned">已学 0/' + (data.items || []).length + ' 节</i></div>' +
      '<div class="pt-prog-wrap"><div class="pt-prog-bar" id="ptProgBar"></div></div>' +
      '</div>';
    html += '<div class="pt-hero" id="ptHero"></div>';
    html += '<div id="ptTabs"></div>';
    html += '<div id="ptPane"></div>';
    if (data.guide) {
      html += '<div class="pt-guide">' +
        '<h4>' + PT_icon(data.guide.icon || 'lightbulb', 16) + PT_esc(data.guide.title || '') + '</h4>' +
        '<p>' + PT_esc(data.guide.body || '') + '</p><ol>';
      var steps = data.guide.steps || [];
      for (var s = 0; s < steps.length; s++) html += '<li>' + PT_esc(steps[s]) + '</li>';
      html += '</ol></div>';
    }
    html += '<div class="pt-credit">' + PT_esc(data.credit || '') + '</div>';
    html += '</div>';
    slotEl.innerHTML = html;

    /* hero */
    var heroEl = document.getElementById('ptHero');
    if (heroEl) {
      if (X && typeof X.hero === 'function') {
        try {
          X.hero(heroEl, {
            icon: 'zap',
            title: data.t || '技巧提升',
            sub: data.intro || '',
            tags: [(data.items || []).length + ' 个专题 · 学练闭环'],
            credit: false
          });
        } catch (e) { heroEl.innerHTML = '<h3>' + PT_esc(data.t || '') + '</h3>'; }
      } else {
        heroEl.innerHTML = '<h3>' + PT_icon('zap', 18) + PT_esc(data.t || '') + '</h3>' +
          '<p>' + PT_esc(data.intro || '') + '</p>';
      }
      heroEl.innerHTML += '<div class="pt-stats" id="ptStats"></div>';
    }

    /* tabs */
    var st0 = PT_stats(data);
    var tabsEl = document.getElementById('ptTabs');
    if (tabsEl) {
      var tabs = [
        { id: TAB_SCAN, label: '技巧速览', count: (data.items || []).length },
        { id: TAB_QUIZ, label: '技巧练习', count: data.meta ? data.meta.quiz : st0.quizTotal },
        { id: TAB_TASK, label: '实战任务', count: (data.tasks || []).length }
      ];
      if (X && typeof X.tabs === 'function') {
        try {
          X.tabs(tabsEl, tabs, curTab, function (id) { PT_switch(id, data); });
          tabsEl.className = 'pt-tabs';
        } catch (e) {
          tabsEl.innerHTML = PT_tabsHtml(tabs);
          PT_bindTabs(tabsEl, data);
        }
      } else {
        tabsEl.innerHTML = PT_tabsHtml(tabs);
        PT_bindTabs(tabsEl, data);
      }
    }

    PT_renderPane(data);
    PT_renderStats(data);
    PT_bindPane(data);
    PT_bindProgress();
    PT_hydrate(slotEl);
  }

  function PT_tabsHtml(tabs) {
    var h = '', i;
    for (i = 0; i < tabs.length; i++) {
      h += '<div class="xt-tab' + (tabs[i].id === curTab ? ' active' : '') + '" data-pt-tab="' +
        PT_esc(tabs[i].id) + '">' + PT_esc(tabs[i].label) + '<i>' + PT_esc(tabs[i].count) + '</i></div>';
    }
    return h;
  }

  function PT_bindTabs(tabsEl, data) {
    var nodes = tabsEl.querySelectorAll('[data-pt-tab]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        node.addEventListener('click', function () { PT_switch(node.getAttribute('data-pt-tab'), data); });
      })(nodes[i]);
    }
  }

  function PT_switch(tab, data) {
    curTab = tab;
    PT_set(LS_PREFIX + 'tab', tab);
    var tabsEl = document.getElementById('ptTabs');
    if (tabsEl) {
      var nodes = tabsEl.querySelectorAll('[data-pt-tab], .xt-tab');
      for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].getAttribute('data-pt-tab') || nodes[i].getAttribute('data-xt-tab');
        if (nodes[i].className.indexOf('active') === -1 && id === tab) nodes[i].className += ' active';
        else if (id !== tab) nodes[i].className = nodes[i].className.replace(/\bactive\b/g, '').replace(/\s+/g, ' ');
      }
    }
    PT_renderPane(data);
    PT_bindPane(data);
    PT_hydrate(document.getElementById('ptPane'));
  }

  function PT_renderPane(data) {
    var pane = document.getElementById('ptPane');
    if (!pane) return;
    if (curTab === TAB_QUIZ) pane.innerHTML = PT_quizHtml(data);
    else if (curTab === TAB_TASK) pane.innerHTML = PT_taskHtml(data);
    else pane.innerHTML = PT_scanHtml(data);

    if (curTab === TAB_QUIZ) PT_renderQuizzes(data);
    if (curTab === TAB_SCAN) PT_renderInlinePanels(data);
    PT_renderStats(data);
    PT_updateProgress();
    /* P0-1（补·L8-⑦）：把加载失败的 <img> 摘掉，露出手绘 SVG 兜底 */
    PT_bindFigures(pane);
  }

  /* ==================== P0-3：页内小测（XTC 优先，本地兜底） ==================== */

  function PT_renderInlinePanels(data) {
    var items = data.items || [];
    for (var i = 0; i < items.length; i++) {
      if (PT_inline[items[i].id] !== 'quiz') continue;
      PT_renderInlineQuiz(items[i]);
    }
  }

  function PT_renderInlineQuiz(it) {
    var host = document.querySelector('.pt-quiz-host[data-quiz-inline="' + it.id + '"]');
    if (!host) return;
    var quiz = it.practice || [];
    if (!quiz.length) { host.innerHTML = '<div class="pt-empty">本节暂无小测</div>'; return; }
    var X = window.XTC, ok = false;
    if (X && typeof X.renderQuiz === 'function') {
      try {
        X.renderQuiz(host, quiz, {
          title: it.name + ' · 课后小测',
          credit: false,
          onDone: PT_makeOnDone(it.id, PT_cur)
        });
        ok = true;
      } catch (e) { ok = false; }
    }
    if (!ok) PT_localQuiz(host, quiz, it);
    PT_hydrate(host);
  }

  /* 本地兜底：点选项即判分 + 展开解析，全部答完给分 + 重做 */
  function PT_localQuiz(host, quiz, it) {
    var h = '', i, j;
    var keys = 'ABCD';
    h += '<div class="pt-lq" data-tid="' + PT_esc(it.id) + '">';
    for (i = 0; i < quiz.length; i++) {
      h += '<div class="pt-lq-q" data-qi="' + i + '">';
      h += '<div class="pt-lq-t"><b>' + (i + 1) + '.</b> ' + PT_esc(quiz[i].q || '') + '</div>';
      var os = quiz[i].o || [];
      for (j = 0; j < os.length; j++) {
        h += '<div class="pt-lq-o" data-oi="' + j + '"><span class="pt-lq-k">' + keys.charAt(j) +
          '</span><span>' + PT_esc(os[j]) + '</span></div>';
      }
      h += '<div class="pt-lq-x">' + PT_icon('lightbulb', 13) + '<span>' + PT_esc(quiz[i].x || '') + '</span></div>';
      h += '</div>';
    }
    h += '<div class="pt-lq-bar"><span class="pt-lq-score">未作答</span>' +
      '<span class="pt-btn" data-act="lq-again" data-id="' + PT_esc(it.id) + '">' +
      PT_icon('rotate-ccw', 13) + '重做一次</span></div>';
    h += '</div>';
    host.innerHTML = h;
    PT_bindLocalQuiz(host, quiz, it);
  }

  function PT_bindLocalQuiz(host, quiz, it) {
    var root = host.firstChild;
    while (root && root.nodeType !== 1) root = root.nextSibling;
    if (!root || typeof root.addEventListener !== 'function') return;

    function finish(correct) {
      var bar = root.querySelector('.pt-lq-score');
      if (bar) {
        bar.textContent = '得分 ' + correct + '/' + quiz.length +
          '（' + Math.round(correct * 100 / quiz.length) + '%）';
      }
      var prev = PT_qBest(it.id);
      if (!prev || typeof prev.best !== 'number' || correct > prev.best) {
        PT_set(PT_key(it.id, 'best'), { best: correct, total: quiz.length, ts: Date.now() });
      }
      if (correct >= Math.ceil(quiz.length * 0.6)) PT_toast('本节小测 ' + correct + '/' + quiz.length + '，可以往下走了');
      else PT_toast('本节小测 ' + correct + '/' + quiz.length + '，建议回正文再看一遍');
      PT_renderStats(PT_cur);
    }

    root.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement, node = null, qEl = null;
      while (t && t !== root) {
        if (t.getAttribute && t.getAttribute('data-oi') !== null) { node = t; break; }
        t = t.parentNode;
      }
      if (!node) return;
      qEl = node.parentNode;
      while (qEl && qEl !== root) {
        if (qEl.getAttribute && qEl.getAttribute('data-qi') !== null) break;
        qEl = qEl.parentNode;
      }
      if (!qEl || qEl === root) return;
      if (qEl.className.indexOf('done') !== -1) return;
      var qi = parseInt(qEl.getAttribute('data-qi'), 10);
      var oi = parseInt(node.getAttribute('data-oi'), 10);
      if (isNaN(qi) || isNaN(oi)) return;
      var q = quiz[qi];
      if (!q) return;
      var opts = qEl.querySelectorAll('.pt-lq-o'), k, ci;
      for (k = 0; k < opts.length; k++) {
        ci = parseInt(opts[k].getAttribute('data-oi'), 10);
        if (ci === q.a) opts[k].className = 'pt-lq-o ok';
        else if (ci === oi) opts[k].className = 'pt-lq-o no';
      }
      qEl.className = 'pt-lq-q done';
      var qs = root.querySelectorAll('.pt-lq-q'), answered = 0, correct = 0, m, z, sub;
      for (m = 0; m < qs.length; m++) {
        if (qs[m].className.indexOf('done') === -1) continue;
        answered++;
        sub = qs[m].querySelectorAll('.pt-lq-o');
        for (z = 0; z < sub.length; z++) {
          if (parseInt(sub[z].getAttribute('data-oi'), 10) === quiz[m].a &&
            sub[z].className.indexOf('ok') !== -1) { correct++; break; }
        }
      }
      if (answered >= quiz.length) finish(correct);
      else {
        var bar2 = root.querySelector('.pt-lq-score');
        if (bar2) bar2.textContent = '已答 ' + answered + '/' + quiz.length;
      }
    });
  }

  function PT_renderQuizzes(data) {
    var X = window.XTC;
    var items = data.items || [];
    var i;
    for (i = 0; i < items.length; i++) {
      var host = document.querySelector('.pt-quiz-host[data-quiz="' + items[i].id + '"]');
      if (!host) continue;
      var quiz = items[i].practice || [];
      if (!quiz.length) { host.innerHTML = '<div class="pt-empty">本题暂无练习</div>'; continue; }
      /* 通过闭包绑定 onDone 的 tid —— XTC.renderQuiz 不支持透传自定义参数 */
      host.setAttribute('data-tip', items[i].id);
      if (X && typeof X.renderQuiz === 'function') {
        try {
          X.renderQuiz(host, quiz, {
            title: items[i].name + ' · 练习',
            credit: false,
            onDone: PT_makeOnDone(items[i].id, data)
          });
          continue;
        } catch (e) { /* 本地兜底 */ }
      }
      host.innerHTML = '<div class="pt-empty">共 ' + quiz.length + ' 道练习（渲染器尚未就绪）</div>';
    }
  }

  function PT_makeOnDone(tid, data) {
    return function (correct, total) {
      var prev = PT_qBest(tid);
      if (!prev || typeof prev.best !== 'number' || correct > prev.best) {
        PT_set(PT_key(tid, 'best'), { best: correct, total: total, ts: Date.now() });
      }
      var pct = total ? Math.round(correct * 100 / total) : 0;
      if (pct >= 60) PT_toast('本组 ' + correct + '/' + total + '，可以进下一组了');
      else PT_toast('本组 ' + correct + '/' + total + '，建议回「技巧速览」再看一遍');
      /* 刷新该组的成绩标记与整体统计 */
      var head = document.querySelector('.pt-card[data-id="' + tid + '"] .pt-right');
      if (head) {
        var b = PT_qBest(tid);
        var old = head.querySelector('[data-best]');
        if (old) old.parentNode.removeChild(old);
        if (b) {
          var sp = document.createElement('span');
          sp.setAttribute('data-best', '1');
          sp.className = 'pt-tag' + (b.best >= Math.ceil(b.total * 0.6) ? ' g' : '');
          sp.textContent = '最佳 ' + b.best + '/' + b.total;
          head.appendChild(sp);
        }
      }
      PT_renderStats(data);
      PT_updateProgress();
    };
  }

  function PT_renderStats(data) {
    var box = document.getElementById('ptStats');
    if (!box || !data) return;
    var st = PT_stats(data);
    var pct = st.tasks ? Math.round(st.taskDone * 100 / st.tasks) : 0;
    box.innerHTML =
      '<span class="pt-pill">技巧速览 ' + st.tips + ' 个专题</span>' +
      '<span class="pt-pill' + (st.marked === st.tips ? ' g' : '') + '">已学 ' + st.marked + '/' + st.tips + ' 节</span>' +
      '<span class="pt-pill' + (st.learned === st.tips ? ' g' : '') + '">练习达标 ' + st.learned + '/' + st.tips + ' 组</span>' +
      '<span class="pt-pill">累计答对 ' + st.quizPass + '/' + st.quizDone + ' 题' + (st.quizTotal ? '（总 ' + st.quizTotal + '）' : '') + '</span>' +
      '<span class="pt-pill' + (st.taskDone === st.tasks ? ' g' : '') + '">实战任务 ' + st.taskDone + '/' + st.tasks + ' 项（' + pct + '%）</span>';
    var lx = document.getElementById('ptProgLearned');
    if (lx) lx.textContent = '已学 ' + st.marked + '/' + st.tips + ' 节';
  }

  /* ==================== P0-2：阅读进度条（随滚动更新） ==================== */

  function PT_scrollBox() {
    var b = document.getElementById('pptPanelBody');
    if (b && typeof b.scrollTop === 'number') return b;
    return null;
  }

  function PT_targetEl() {
    var openId = PT_get(LS_PREFIX + 'open', '');
    if (openId) {
      var cards = document.querySelectorAll('.pt-card[data-id]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-id') === openId) return cards[i];
      }
    }
    return document.querySelector('.pt-root');
  }

  function PT_updateProgress() {
    var bar = document.getElementById('ptProgBar');
    if (!bar) return;
    var el = PT_targetEl();
    var pct = 0;
    if (el && typeof el.getBoundingClientRect === 'function') {
      var er = el.getBoundingClientRect();
      var box = PT_scrollBox();
      var passed;
      if (box) {
        var br = box.getBoundingClientRect();
        passed = (br.top + Math.min(br.height, 240) * 0.5) - er.top;
      } else {
        passed = (window.innerHeight * 0.5) - er.top;
      }
      if (er.height > 0) pct = passed / er.height;
      if (pct < 0) pct = 0;
      if (pct > 1) pct = 1;
    }
    bar.style.width = Math.round(pct * 100) + '%';
    var tx = document.getElementById('ptProgTxt');
    if (tx) tx.textContent = '本节已读 ' + Math.round(pct * 100) + '%';
  }

  function PT_bindProgress() {
    var box = PT_scrollBox();
    if (box) {
      if (!box.getAttribute('data-ptprog')) {
        box.setAttribute('data-ptprog', '1');
        if (typeof box.addEventListener === 'function') box.addEventListener('scroll', PT_updateProgress, false);
        else box.onscroll = PT_updateProgress;
      }
    } else if (typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', PT_updateProgress, false);
    }
    PT_updateProgress();
  }

  /* 展开页内区块后把它带进视野（老 WebView 不支持时静默忽略） */
  function PT_scrollToBox(id) {
    try {
      var el = document.querySelector('.pt-card[data-id="' + id + '"] .pt-box2');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
    } catch (e) { /* 忽略 */ }
  }

  /* ==================== 事件 ==================== */

  function PT_bindPane(data) {
    var pane = document.getElementById('ptPane');
    if (!pane || pane.getAttribute('data-bound')) return;
    pane.setAttribute('data-bound', '1');

    pane.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var node = null;
      while (t && t !== pane) {
        if (t.getAttribute && t.getAttribute('data-act')) { node = t; break; }
        t = t.parentNode;
      }
      if (!node) return;
      var act = node.getAttribute('data-act');
      var id = node.getAttribute('data-id');

      if (act === 'fold') {
        var now = PT_get(LS_PREFIX + 'open', '');
        PT_set(LS_PREFIX + 'open', now === id ? '' : id);
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      /* P0-2：标记已学 */
      if (act === 'learned') {
        var nx = !PT_learned(id);
        PT_set(PT_key(id, 'learned'), nx ? 1 : 0);
        PT_toast(nx ? '已把「' + PT_name(data, id) + '」标记为已学' : '已取消「' + PT_name(data, id) + '」的已学标记');
        PT_renderPane(data);
        PT_renderStats(data);
        PT_hydrate(pane);
        return;
      }
      /* P0-3：小测 / 正反例 入口 */
      if (act === 'quiz' || act === 'cases') {
        PT_inline[id] = (PT_inline[id] === act) ? '' : act;
        if (PT_inline[id] && PT_get(LS_PREFIX + 'open', '') !== id) PT_set(LS_PREFIX + 'open', id);
        PT_renderPane(data);
        PT_hydrate(pane);
        PT_scrollToBox(id);
        return;
      }
      if (act === 'panel-close') {
        PT_inline[id] = '';
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      if (act === 'case-prev' || act === 'case-next') {
        var cs = PT_casePool(PT_item(data, id), PT_HIDE_DUP);
        if (!cs.length) return;
        var cur = PT_caseIdx[id] || 0;
        cur = (act === 'case-next') ? cur + 1 : cur - 1;
        if (cur < 0) cur = cs.length - 1;
        if (cur >= cs.length) cur = 0;
        PT_caseIdx[id] = cur;
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      /* P0-4：要点小卡展开/收起 */
      if (act === 'grp') {
        var gi = parseInt(node.getAttribute('data-g'), 10);
        if (isNaN(gi)) return;
        var nowG = PT_grpOpen(id, 9999);
        PT_set(PT_grpKey(id), (nowG === gi) ? -1 : gi);
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      /* 本地兜底小测：重做一次 */
      if (act === 'lq-again') {
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      if (act === 'task') {
        var next = !PT_taskDone(id);
        PT_set(PT_key(id, 'task'), next ? 1 : 0);
        PT_renderPane(data);
        PT_renderStats(data);
        PT_hydrate(pane);
        var all = (data.tasks || []).length;
        if (next && PT_stats(data).taskDone === all) PT_toast('6 项实战任务全部打勾，这套流程你算是走完了');
        return;
      }
    });
  }

  /* ==================== 注册（幂等） ==================== */

  function PT_register() {
    window.PPTV2 = window.PPTV2 || {};
    window.PPTV2[VIEW_ID] = PT_render;
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView('PPTV2', VIEW_ID, PT_render);
    }
  }

  /* 临时塞图试看：把 { key: url } 合进 PT_CASE_IMG 并重渲染（不改数据文件） */
  function PT_setImgMap(map) {
    if (!map || typeof map !== 'object') return 0;
    var n = 0, k;
    for (k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        PT_CASE_IMG[k] = map[k];
        n++;
      }
    }
    return n;
  }

  PT_register();

  window.PptTips = {
    version: '2.0.0',
    render: PT_render,
    stats: function () { return PT_stats(PT_data() || { items: [], tasks: [] }); },
    keys: { prefix: LS_PREFIX, view: VIEW_ID },
    /* 2026-09-15 P0 新增对外接口（只读 / 便于 QA 与后续 P1 复用） */
    learned: PT_learned,
    caseSvg: PT_caseSvg,
    highlight: PT_hl,
    /* 2026-09-16 L8 新增对外接口（正反例画廊 / 图片回填） */
    casePool: function (id) { return PT_casePool(PT_item(PT_data(), id), PT_HIDE_DUP); },
    art: PT_art,
    imgInfo: PT_imgInfo,
    setImgMap: function (map) {
      var n = PT_setImgMap(map);
      if (PT_cur) PT_renderPane(PT_cur);
      return n;
    },
    /* 一键恢复 / 关闭同题材重复项过滤（数据一行未删） */
    setHideDup: function (flag) {
      PT_HIDE_DUP = (flag !== false);
      if (PT_cur) PT_renderPane(PT_cur);
      return PT_HIDE_DUP;
    }
  };
})();
