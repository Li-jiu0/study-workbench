# -*- coding: utf-8 -*-
# R87 T01 第二轮：vision 64x64+400回落 / 3D 512x512 / probeCostly->probeNoAuto
import os, re, zlib, struct, base64, sys
ROOT = r"D:\下载的文件\学习工作台"
ASSETS = os.path.join(ROOT, "assets")
BAK = ".bak-pre-r87-20260918b"
REPORT = os.path.join(ROOT, "tools", "_r87_t01_report2.txt")
L = []
def log(s): L.append(s)

def png_solid(w, h, rgb):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = (b"\x00" + bytes(rgb) * w) * h
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
            chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

PNG64 = png_solid(64, 64, (128, 128, 128))
PNG512 = png_solid(512, 512, (128, 128, 128))
B64_64 = base64.b64encode(PNG64).decode("ascii")
B64_512 = base64.b64encode(PNG512).decode("ascii")
log("[png] 64x64 bytes=%d b64len=%d" % (len(PNG64), len(B64_64)))
log("[png] 512x512 bytes=%d b64len=%d" % (len(PNG512), len(B64_512)))

def read_bytes(p):
    with open(p, "rb") as f: return f.read()
def write_bytes(p, b):
    with open(p, "wb") as f: f.write(b)
def detect_nl(t):
    crlf = t.count("\r\n"); lf = t.count("\n")
    if crlf > 0 and lf == crlf: return "\r\n"
    if crlf == 0 and lf > 0: return "\n"
    return None

OLD_TINY = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

V1_A = ('  // 1×1 透明 PNG（极小载荷）。视觉探针走 chat 多模态：验证「模型确实能吃图」，\n'
        '  // 而不是只验文本连通性；单次成本极低（1×1 图 + "hi"，max_tokens=1）。\n'
        '  var TINY_PNG = "data:image/png;base64,%s";' % OLD_TINY)
V1_R = ('  // 64×64 纯色 PNG（体积仍仅百余字节）。刻意不用 1×1：上游存在最小尺寸校验（有先例），\n'
        '  //   过小的图可能被 400 拒掉 → 会误判视觉模型不可用并自动隐藏，故用「足够大」的纯色图。\n'
        '  // 视觉探针走 chat 多模态：验证「模型确实能吃图」，而不是只验文本连通性。\n'
        '  var PROBE_PNG = "data:image/png;base64,%s";' % B64_64)

V2_A = ('    var body = JSON.stringify({\n'
        '      model: ctx.modelCfg.model,\n'
        '      max_tokens: 1,\n'
        '      messages: [{ role: "user", content: [\n'
        '        { type: "image_url", image_url: { url: TINY_PNG } },\n'
        '        { type: "text", text: "hi" }\n'
        '      ] }]\n'
        '    });\n'
        '    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: body,\n'
        '      timeout: ctx.timeout || CAP.probeTimeout })\n'
        '      .then(pClassify);\n'
        '  };')
V2_R = ('    var mmBody = JSON.stringify({\n'
        '      model: ctx.modelCfg.model,\n'
        '      max_tokens: 1,\n'
        '      messages: [{ role: "user", content: [\n'
        '        { type: "image_url", image_url: { url: PROBE_PNG } },\n'
        '        { type: "text", text: "hi" }\n'
        '      ] }]\n'
        '    });\n'
        '    // 多模态被 HTTP 400 拒绝（= 请求形态问题，不代表模型死了）→ 回落一次纯文本探针；\n'
        '    // 两次都失败才判不可用。其余错误（401/403/404/网络/超时）不回落，直接判结果。\n'
        '    function textFallback() {\n'
        '      var tb = JSON.stringify({ model: ctx.modelCfg.model,\n'
        '        messages: [{ role: "user", content: "hi" }], max_tokens: 1 });\n'
        '      return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: tb,\n'
        '        timeout: ctx.timeout || CAP.probeTimeout })\n'
        '        .then(pClassify);\n'
        '    }\n'
        '    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: mmBody,\n'
        '      timeout: ctx.timeout || CAP.probeTimeout })\n'
        '      .then(function (r) {\n'
        '        if (r.status === 400) return textFallback();\n'
        '        return pClassify(r);\n'
        '      });\n'
        '  };')

D1_A = ('  // 3D 探针用的极小输入图（1×1 PNG data URL）。\n'
        '  var TINY_PNG = "data:image/png;base64,%s";' % OLD_TINY)
D1_R = ('  // 3D 探针用的输入图（512×512 纯色 PNG data URL）。刻意放大到 512×512：\n'
        '  //   上游存在最小尺寸校验（有先例），过小的图可能被拒 → 会误判 3D 模型不可用。\n'
        '  var PROBE_PNG = "data:image/png;base64,%s";' % B64_512)

D2_A = '      input: { mode: "i23d", imageDataUrl: TINY_PNG } });'
D2_R = '      input: { mode: "i23d", imageDataUrl: PROBE_PNG } });'

REN_A = '  CAP.probeCostly = true;   // 供 T02/T03 批量逻辑识别：probeCostly===true 的能力不进批量检测'
REN_R = '  CAP.probeNoAuto = true;   // 供 T02/T03 批量逻辑识别：probeNoAuto===true 的能力不进「检测全部」批量'

EDITS = {
    "ai-cap-vision.js": [(V1_A, V1_R), (V2_A, V2_R)],
    "ai-cap-3d.js": [(D1_A, D1_R), (D2_A, D2_R), (REN_A, REN_R)],
    "ai-cap-video.js": [(REN_A, REN_R)],
}

state = {}
for fn, edits in EDITS.items():
    p = os.path.join(ASSETS, fn)
    txt = read_bytes(p).decode("utf-8")
    nl = detect_nl(txt)
    state[fn] = {"path": p, "txt": txt, "nl": nl}
    log("[eol] %-18s crlf=%d loneLF=%d" if False else
        "[eol] %-18s nl=%r" % (fn, nl))
    for i, (a, r) in enumerate(edits):
        aa = a.replace("\n", nl or "\n")
        cnt = txt.count(aa)
        if cnt != 1:
            log("FATAL %s edit#%d anchor count=%d" % (fn, i, cnt))
            write_bytes(REPORT, "\n".join(L).encode("utf-8"))
            print("FATAL"); sys.exit(2)

for fn, edits in EDITS.items():
    st = state[fn]; nl = st["nl"] or "\n"
    write_bytes(st["path"] + BAK, read_bytes(st["path"]))
    txt = st["txt"]
    for (a, r) in edits:
        txt = txt.replace(a.replace("\n", nl), r.replace("\n", nl), 1)
    write_bytes(st["path"], txt.encode("utf-8"))
    st["after"] = txt
    log("[patched] %s" % fn)

# verify
for fn in EDITS:
    t = state[fn]["after"]
    log("[check] %-18s probeCostly=%d probeNoAuto=%d TINY_PNG=%d PROBE_PNG=%d" %
        (fn, t.count("probeCostly"), t.count("probeNoAuto"), t.count("TINY_PNG"), t.count("PROBE_PNG")))
    nl2 = detect_nl(t)
    log("        eol_after=%r" % nl2)

write_bytes(REPORT, "\n".join(L).encode("utf-8"))
print("DONE")
