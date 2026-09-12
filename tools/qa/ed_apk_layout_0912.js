#!/usr/bin/env node
/**
 * tools/qa/ed_apk_layout_0912.js —— 批次五 T05 · APK 布局校验（对齐 + 压缩方式）
 * （寇豆码 / engineer，2026-09-12）
 *
 * 为什么要单独做这个校验：
 *   `zipalign -c 4` 只判断「偏移量是否 4 字节对齐」，**不判断压缩方式**。
 *   而 targetSdk >= 30（Android 11+）有一条独立硬约束：
 *       resources.arsc 必须是 STORED（未压缩）且 4 字节对齐，
 *       否则安装期直接报 INSTALL_FAILED_INVALID_APK（-124）。
 *   这条约束任何现有脚本都没覆盖，只能自己从 zip 中央目录逐条读出来判。
 *
 * 用法：node tools/qa/ed_apk_layout_0912.js [xxx.apk]
 * 退出码：0 = 全部通过；1 = 有失败；2 = 崩溃
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_APK = path.join(ROOT, '学习工作台-安卓App.apk');

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const ZIP64_LOC_SIG = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

let pass = 0;
let fail = 0;
const FAILS = [];
const LOG = [];
const _origLog = console.log.bind(console);
console.log = function () {
  LOG.push(Array.prototype.map.call(arguments, (a) => String(a)).join(' '));
  _origLog.apply(console, arguments);
};

function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + label + (detail ? '  -> ' + detail : ''));
  } else {
    fail++;
    FAILS.push(label + (detail ? ' | ' + detail : ''));
    console.log('  FAIL  ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : ''));
  }
}

/** 读取 APK(zip) 的中央目录，返回每个条目的元数据 */
function readCentralDirectory(apkPath) {
  const buf = fs.readFileSync(apkPath);

  let eocd = -1;
  const maxScan = Math.min(buf.length, 66000);
  for (let i = buf.length - 22; i >= buf.length - maxScan && i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 EOCD，文件可能不是有效的 zip/apk');

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff === 0xFFFFFFFF || total === 0xFFFF) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === ZIP64_LOC_SIG) {
      cdOff = Number(buf.readBigUInt64LE(loc + 8));
    }
  }

  const entries = [];
  let p = cdOff;
  for (let n = 0; n < 0xFFFF && p < buf.length; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);

    let name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name.indexOf('\uFFFD') >= 0) name = buf.toString('latin1', p + 46, p + 46 + nameLen);

    // 真实数据偏移：本地头 + 30 + 文件名长 + 扩展区长（zip64 扩展里可能覆盖长度，此处保守取中央目录值）
    let dataOff = -1;
    if (localOff >= 0 && buf.readUInt32LE(localOff) === LOC_SIG) {
      dataOff = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    }

    entries.push({ name, method, compSize, uncompSize, localOff, dataOff });
    p += 46 + nameLen + extraLen + commentLen;
    if (cdSize && p >= cdOff + cdSize) break;
  }
  return { buf, entries };
}

function methodName(m) {
  return m === METHOD_STORED ? 'STORED' : (m === METHOD_DEFLATE ? 'DEFLATE' : ('method=' + m));
}

