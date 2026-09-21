/*
 * C-P0 导航接入波：全站底部导航 + 左侧主导航新增 AI 入口
 * 用法： dry-run => node _nav_patch.js
 *       写入   => node _nav_patch.js --write
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/下载的文件/学习工作台';
const WRITE = process.argv.indexOf('--write') >= 0;

const FILES = [
  'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html', 'blog_wechat.html',
  '万能金句库.html', '个人中心.html', '企业定向库.html', '动态.html',
  '商务礼仪.html', '商务礼仪面试.html', '四级备考.html', '四级词汇.html',
  '场景话术库.html', '央国企笔试.html', '学习博客.html', '学习工作台.html',
  '工具.html', '时政热点.html', '申论刷题.html', '管理员.html',
  '行测刷题.html', '设置.html', '错题本.html', '面试题库.html', '高情商表达.html'
];

function bnItem(iconHtml) {
  return '<div class="bottom-nav-item" onclick="location.href=\'AI.html\'"><div class="bn-icon">' + iconHtml + '</div><div class="bn-label">AI</div></div>';
}
function navPair(indent) {
  return indent + '<div class="nav-item" onclick="location.href=\'AI.html\'">\n' +
         indent + '  <span class="nav-icon" data-icon="sparkles"></span><span>AI</span>\n' +
         indent + '</div>\n';
}
function navInline() {
  return ' <div class="nav-item" onclick="location.href=\'AI.html\'"> <span class="nav-icon" data-icon="sparkles"></span><span>AI</span> </div> ';
}

const report = [];
for (const name of FILES) {
  const file = path.join(ROOT, name);
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  const log = [name];

  if (src.indexOf("location.href='AI.html'") >= 0) {
    log.push('SKIP-EXISTING');
    report.push(log.join(' | '));
    continue;
  }

  /* ---------- 1. 底部导航：首页之后插入 AI ---------- */
  const bnIdx = src.indexOf('class="bottom-nav"');
  if (bnIdx < 0) {
    log.push('NO-BOTTOMNAV');
  } else {
    const win = 3000;
    const regionEnd = Math.min(src.length, bnIdx + win);
    // 找到「互动」项（即首页之后的下一项）
    const re = /([ \t]*)<div class="bottom-nav-item"[^>]*onclick="gotoChat\(\)"/;
    const m = re.exec(src.slice(bnIdx, regionEnd));
    if (!m) {
      log.push('BN-ANCHOR-NOTFOUND');
    } else {
      const absPos = bnIdx + m.index;
      const indent = m[1];
      const rich = src.slice(bnIdx, regionEnd).indexOf('<span class="nav-icon" data-icon="message-') >= 0;
      const iconHtml = rich
        ? '<span class="nav-icon" data-icon="sparkles" data-icon-size="20"></span>'
        : 'PLACEHOLDER_PLAIN';
      const item = rich
        ? '<div class="bottom-nav-item" onclick="location.href=\'AI.html\'"><div class="bn-icon">' + iconHtml + '</div><div class="bn-label">AI</div></div>'
        : '<div class="bottom-nav-item" onclick="location.href=\'AI.html\'"><div class="bn-icon" data-icon="sparkles"></div><div class="bn-label">AI</div></div>';
      src = src.slice(0, absPos) + indent + item + '\n' + src.slice(absPos);
      log.push('BN+] AI (' + (rich ? 'rich' : 'plain') + ' icon)');
    }
  }

  /* ---------- 2. 左侧主导航：首页之后插入 AI ---------- */
  const nlIdx = src.indexOf('<div class="nav-list"');
  if (nlIdx < 0) {
    log.push('NO-NAVLIST');
  } else {
    const searchEnd = Math.min(src.length, nlIdx + 4000);
    const secRel = src.slice(nlIdx, searchEnd).indexOf('class="nav-section"');
    if (secRel < 0) {
      log.push('NAV-SECTION-NOTFOUND');
    } else {
      let secPos = nlIdx + secRel;
      // 回退到该行行首
      const lineStart = src.lastIndexOf('\n', secPos) + 1;
      const indentMatch = /^[ \t]*/.exec(src.slice(lineStart, secPos));
      const indent = indentMatch ? indentMatch[0] : '      ';
      const multiLine = lineStart !== secPos; // 独占一行 => 多行风格
      const block = multiLine ? navPair(indent) : navInline();
      src = src.slice(0, lineStart) + block + src.slice(lineStart);
      log.push('SIDEBAR+] AI (' + (multiLine ? 'multi' : 'inline') + ')');
    }
  }

  const before = (orig.match(/bottom-nav-item/g) || []).length;
  const after = (src.match(/bottom-nav-item/g) || []).length;
  const navBefore = (orig.match(/class="nav-item"/g) || []).length;
  const navAfter = (src.match(/class="nav-item"/g) || []).length;
  log.push('bn ' + before + '->' + after + ' / nav ' + navBefore + '->' + navAfter);

  if (WRITE && src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
  }
  report.push(log.join(' | '));
}
fs.writeFileSync(path.join(ROOT, 'tools/qa/_nav_patch_report.txt'), report.join('\n'), 'utf8');
console.log(WRITE ? 'WRITTEN' : 'DRYRUN', report.length);
