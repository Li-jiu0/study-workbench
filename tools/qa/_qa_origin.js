/**
 * QA 脚本「数据源」统一解析 —— 2026-09-16 P1 修复
 * ============================================================
 * 【背景（为什么要有这个文件）】
 *   page_check.js / multi_check.js / ball_verify.js 原先都写死
 *   `const ORIGIN = 'http://110.42.134.62'`，而线上往往是上一版（旧代码）。
 *   结果：本地改完没部署时跑这三个脚本，验的是线上旧版 —— "自检通过"完全不可信。
 *   实测证据：线上 /学习博客.html=200、/社区.html=404、线上 app.js 仍含 学习博客.html。
 *
 * 【现在的行为】
 *   1) 默认走【本地】，并且本脚本会自己起一个静态文件服务（无需手工开服务）；
 *   2) 若端口上已经有一个"自己人"的静态服务（能供出本文件且含哨兵串），直接复用，不重复占用；
 *   3) 想验线上时显式指：QA_ORIGIN=http://110.42.134.62 node tools/qa/xxx.js
 *
 * 【手工起服务（可选，脚本一般会自动起）】
 *   python -m http.server 8899 --directory "D:\下载的文件\学习工作台"
 *   （python = C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe）
 *
 * 【环境变量】
 *   QA_ORIGIN  显式指定源，如 http://110.42.134.62 （此时绝不自动起本地服务）
 *   QA_PORT    本地服务起始端口，默认 8899（被占用则 8900、8901 ... 顺延 10 个）
 * ============================================================
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\下载的文件\\学习工作台';
/** 用来判断"某个端口上的服务是不是我们自己起的/本地目录"的哨兵 */
const SENTINEL_PATH = '/tools/qa/_qa_origin.js';
const SENTINEL_MARK = '__QA_ORIGIN_SENTINEL_v1__';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function handler(req, res) {
  let p;
  try {
    p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch (e) {
    res.writeHead(400); res.end('bad url'); return;
  }
  if (p === '/' || p === '') p = '/学习工作台.html';
  const fp = path.join(ROOT, p.replace(/^\/+/, ''));
  // 防目录穿越
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + p);
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  res.end(fs.readFileSync(fp));
}

/** 端口上已有的服务是不是"本地目录服务"：请求本文件，看有没有哨兵串 */
function isOurs(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: SENTINEL_PATH, timeout: 1500 }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(res.statusCode === 200 && b.indexOf(SENTINEL_MARK) >= 0));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function tryListen(port) {
  return new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.once('error', () => resolve(null));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

/**
 * 解析数据源。返回 { origin, server, source, isLocal }
 *  - server 为 null 表示不需要本脚本关闭（远端 / 复用已有服务）
 */
async function resolve() {
  const envOrigin = (process.env.QA_ORIGIN || '').trim();
  if (envOrigin) {
    return {
      origin: envOrigin.replace(/\/+$/, ''),
      server: null,
      source: 'QA_ORIGIN 环境变量（远端/指定源）',
      isLocal: /127\.0\.0\.1|localhost/i.test(envOrigin)
    };
  }
  const startPort = parseInt(process.env.QA_PORT || '8899', 10);
  for (let p = startPort; p < startPort + 10; p++) {
    if (await isOurs(p)) {
      return { origin: 'http://127.0.0.1:' + p, server: null, source: '复用已存在的本地静态服务（端口 ' + p + '）', isLocal: true };
    }
    const srv = await tryListen(p);
    if (srv) {
      return { origin: 'http://127.0.0.1:' + p, server: srv, source: '本脚本自启的本地静态服务（端口 ' + p + '）', isLocal: true };
    }
  }
  throw new Error('无法在本地端口 ' + startPort + '~' + (startPort + 9) + ' 起静态服务，请用 QA_PORT 指定其它端口');
}

function shutdown(server) {
  return new Promise(res => {
    if (!server) return res();
    try { server.close(() => res()); } catch (e) { res(); }
  });
}

/** 取页面 HTML；404/网络错都返回 { ok:false, status, reason }，不抛异常 */
async function fetchPage(origin, page) {
  const url = new URL('/' + page.replace(/^\/+/, ''), origin).href;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } });
    if (!r.ok) return { ok: false, status: r.status, url };
    return { ok: true, status: r.status, url, html: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, url, reason: e.message };
  }
}

/** 给页面注入的公共 beforeParse 处理（各脚本可再叠加自己的） */
function baseBeforeParse(origin) {
  return function (w) {
    w.fetch = (u, o) => fetch(typeof u === 'string' ? new URL(u, origin).href : u, o);
    w.Headers = Headers; w.Request = Request; w.Response = Response;
    w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; w.AbortController = AbortController;
    if (!w.crypto) w.crypto = {};
    if (!w.crypto.randomUUID) w.crypto.randomUUID = () => require('crypto').randomUUID();
  };
}

/** 统一的输出头：让每次跑都能一眼看出"验的是哪套环境" */
function sourceBanner(src) {
  return [
    '############################################################',
    '# 数据源 ORIGIN = ' + src.origin,
    '# 来源         = ' + src.source,
    '# 是否本地     = ' + (src.isLocal ? '是（验的是本地工作区代码）' : '否（验的是远端已部署代码）'),
    '# 时间         = ' + new Date().toISOString(),
    '############################################################',
    ''
  ].join('\n');
}

module.exports = { ROOT, resolve, shutdown, fetchPage, baseBeforeParse, sourceBanner };
