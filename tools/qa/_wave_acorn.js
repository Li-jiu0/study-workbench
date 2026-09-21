// 内部辅助：对“指定的一组文件”逐文件做 ES2017(acorn) 解析级体检。
// 由 wave_check_20260916m.py 调用：
//   node _wave_acorn.js <input_json> <output_json>
// input_json: [{ "rel": "更多.html", "abs": "D:/.../更多.html", "kind": "html" }, ...]
// output_json: { "<rel>": {"ok": true} | {"ok": false, "need": "2018", "msg": "..."} | {"ok": false, "inlineFails":[...], "inlineCount": N} }
const fs = require('fs');
const acorn = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\acorn');

function parse1(code) {
  try {
    acorn.parse(code, { ecmaVersion: 2017, sourceType: 'script', allowReturnOutsideFunction: true });
    return { ok: true };
  } catch (e) {
    let need = '>2020';
    for (const lv of [2018, 2019, 2020, 2021, 2022]) {
      try {
        acorn.parse(code, { ecmaVersion: lv, sourceType: 'script', allowReturnOutsideFunction: true });
        need = String(lv); break;
      } catch (_) {}
    }
    return { ok: false, need: need, msg: e.message };
  }
}

const inp = process.argv[2];
const outp = process.argv[3];
const files = JSON.parse(fs.readFileSync(inp, 'utf8'));
const result = {};

for (const f of files) {
  const rel = f.rel, abs = f.abs, kind = f.kind;
  let code;
  try { code = fs.readFileSync(abs, 'utf8'); }
  catch (e) { result[rel] = { ok: false, need: 'N/A', msg: 'READ_FAIL: ' + e.message }; continue; }

  if (kind === 'js') {
    result[rel] = parse1(code);
  } else if (kind === 'html') {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, i = 0, bad = [];
    while ((m = re.exec(code))) {
      const body = m[1];
      if (body.trim().length < 20) continue;
      i++;
      const r = parse1(body);
      if (!r.ok) bad.push({ idx: i, need: r.need, msg: r.msg });
    }
    result[rel] = { ok: bad.length === 0, inlineCount: i, inlineFails: bad };
  } else {
    result[rel] = { ok: true, skipped: true };
  }
}

fs.writeFileSync(outp, JSON.stringify(result), 'utf8');
