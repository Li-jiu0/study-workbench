/* T05 jsdom mock for assets/xt-update.js three-state logic (F3/F4).
 * ASCII-only source (avoid encoding corruption). Chinese output comes from the
 * loaded xt-update.js itself. Results are written to _t05_jsdom_out.txt (utf8).
 */
'use strict';
const fs = require('fs');
const { JSDOM } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const SRC = fs.readFileSync(ROOT + '/assets/xt-update.js', 'utf8');
const OUT = ROOT + '/tools/_t05_jsdom_out.txt';

function makeWin(withFetch) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>',
    { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.eval(SRC);
  if (withFetch) { w.fetch = withFetch; }
  return w;
}

function callCheckManual(w) {
  return new Promise(function (resolve) {
    let done = false;
    const timer = setTimeout(function () {
      if (!done) { done = true; resolve({ state: '__timeout__' }); }
    }, 3000);
    w.XTUpdate.checkManual(function (st) {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      resolve(st);
    });
  });
}

function okJson(obj) {
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } });
}

async function main() {
  const L = [];
  const cur = makeWin(false).XTUpdate.CURRENT_VERSION;

  // ---- pure evaluate() states ----
  const w0 = makeWin(false);
  const XU = w0.XTUpdate;

  const eNew = XU.evaluate({ status: 'ok', version: '9.99', apkUrl: 'http://h/x.apk', apkReady: true });
  const eNewNoApk = XU.evaluate({ status: 'ok', version: '9.99', apkUrl: '', apkReady: false });
  const eLatest = XU.evaluate({ status: 'ok', version: cur, apkUrl: 'http://h/x.apk', apkReady: true });
  const eBad = XU.evaluate(null);
  const eNoVer = XU.evaluate({ status: 'ok' });
  const eStarting = XU.evaluate({ status: 'starting' });

  L.push('evaluate() state/ code / reason:');
  L.push('  new(有APK)      state=' + eNew.state + ' code=' + eNew.code);
  L.push('  new(apkUrl空)   state=' + eNewNoApk.state + ' reason=' + eNewNoApk.reason + ' reasonText=' + eNewNoApk.reasonText);
  L.push('  latest          state=' + eLatest.state);
  L.push('  null            state=' + eBad.state + ' code=' + eBad.code + ' msg=' + eBad.message);
  L.push('  no version      state=' + eNoVer.state + ' code=' + eNoVer.code + ' msg=' + eNoVer.message);
  L.push('  starting        state=' + eStarting.state);
  L.push('');

  // ---- fetch-driven states (fresh window each; avoids 3s tap guard) ----
  const newWin = makeWin(function () {
    return okJson({ status: 'ok', version: '9.99', apkUrl: 'http://h/x.apk', apkReady: true,
      notes: ['n1'], changelog: [] });
  });
  const sNew = await callCheckManual(newWin);
  L.push('fetch new    -> state=' + sNew.state + ' version=' + (sNew.data && sNew.data.version));

  const httpWin = makeWin(function () {
    return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); } });
  });
  const sHttp = await callCheckManual(httpWin);
  L.push('fetch 500    -> state=' + sHttp.state + ' code=' + sHttp.code + ' msg=' + sHttp.message);

  const netWin = makeWin(function () { return Promise.reject(new Error('boom')); });
  const sNet = await callCheckManual(netWin);
  L.push('fetch reject -> state=' + sNet.state + ' code=' + sNet.code + ' msg=' + sNet.message);

  const badWin = makeWin(function () {
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.reject(new Error('not json')); } });
  });
  const sBad = await callCheckManual(badWin);
  L.push('fetch badjs  -> state=' + sBad.state + ' code=' + sBad.code + ' msg=' + sBad.message);

  // ---- assertions ----
  const checks = [
    ['new state', eNew.state === 'new'],
    ['new reason no_apk', eNewNoApk.reason === 'no_apk'],
    ['latest state', eLatest.state === 'latest'],
    ['null -> bad_body', eBad.state === 'error' && eBad.code === 'bad_body'],
    ['no version -> no_version', eNoVer.state === 'error' && eNoVer.code === 'no_version'],
    ['starting', eStarting.state === 'starting'],
    ['fetch new distinguishes', sNew.state === 'new'],
    ['http500 code', sHttp.state === 'error' && sHttp.code === 'http_500'],
    ['network code', sNet.state === 'error' && sNet.code === 'network'],
    ['badjson code', sBad.state === 'error' && sBad.code === 'bad_body'],
  ];
  L.push('');
  L.push('--- assertions ---');
  let allPass = true;
  checks.forEach(function (c) {
    L.push('  [' + (c[1] ? 'PASS' : 'FAIL') + '] ' + c[0]);
    if (!c[1]) { allPass = false; }
  });
  L.push('');
  L.push('RESULT: ' + (allPass ? 'ALL PASS' : 'SOME FAILED'));

  fs.writeFileSync(OUT, L.join('\n'), 'utf8');
  process.stdout.write(L.join('\n') + '\n');
}

main().catch(function (e) {
  fs.writeFileSync(OUT, 'ERROR: ' + (e && e.stack ? e.stack : e), 'utf8');
  process.stdout.write('ERROR: ' + e + '\n');
  process.exit(1);
});
