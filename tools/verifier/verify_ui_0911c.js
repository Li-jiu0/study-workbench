// jsdom 真实渲染验证：设置页学习时长上限控件 + 个人中心资料 + 公开主页
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';

function load(page, extraJs) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' + page, pretendToBeVisual: true });
  const w = dom.window;
  w.API_BASE = '';
  // 页面内联脚本
  const inlines = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const code of inlines) {
    try { w.eval(code); } catch (e) { console.log('  [内联脚本异常]', e.message); }
  }
  // app.js
  try { w.eval(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8')); }
  catch (e) { console.log('  [app.js 异常]', e.message); }
  if (extraJs) { try { w.eval(extraJs); } catch (e) { console.log('  [额外脚本异常]', e.message); } }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  return w;
}

const ok = (b) => b ? '✔' : '✘';
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ' + ok(true) + ' ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ' + ok(false) + ' ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}

console.log('========== 【1】设置页：每日学习时长上限 ==========');
{
  const w = load('设置.html');
  const d = w.document, $ = id => d.getElementById(id);
  check('stLimitOn 控件存在', !!$('stLimitOn'));
  check('stLimitOn 默认勾选', $('stLimitOn') && $('stLimitOn').checked === true);
  check('stLimitHours 控件存在', !!$('stLimitHours'));
  check('stLimitHours 选项数=8', $('stLimitHours') && $('stLimitHours').options.length === 8,
        $('stLimitHours') ? $('stLimitHours').options.length + ' 项' : '');
  check('stLimitHours 默认值=4', $('stLimitHours') && $('stLimitHours').value === '4',
        $('stLimitHours') ? 'value=' + $('stLimitHours').value : '');
  check('进度条 stLimitBar 存在', !!$('stLimitBar'));
  check('进度条已同步宽度', $('stLimitBar') && $('stLimitBar').style.width !== '', $('stLimitBar') ? $('stLimitBar').style.width : '');
  check('说明文字已生成', $('stLimitTip') && $('stLimitTip').textContent.length > 0,
        $('stLimitTip') ? '「' + $('stLimitTip').textContent + '」' : '');
  check('今日描述已生成', $('stLimitTodayDesc') && $('stLimitTodayDesc').textContent !== '正在统计…',
        $('stLimitTodayDesc') ? '「' + $('stLimitTodayDesc').textContent + '」' : '');
  check('getTodayStudySeconds 可用', typeof w.getTodayStudySeconds === 'function');
  check('getTodayStudyText 可用', typeof w.getTodayStudyText === 'function',
        typeof w.getTodayStudyText === 'function' ? w.getTodayStudyText() : '');
  check('resetTodayStudyTime 可用', typeof w.resetTodayStudyTime === 'function');
  // 交互：切到 2 小时（jsdom 的 inline onchange 无法解析手动 eval 的函数，
  // 故直接调用 handler 里实际执行的 setSetting + syncStudyLimitUI，与浏览器行为等价）
  $('stLimitHours').value = '2';
  w.eval("setSetting('studyLimitHours',2);syncStudyLimitUI();");
  check('改上限为 2 小时后写入设置', w.loadAllSettings().studyLimitHours === 2,
        'stored=' + w.loadAllSettings().studyLimitHours);
  // 交互：关闭开关
  $('stLimitOn').checked = false;
  w.eval("setSetting('studyLimitOn',false);syncStudyLimitUI();");
  check('关闭开关后写入设置', w.loadAllSettings().studyLimitOn === false);
  check('关闭后提示文案切换', $('stLimitTip') && /关闭/.test($('stLimitTip').textContent),
        $('stLimitTip') ? '「' + $('stLimitTip').textContent + '」' : '');
  // 复原
  w.eval("setSetting('studyLimitOn',true);setSetting('studyLimitHours',4);");
  check('开关可恢复为开启', w.loadAllSettings().studyLimitOn === true && w.loadAllSettings().studyLimitHours === 4);
}

console.log('');
console.log('========== 【2】设置页：每日学习时长累计逻辑 ==========');
{
  const w = load('设置.html');
  const before = w.getTodayStudySeconds();
  w.eval("(function(){ var o=loadStudyTime(); var k=_stToday(); o[k]=(o[k]||0)+3600; _stSave(o); })()");
  const after = w.getTodayStudySeconds();
  check('可累计今日时长', after - before === 3600, before + 's → ' + after + 's');
  check('getTodayStudyText 显示 1 小时', /1 小时/.test(w.getTodayStudyText()), w.getTodayStudyText());
  w.eval("setSetting('studyLimitHours',1)");
  check('达到 1 小时上限 → isStudyLimitReached 为真', w.isStudyLimitReached() === true);
  w.resetTodayStudyTime();
  check('重置后今日时长为 0', w.getTodayStudySeconds() === 0, w.getTodayStudySeconds() + 's');
}

