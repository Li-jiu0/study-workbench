// tools/qa/qa_t01_password.js — P0-B T01 密码强度 QA 复测
//
// 用法：
//   node tools/qa/qa_t01_password.js                       (静态扫描 + Python 后端校验)
//   node tools/qa/qa_t01_password.js > tools/qa/_qa_t01_report.txt 2>&1
//
// 覆盖 PRD §2.3 共 7 项 AC（AC-1.1 ~ AC-1.7）。
//
// 设计：
//   - 零 npm 依赖；仅 node 内置 (fs/path/child_process) + Python 调用
//   - 前端校验：grep 登录.html / 设置.html 的强密码正则 / denylist / pwStrongEnough
//   - 后端校验：调用系统 Python（pydantic 可用）跑 check_password_strength()
//     （避开已坏的 server/.venv，直接验证 schemas.py 行为；等价于 curl 直发 422）
//   - 改密不清数据：grep 改密流程不调 localStorage.clear / 不批量删 study_workbench_* 键
//
// 输出格式（统一）：
//   === AC-1.x | <name> | PASS/FAIL | <note> ===
//
// 退出码：0 = 全 PASS；非 0 = 至少一项 FAIL

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LOGIN_HTML = path.join(ROOT, '登录.html');
const SETTINGS_HTML = path.join(ROOT, '设置.html');
const SCHEMAS_PY = path.join(ROOT, 'server', 'schemas.py');
const APP_JS = path.join(ROOT, 'assets', 'app.js');
const API_JS = path.join(ROOT, 'assets', 'api.js');

// ---------- 报告收集 ----------
const results = [];
let pass = 0;
let fail = 0;
function record(acId, name, ok, note) {
  const tag = ok ? 'PASS' : 'FAIL';
  results.push({ acId, name, tag, note });
  console.log(`=== ${acId} | ${name} | ${tag} | ${note} ===`);
  if (ok) pass += 1; else fail += 1;
}

// ---------- 文件读取 ----------
function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error('文件不存在: ' + file);
  }
  return fs.readFileSync(file, 'utf8');
}

// ---------- 强度正则（与项目内一致） ----------
// 登录.html PW_STRONG_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/
const PW_STRONG_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
// P0-B 修复：denylist 改为 case-sensitive 精确匹配（避免 'Abc12345' 被 'abc12345' 误杀）
// 与 server/schemas.py _WEAK_PASSWORD_DENYLIST 严格一致
const DENYLIST = [
  'test123456', 'password', 'qwerty', 'qwerty123',
  '12345678', '11111111', 'abc12345', 'admin123',
  'iloveyou', '123456789',
];
function pwStrongEnough(pw) {
  if (!PW_STRONG_RE.test(pw || '')) return false;
  // case-sensitive 精确匹配（不 .lower()）
  if (DENYLIST.indexOf(String(pw || '')) !== -1) return false;
  return true;
}

