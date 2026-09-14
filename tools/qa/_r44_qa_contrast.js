/* =====================================================================
   tools/qa/_r44_qa_contrast.js —— 对照实验（第二层 QA）
   目的：判断 R39–R43 回归契约「是否具备区分度」。
   做法：在**系统临时目录**搭一份镜像（私聊.html + HEAD 版 assets/chat-local.js），
   用 tools/qa/_r3943_chat_regression.js 的**原样断言**（只替换 ROOT，不改任何断言）
   分别跑：
     A) 工作区当前版（含 R44 改动）
     B) git HEAD 版（R44 之前）
   只读业务代码；临时目录在进程结束前清理。
   结果落盘 tools/qa/_r44_qa_contrast_out.txt
   ===================================================================== */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = 'D:/下载的文件/学习工作台';
var NODE_MODULES = path.join(ROOT, 'tools', 'verifier', 'node_modules');
var SRC = path.join(ROOT, 'tools', 'qa', '_r3943_chat_regression.js');

function headChatLocal() {
  return cp.execSync('git show HEAD:assets/chat-local.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function buildMirror(tag, chatSrc) {
  var dir = path.join(os.tmpdir(), 'r44qa_contrast_' + tag);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(dir, '私聊.html'), fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8'), 'utf8');
  fs.writeFileSync(path.join(dir, 'assets', 'chat-local.js'), chatSrc, 'utf8');
  return dir;
}

function runVariant(tag, chatSrc) {
  var dir = buildMirror(tag, chatSrc);
  var js = fs.readFileSync(SRC, 'utf8');
  var before = js;
  js = js.replace("const ROOT = 'D:/下载的文件/学习工作台';", 'const ROOT = ' + JSON.stringify(dir).replace(/"/g, "'") + ';');
  if (js === before) throw new Error('ROOT 替换失败');
  var variant = path.join(ROOT, 'tools', 'qa', '_r44_qa_contrast_' + tag + '.js');
  fs.writeFileSync(variant, js, 'utf8');
  var r = cp.spawnSync(process.execPath, [variant], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000,
    env: Object.assign({}, process.env, { NODE_PATH: NODE_MODULES })
  });
  var out = (r.stdout || '') + (r.stderr || '');
  var summary = out.split('\n').filter(function (l) {
    return /^(PASS|FAIL|INFO|RESULT|捕获)/.test(l.trim()) || /PASS=/.test(l);
  }).join('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  return { tag: tag, exit: r.status, summary: summary };
}

var lines = [];
lines.push('===== R39–R43 契约对照实验（工作区 R44 版 vs git HEAD 版） =====');
lines.push('时间: ' + new Date().toISOString());
lines.push('HEAD: ' + cp.execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim());
lines.push('');

[{
  tag: 'worktree',
  label: 'A) 工作区当前版（含 R44 改动）',
  src: fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8')
}, {
  tag: 'head',
  label: 'B) git HEAD 版（R44 之前，102ab2c）',
  src: headChatLocal()
}].forEach(function (c) {
  var r = runVariant(c.tag, c.src);
  lines.push('---------- ' + c.label + ' ----------');
  lines.push('exit=' + r.exit);
  lines.push(r.summary || '(无输出)');
  lines.push('');
});

lines.push('判读：若 A 与 B 都是 PASS=10 FAIL=0，则该契约对 R44 修复点（Bug C）**不具备区分度**，');
lines.push('      只能作为「R39–R43 既有行为未被 R44 破坏」的守护，不能作为 R44 修复有效的证据。');

var out = lines.join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'tools', 'qa', '_r44_qa_contrast_out.txt'), out, 'utf8');
console.log(out);