console.log('');
console.log('========== 【3】个人中心：编辑资料弹窗 v3 ==========');
{
  const w = load('个人中心.html');
  const d = w.document, $ = id => d.getElementById(id);
  check('完成度进度条容器', !!$('pePct') && !!$('pePctBar'));
  check('迷你预览容器', !!$('peMiniAvatar') && !!$('peMiniName') && !!$('peMiniMotto') && !!$('peMiniTags'));
  check('字数统计元素', !!$('peCntName') && !!$('peCntMotto') && !!$('peCntBio') && !!$('peCntGoal'));
  check('备考标签 chips 容器', !!$('peChips'));
  check('学习目标输入框', !!$('peGoal'));
  check('手机号输入框（私密）', !!$('pePhone'));
  check('手机号隐私提示标签', !!$('pePhoneMask'));
  check('出生年月带 min/max 约束', $('peBirthday') && $('peBirthday').getAttribute('min') === '1950-01-01',
        $('peBirthday') ? 'min=' + $('peBirthday').getAttribute('min') + ' max=' + $('peBirthday').getAttribute('max') : '');
  check('peSyncUI 可用', typeof w.peSyncUI === 'function');
  check('peToggleTag 可用', typeof w.peToggleTag === 'function');
  check('peAddTag 可用', typeof w.peAddTag === 'function');
  // 触发一次同步：填昵称+签名，检查计数与完成度
  $('peName').value = '张三';
  $('peMotto').value = '每天背诵单词';
  $('peGoal').value = '上岸央国企';
  $('pePhone').value = '13800138000';
  w.peSyncUI();
  check('昵称计数更新为 2/20', $('peCntName').textContent === '2/20', $('peCntName').textContent);
  check('签名计数更新', $('peCntMotto').textContent === '6/60', $('peCntMotto').textContent);
  check('手机号自动脱敏提示', $('pePhoneMask') && /138\*\*\*\*8000/.test($('pePhoneMask').textContent),
        $('pePhoneMask') ? $('pePhoneMask').textContent : '');
  check('完成度已计算(>0%)', $('pePct').textContent !== '0%' && $('pePct').textContent !== '', $('pePct').textContent);
  check('迷你预览昵称同步', $('peMiniName').textContent === '张三', $('peMiniName').textContent);
  check('迷你预览签名同步', $('peMiniMotto').textContent === '每天背诵单词', $('peMiniMotto').textContent);
  // 标签交互
  w.peToggleTag('四级');
  check('切换标签后 hidden 值更新', $('peTags') && $('peTags').value === '四级', $('peTags') ? 'peTags=' + $('peTags').value : '');
  check('标签 chip 高亮', $('peChips') && /on/.test($('peChips').innerHTML));
  // 手机号非法输入自动裁掉
  $('pePhone').value = '138abc00138xyz000';
  w.peSyncUI();
  check('手机号非数字被过滤', $('pePhone').value === '13800138000', 'value=' + $('pePhone').value);
}

console.log('');
console.log('========== 【4】设置页：新增设置项存续性 ==========');
{
  const w = load('设置.html');
  const st = w.loadAllSettings();
  check('默认上限开=on', st.studyLimitOn === true, String(st.studyLimitOn));
  check('默认上限=4 小时', st.studyLimitHours === 4, String(st.studyLimitHours));
  check('超限提醒默认开', st.studyLimitWarn === true, String(st.studyLimitWarn));
  check('showStudyLimitModal 可用', typeof w.showStudyLimitModal === 'function');
  w.showStudyLimitModal('测试文案');
  check('超限弹窗可创建', !!w.document.getElementById('studyLimitModal'));
  check('弹窗含"再学一会儿"按钮', !!w.document.getElementById('slmGo'));
  check('弹窗含"去休息"按钮', !!w.document.getElementById('slmRest'));
}

console.log('');
console.log('==================================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项  ' + (fail === 0 ? '✅ 全部通过' : '❌ 存在失败'));
process.exit(fail === 0 ? 0 : 1);