function main() {
  const argApk = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.apk'));
  const apkPath = argApk ? path.resolve(argApk) : DEFAULT_APK;

  console.log('===== APK 布局校验（对齐 + 压缩方式）=====');
  if (!fs.existsSync(apkPath)) {
    console.log('  FAIL  未找到 APK：' + apkPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(apkPath);
  const md5 = crypto.createHash('md5').update(buf).digest('hex').toUpperCase();
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex').toUpperCase();
  console.log('  INFO  APK: ' + apkPath);
  console.log('  INFO  大小: ' + buf.length + ' 字节（' + Math.round(buf.length / 1024) + ' KB）');
  console.log('  INFO  MD5 : ' + md5);
  console.log('  INFO  SHA1: ' + sha1);
  console.log('');

  const { entries } = readCentralDirectory(apkPath);
  console.log('  INFO  条目总数: ' + entries.length);
  console.log('');

  // ---- [1] resources.arsc：必须 STORED + 4 字节对齐（Android 11+ / -124 硬约束）----
  console.log('--- [1] resources.arsc（targetSdk>=30 硬约束）---');
  const arsc = entries.find((e) => e.name === 'resources.arsc');
  if (!arsc) {
    check('resources.arsc 存在于包内', false, '未找到该条目');
  } else {
    check('resources.arsc 存在于包内', true, '大小=' + arsc.compSize + ' 字节');
    check('resources.arsc 为 STORED（未压缩）', arsc.method === METHOD_STORED,
      '实际=' + methodName(arsc.method));
    const off = arsc.dataOff >= 0 ? arsc.dataOff : arsc.localOff;
    check('resources.arsc 数据偏移 4 字节对齐', off % 4 === 0,
      'dataOff=' + off + '（%4=' + (off % 4) + '）');
  }
  console.log('');

  // ---- [2] classes.dex：d8 输出，必须存在 ----
  // 注意：**不要**对 DEFLATE 条目断言 4 字节对齐。
  // zipalign 的契约只对 STORED（未压缩）条目做对齐——压缩条目会先解压再使用，
  // 原始偏移无需对齐。实测 classes.dex 为 DEFLATE 且 dataOff=9529（%4=1），
  // 这属于正常现象，早期版本误判为 FAIL，已修正。仅当它是 STORED 时才要求对齐。
  console.log('--- [2] classes.dex ---');
  const dex = entries.find((e) => e.name === 'classes.dex');
  if (!dex) {
    check('classes.dex 存在于包内', false, '未找到该条目');
  } else {
    check('classes.dex 存在于包内', true, '大小=' + dex.compSize + ' 字节，' + methodName(dex.method));
    if (dex.method === METHOD_STORED) {
      const off = dex.dataOff >= 0 ? dex.dataOff : dex.localOff;
      check('classes.dex 为 STORED，需 4 字节对齐', off % 4 === 0,
        'dataOff=' + off + '（%4=' + (off % 4) + '）');
    } else {
      check('classes.dex 为 DEFLATE，压缩条目无需对齐（zipalign 语义）', true,
        'dataOff=' + dex.dataOff + '，跳过对齐断言');
    }
  }
  console.log('');

  // ---- [3] AndroidManifest.xml：必须存在（aapt2 link 产物，二进制 XML）----
  console.log('--- [3] AndroidManifest.xml ---');
  const mf = entries.find((e) => e.name === 'AndroidManifest.xml');
  check('AndroidManifest.xml 存在于包内', !!mf,
    mf ? ('大小=' + mf.compSize + ' 字节，' + methodName(mf.method)) : '未找到');
  console.log('');

  // ---- [4] 全量：所有 STORED 条目都必须 4 字节对齐（这是 zipalign -f 4 的契约）----
  console.log('--- [4] 全量 STORED 条目对齐检查 ---');
  const stored = entries.filter((e) => e.method === METHOD_STORED);
  const misaligned = stored.filter((e) => {
    const off = e.dataOff >= 0 ? e.dataOff : e.localOff;
    return off % 4 !== 0;
  });
  console.log('  INFO  STORED 条目 ' + stored.length + ' 个；DEFLATE 条目 ' +
    (entries.length - stored.length) + ' 个');
  check('全部 ' + stored.length + ' 个 STORED 条目均 4 字节对齐',
    misaligned.length === 0,
    misaligned.length ? misaligned.map((e) => e.name + '@' + e.dataOff).join(', ') : '无未对齐项');
  console.log('');

  // ---- [5] 签名产物：v1(v1 签名在 META-INF) / v2(v2 签名块) ----
  console.log('--- [5] 签名产物 ---');
  const metaInf = entries.filter((e) => e.name.indexOf('META-INF/') === 0);
  check('META-INF/ 目录下存在 v1 签名产物', metaInf.length > 0,
    metaInf.map((e) => e.name).join(', ') || '无');
  const hasRsaOrEcdsa = metaInf.some((e) => /\.(RSA|DSA|EC)$/i.test(e.name));
  check('META-INF/ 含 .RSA/.EC 签名块', hasRsaOrEcdsa,
    hasRsaOrEcdsa ? '' : '未找到（v1 签名可能缺失）');
  console.log('');

  // ---- [6] 本批焦点资源再次点名（与 check_apk_assets_0912.js 交叉印证）----
  console.log('--- [6] 批次五焦点资源 ---');
  const focus = [
    'assets/assets/icon-map.js',
    'assets/assets/subpage-router.js',
    'assets/assets/config.js',
    'assets/assets/quest.js',
    'assets/assets/study-stats.js',
    'assets/assets/emoji/manifest.js'
  ];
  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const f of focus) {
    const e = byName.get(f);
    check('包内含 ' + f, !!e, e ? ('大小=' + e.compSize + ' 字节，' + methodName(e.method)) : '未找到');
  }

  console.log('\n===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) {
    console.log('失败清单：');
    FAILS.forEach((f) => console.log('  - ' + f));
  }

  const outFile = path.join(__dirname, '_apk_layout_check.txt');
  fs.writeFileSync(outFile, LOG.join('\n') + '\n', 'utf8');
  console.log('\n（结果已写入 ' + path.relative(ROOT, outFile).replace(/\\/g, '/') + '）');

  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log('CRASH: ' + (e && (e.stack || e.message || e)));
  process.exit(2);
}