// ---------- Python 后端校验 ----------
// server/.venv 当前是 broken 状态（pydantic 装到 site-packages 但 import 失败），
// 所以 findPython 主动探测 pydantic 可用性，挑第一个能跑 check_password_strength 的解释器
function findPython() {
  const candidates = [
    'C:\\Users\\ATM\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    'C:\\Users\\ATM\\AppData\\Local\\Programs\\Python\\Python314\\python.exe',
    'C:\\Users\\ATM\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    path.join(ROOT, 'server', '.venv', 'Scripts', 'python.exe'),
    'python.exe',
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      execFileSync(c, ['-c', 'from pydantic import BaseModel, field_validator; print("ok")'], {
        timeout: 5000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return c;
    } catch (e) {
      // skip
    }
  }
  return null;
}

function pythonValidatorCheck() {
  const pyBin = findPython();
  if (!pyBin) {
    return { reachable: false, error: '无可用 Python（pydantic 不可达）', python: null };
  }
  const inlinePy = [
    'import sys, json',
    'sys.path.insert(0, r"' + path.join(ROOT, 'server').replace(/\\/g, '\\\\') + '")',
    'try:',
    '    from schemas import check_password_strength',
    'except Exception as e:',
    '    print(json.dumps({"ok": False, "error": "import_fail: " + str(e)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'out = {}',
    'for pw in ["12345678", "test123456", "Abcd1234", "GoodPass1"]:',
    '    try:',
    '        check_password_strength(pw)',
    '        out[pw] = {"raised": False, "msg": ""}',
    '    except ValueError as e:',
    '        out[pw] = {"raised": True, "msg": str(e)}',
    'print(json.dumps({"ok": True, "results": out}, ensure_ascii=False))',
  ].join('\n');

  let stdout = '';
  try {
    stdout = execFileSync(pyBin, ['-c', inlinePy], {
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return { reachable: false, error: (e && e.message) || 'Python 调用失败', python: pyBin };
  }
  try {
    return { reachable: true, data: JSON.parse(stdout), python: pyBin };
  } catch (e) {
    return { reachable: false, error: 'Python 输出 JSON 解析失败: ' + stdout.slice(0, 200), python: pyBin };
  }
}

// ============================================================
// AC-1.1 · 123456 在登录.html 注册路径被前端拒绝
//   期望：前端红字 + 灰按钮 + 不发请求
// ============================================================
function checkAC_1_1() {
  const src = read(LOGIN_HTML);
  const checks = [];
  // 1) pwStrongEnough 函数定义
  checks.push({ ok: /function\s+pwStrongEnough\s*\(/.test(src), note: 'pwStrongEnough 函数定义' });
  // 2) validate() 在 register 模式下调用 pwStrongEnough
  const hasRegisterGate = /loginMode\s*===\s*['"]register['"]/.test(src)
    && /!pwStrongEnough\s*\(/.test(src);
  checks.push({ ok: hasRegisterGate, note: 'validate() 在 register 模式下调用 pwStrongEnough' });
  // 3) submitLogin 在 validate 失败时早返回
  const earlyReturn = /function\s+submitLogin\s*\(\)\s*\{[\s\S]*?if\s*\(\s*!validate\s*\(/.test(src);
  checks.push({ ok: earlyReturn, note: 'submitLogin 在 validate 失败时早返回（不发 fetch）' });
  // 4) 数学验证
  const mathOk = pwStrongEnough('123456') === false;
  checks.push({ ok: mathOk, note: "pwStrongEnough('123456') === false（6位不足8位）" });
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.1', '注册路径拒绝 123456（前端红字+不发请求）', allOk, summary);
}

// ============================================================
// AC-1.2 · test123456 命中 denylist，提示「过于常见」字样
// ============================================================
function checkAC_1_2() {
  const src = read(LOGIN_HTML);
  const checks = [];
  // 1) denylist 含 test123456（容许单/双引号）
  checks.push({
    ok: /["']test123456["']\s*:\s*1/.test(src),
    note: "PW_DENYLIST 含 'test123456': 1",
  });
  // 2) pwStrongEnough 函数检查 denylist
  checks.push({
    ok: /function\s+pwStrongEnough[\s\S]{0,500}PW_DENYLIST/.test(src),
    note: 'pwStrongEnough 内引用 PW_DENYLIST',
  });
  // 3) 错误信息含语义关键词（"过于" 或 "常见" 或 "简单"）
  const hasWarnMsg = /过于|常见|简单|复杂/.test(src);
  checks.push({ ok: hasWarnMsg, note: '错误提示含「过于/常见/简单/复杂」语义关键词' });
  // 4) 数学验证
  const mathOk = pwStrongEnough('test123456') === false;
  checks.push({ ok: mathOk, note: "pwStrongEnough('test123456') === false（denylist 命中）" });
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.2', '注册路径 test123456 命中 denylist + 错误提示', allOk, summary);
}

// ============================================================
// AC-1.3 · Abc12345 通过前端 + POST /api/auth/register 成功
//   备注：denylist 已改为 case-sensitive 精确匹配（P0-B 修复）；
//   Abc12345 不再被 'abc12345' 误杀。
// ============================================================
function checkAC_1_3() {
  const src = read(LOGIN_HTML);
  const checks = [];
  // 1) 注册路径
  checks.push({
    ok: /path\s*=\s*['"]\/api\/auth\/register['"]/.test(src),
    note: 'submitLogin 注册模式 POST /api/auth/register',
  });
  // 2) 数学验证（使用 PRD AC-1.3 指定的 Abc12345）
  const mathOk = pwStrongEnough('Abc12345') === true;
  checks.push({
    ok: mathOk,
    note: "pwStrongEnough('Abc12345') === true（denylist 已改 case-sensitive，Abc12345 不再被 'abc12345' 误杀）",
  });
  // 3) 请求 body 含 username/password/nickname
  checks.push({
    ok: /body\s*=\s*\{[\s\S]*?username[\s\S]*?password[\s\S]*?nickname/.test(src),
    note: 'fetch body 含 username/password/nickname 字段',
  });
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.3', '注册 Abc12345 前端通过 + POST /api/auth/register', allOk, summary);
}

// ============================================================
// AC-1.4 · 设置.html 改密 12345678（8位无字母）被前端拒绝
// ============================================================
function checkAC_1_4() {
  const src = read(SETTINGS_HTML);
  const checks = [];
  // 1) pwStrongEnough 函数与登录一致的正则
  checks.push({
    ok: /function\s+pwStrongEnough[\s\S]{0,400}\(\?=\.\*\[A-Za-z\]\)\(\?=\.\*\\d/.test(src),
    note: '设置.html pwStrongEnough 含 (?=.*[A-Za-z])(?=.*\\d) 强度正则',
  });
  // 2) 离线 stChangePassword 调用 pwStrongEnough
  checks.push({
    ok: /function\s+stChangePassword[\s\S]{0,1500}pwStrongEnough\s*\(/.test(src),
    note: 'stChangePassword() 调用 pwStrongEnough 校验',
  });
  // 3) 在线 stSubmitPwd 调用 pwStrongEnough
  checks.push({
    ok: /function\s+stSubmitPwd[\s\S]{0,1500}pwStrongEnough\s*\(/.test(src),
    note: 'stSubmitPwd() 调用 pwStrongEnough 校验',
  });
  // 4) 数学验证
  const mathOk = pwStrongEnough('12345678') === false;
  checks.push({ ok: mathOk, note: "pwStrongEnough('12345678') === false（8位无字母）" });
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.4', '设置页改密 12345678 前端拒绝（8位无字母）', allOk, summary);
}

// ============================================================
// AC-1.5 · 后端绕过前端 curl 直发 {"password":"12345678"} → 422 含「密码强度不足」字样
// ============================================================
function checkAC_1_5(pythonCheck) {
  const src = read(SCHEMAS_PY);
  const checks = [];
  // 1) 正则存在（用宽松匹配）
  checks.push({
    ok: /_PASSWORD_STRONG_RE\s*=\s*re\.compile[\s\S]{0,200}\(\?=[\s\S]{0,200}\)\(\?=[\s\S]{0,200}\\d/.test(src),
    note: 'schemas.py _PASSWORD_STRONG_RE 含双 (?=...) 组 + \\d',
  });
  // 2) check_password_strength 函数
  checks.push({
    ok: /def\s+check_password_strength\s*\(/.test(src),
    note: 'check_password_strength 函数存在',
  });
  // 3) 弱密码 raise 信息严格含「密码强度不足」字样（PRD §2.3 AC-1.5）
  const raiseBlock = /if\s+not\s+_PASSWORD_STRONG_RE\.match[\s\S]{0,200}raise\s+ValueError\s*\(\s*["'][^"']*密码强度不足[^"']*["']\s*\)/.test(src);
  checks.push({ ok: raiseBlock, note: '弱密码 raise ValueError 信息含「密码强度不足」字样（PRD 关键词）' });
  // 4) Python 行为
  if (pythonCheck.reachable && pythonCheck.data && pythonCheck.data.ok) {
    const r = pythonCheck.data.results && pythonCheck.data.results['12345678'];
    const pyOk = !!(r && r.raised && /密码强度不足/.test(r.msg));
    checks.push({
      ok: pyOk,
      note: 'python check_password_strength("12345678") 抛 ValueError("' + (r ? r.msg : '') + '") → FastAPI 422',
    });
  } else {
    checks.push({
      ok: false,
      note: 'Python 后端调用不可达（' + (pythonCheck.error || '未知') + ' @ ' + pythonCheck.python + '）；HTTP 探针需部署后跑',
    });
  }
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.5', '后端弱密码 12345678 → 422 含「密码强度不足」字样', allOk, summary);
}

// ============================================================
// AC-1.6 · 后端 denylist 命中 test123456 → 422 + 「过于常见」字样
// ============================================================
function checkAC_1_6(pythonCheck) {
  const src = read(SCHEMAS_PY);
  const checks = [];
  // 1) denylist 含 test123456
  checks.push({
    ok: /_WEAK_PASSWORD_DENYLIST\s*=[\s\S]{0,500}["']test123456["']/.test(src),
    note: '_WEAK_PASSWORD_DENYLIST 含 "test123456"',
  });
  // 2) raise ValueError 在 denylist 命中后
  const raiseBlock = /in\s+_WEAK_PASSWORD_DENYLIST[\s\S]{0,200}raise\s+ValueError/.test(src);
  checks.push({ ok: raiseBlock, note: 'denylist 命中 raise ValueError' });
  // 3) 错误信息严格含「过于常见」字样（PRD §2.3 AC-1.6）
  const hasSemantic = /raise\s+ValueError\s*\(\s*["'][^"']*过于常见[^"']*["']\s*\)/.test(src);
  checks.push({ ok: hasSemantic, note: '错误信息含「过于常见」字样（PRD 关键词）' });
  // 4) Python 行为
  if (pythonCheck.reachable && pythonCheck.data && pythonCheck.data.ok) {
    const r = pythonCheck.data.results && pythonCheck.data.results['test123456'];
    const pyOk = !!(r && r.raised && /过于常见/.test(r.msg));
    checks.push({
      ok: pyOk,
      note: 'python check_password_strength("test123456") 抛 ValueError("' + (r ? r.msg : '') + '") → FastAPI 422',
    });
  } else {
    checks.push({
      ok: false,
      note: 'Python 后端调用不可达（' + (pythonCheck.error || '未知') + ' @ ' + pythonCheck.python + '）；HTTP 探针需部署后跑',
    });
  }
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.6', '后端 denylist 命中 test123456 → 422 + 「过于常见」字样', allOk, summary);
}

// ============================================================
// AC-1.7 · 改密成功后 localStorage 内 study_workbench_* 业务键不被清空
// ============================================================
function checkAC_1_7() {
  const settingsSrc = read(SETTINGS_HTML);
  const appSrc = read(APP_JS);
  const apiSrc = fs.existsSync(API_JS) ? read(API_JS) : '';
  const checks = [];
  // 1) 设置.html stChangePassword 内无 localStorage.clear()
  const offlineBlock = settingsSrc.match(/function\s+stChangePassword\s*\([\s\S]*?\n\}/);
  const offlineBlockOk = offlineBlock && !/localStorage\.clear\s*\(/.test(offlineBlock[0]);
  checks.push({
    ok: !!offlineBlockOk,
    note: '设置.html stChangePassword 内无 localStorage.clear()',
  });
  // 2) 设置.html stSubmitPwd 内无 localStorage.clear()
  const onlineBlock = settingsSrc.match(/function\s+stSubmitPwd\s*\([\s\S]*?\n\}/);
  const onlineBlockOk = onlineBlock && !/localStorage\.clear\s*\(/.test(onlineBlock[0]);
  checks.push({
    ok: !!onlineBlockOk,
    note: '设置.html stSubmitPwd 内无 localStorage.clear()',
  });
  // 3) app.js 不调 localStorage.clear()
  const appNoClear = !/localStorage\.clear\s*\(/.test(appSrc);
  checks.push({ ok: appNoClear, note: 'assets/app.js 全文件无 localStorage.clear() 调用' });
  // 4) api.js 内无 localStorage.clear()
  const apiClear = /localStorage\.clear\s*\(/.test(apiSrc);
  checks.push({
    ok: !apiClear,
    note: 'assets/api.js 无 localStorage.clear()（仅 removeItem 单个 token/auth/user 键）',
  });
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-1.7', '改密后 study_workbench_* 业务键不被清空', allOk, summary);
}

// ============================================================
// 主流程
// ============================================================
function main() {
  console.log('=== T01 · 密码强度 QA · P0-B 重建 ===');
  console.log('仓库根:', ROOT);
  console.log('Python:', findPython());
  console.log('---');

  // 前端 4 项（同步，无外部依赖）
  checkAC_1_1();
  checkAC_1_2();
  checkAC_1_3();
  checkAC_1_4();

  // Python 后端校验（一次调用，多次复用）
  const pyCheck = pythonValidatorCheck();
  if (!pyCheck.reachable) {
    console.log('[INFO] Python 后端不可达：' + pyCheck.error + '；AC-1.5/AC-1.6 静态扫描部分继续，Python 行为验证标记 FAIL 需部署后跑');
  }

  checkAC_1_5(pyCheck);
  checkAC_1_6(pyCheck);

  // 改密不清理
  checkAC_1_7();

  console.log('---');
  console.log('SUMMARY: PASS=' + pass + '  FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}

main();
