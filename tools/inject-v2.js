/**
 * inject-v2.js —— 多页面版增量注入脚本（可重复执行，幂等）
 * 作用：
 *  1. 从 学习博客.html 生成 个人中心.html（复用外壳，页面区换成 #page-profile）
 *  2. 给所有模块页（18个）侧边栏“中心”分组末尾注入【个人中心】菜单项
 *  3. 给所有模块页顶栏注入全局搜索框（.gs-wrap，见 app.js 的 globalSearch）
 * 用法：node tools/inject-v2.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const BLOG = path.join(ROOT, '学习博客.html');
const PROFILE = path.join(ROOT, '个人中心.html');

// ---------- 第 1 步：生成 个人中心.html ----------
const blogHtml = fs.readFileSync(BLOG, 'utf8');
const lines = blogHtml.split('\n');
const pageStart = lines.findIndex(l => l.includes('id="page-blog"'));
const pageEnd = lines.findIndex((l, i) => i > pageStart && l.trim() === '</div>' && l.startsWith('      </div>')); // page 层的闭合
let profileHtml;
{
  const head = lines.slice(0, pageStart).join('\n');       // 外壳：doctype→topbar
  const tail = lines.slice(pageEnd + 1).join('\n');        // 闭合 main→</html>
  const pageBlock = `<div class="page active" id="page-profile">
        <div class="module-hero">
          <div class="module-hero-left">
            <div class="module-hero-title">👤 个人中心</div>
            <div class="module-hero-desc">个人资料 · 笔记统计 · 数据导出 · 退出登录</div>
          </div>
        </div>

        <!-- 个人中心内容（由 assets/app.js 的 renderProfilePage() 渲染：
             头像/昵称/签名/编辑资料、笔记统计卡、分类分布、导出全部 Markdown、
             本地单用户模式提示、退出登录按钮） -->
        <div id="profileBox"></div>
      </div>`;
  profileHtml = head + '\n' + pageBlock + '\n' + tail;
  profileHtml = profileHtml
    .replace('<title>学习博客 · 学习工作台</title>', '<title>个人中心 · 学习工作台</title>')
    .replace('<div class="topbar-title" id="topbarTitle">学习博客</div>', '<div class="topbar-title" id="topbarTitle">个人中心</div>')
    .replace('<div class="nav-item active" data-page="blog">', '<div class="nav-item" data-page="blog">'); // 菜单激活态稍后由注入步骤处理
  fs.writeFileSync(PROFILE, profileHtml);
  console.log('✓ 生成 个人中心.html');
}

// ---------- 第 2/3 步：批量注入菜单项 + 搜索框 ----------
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== '登录.html');
const NAV_ITEM = `      <div class="nav-item" data-page="profile">
        <span class="nav-icon">👤</span><span>个人中心</span>
      </div>
`;
const SEARCH_BOX = `      <!-- 全局搜索（检索范围与逻辑见 assets/app.js 的 globalSearch()） -->
      <div class="gs-wrap" id="gsWrap">
        <input type="text" class="gs-input" id="gsInput" placeholder="🔍 搜索笔记 / 模块…" autocomplete="off" oninput="globalSearch(this.value)" onfocus="globalSearch(this.value)">
        <div class="gs-dropdown" id="gsDropdown"></div>
      </div>
`;

for (const f of htmlFiles) {
  const fp = path.join(ROOT, f);
  let s = fs.readFileSync(fp, 'utf8');
  let changed = [];

  // 注入【个人中心】菜单项（幂等）
  if (!s.includes('data-page="profile"')) {
    const anchor = '<div class="nav-section">系统</div>';
    if (!s.includes(anchor)) { console.log('✗ ' + f + '：找不到侧边栏锚点（系统分组）'); process.exit(1); }
    s = s.replace(anchor, NAV_ITEM + anchor);
    changed.push('nav');
  }
  // 注入顶栏全局搜索框（幂等）
  if (!s.includes('id="gsWrap"')) {
    const re = /(<div class="topbar-title" id="topbarTitle">[^<]*<\/div>)/;
    if (!re.test(s)) { console.log('✗ ' + f + '：找不到顶栏标题锚点'); process.exit(1); }
    s = s.replace(re, '$1\n' + SEARCH_BOX.trimEnd());
    changed.push('search');
  }
  // 个人中心.html：把菜单激活态挪到“个人中心”项上
  if (f === '个人中心.html') {
    s = s.replace('<div class="nav-item" data-page="profile">', '<div class="nav-item active" data-page="profile">');
  }
  if (changed.length) {
    fs.writeFileSync(fp, s);
    console.log('✓ ' + f + '：注入 ' + changed.join('+'));
  } else {
    console.log('- ' + f + '：无需修改');
  }
}
console.log('完成。');
