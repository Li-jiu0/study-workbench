# -*- coding: utf-8 -*-
"""
m6c_scan.py — R88-M6 续作：全树 emoji 残留扫描器（只扫描、只报告，不落盘改动）
最终版：v1/v2/v3 合并 + 干净单遍分类器 + icon-key 存在性核实。
输出：tools/m6c_report.txt
"""
import os, re, json

ROOT = r"D:\下载的文件\学习工作台"
_pf = open(os.path.join(ROOT, 'tools', 'm6c_prog.txt'), 'w', encoding='utf-8')
def _P(s):
    _pf.write(s + '\n'); _pf.flush()
_P('boot')

# 扫描范围
def iter_targets():
    # 仅扫描「根目录顶层」的 .html（排除 备份/ _bak-* / tools/ assets/ 等子目录）
    for fn in os.listdir(ROOT):
        p = os.path.join(ROOT, fn)
        if os.path.isfile(p) and fn.lower().endswith('.html'):
            yield p
    # assets/*.js
    adir = os.path.join(ROOT, 'assets')
    if os.path.isdir(adir):
        for fn in os.listdir(adir):
            if fn.lower().endswith('.js'):
                yield os.path.join(adir, fn)

# 跳过文件（其它线占用 / 排除）
SKIP_FILES = {
    'icon-map.js',          # 本身就是图标库
    'xt-profile.js',        # M5 占用
    '朋友圈发布.html',       # M3 占用
}

# emoji / 符号 Unicode 区段
RANGES = [
    (0x1F300, 0x1FAFF, 'Misc Symbols/Pictographs/Emoji'),
    (0x1F000, 0x1F2FF, 'Mahjong/Cards/Enclosed'),
    (0x2600,  0x27BF,  'Misc Symbols & Dingbats'),
    (0x2190,  0x21FF,  'Arrows'),
    (0x2B00,  0x2BFF,  'Misc Symbols Arrows'),
    (0xFE0F,  0xFE0F,  'VS16 variation selector'),
    (0x200D,  0x200D,  'ZWJ'),
    (0x1F1E6, 0x1F1FF, 'Regional Indicator'),
    (0x2300,  0x23FF,  'Technical (⌚⏰⏳)'),
    (0x2460,  0x24FF,  'Enclosed Alphanumerics'),
    (0x25A0,  0x25FF,  'Geometric Shapes'),
    (0x2900,  0x297F,  'Supplemental Arrows-B'),
    (0x2B05,  0x2B07,  'Arrows (⬅⬆⬇)'),
]

def is_emoji(ch):
    cp = ord(ch)
    for lo, hi, _ in RANGES:
        if lo <= cp <= hi:
            return True
    return False

# 编译成单一正则（快 10x+），用于快速预筛每一行
_EMOJI_RE = re.compile(
    '[' +
    '\U0001F000-\U0001FAFF' +
    '\u2190-\u21FF' +
    '\u2300-\u23FF' +
    '\u2460-\u24FF' +
    '\u25A0-\u25FF' +
    '\u2600-\u27BF' +
    '\u2900-\u297F' +
    '\u2B00-\u2BFF' +
    ']'
)

def emojis_in(line):
    # 直接用编译好的正则提取全部 emoji 边界字符（含 ZWJ/VS16 单独处理）
    return _EMOJI_RE.findall(line)

# 分类器：功能性 UI vs 装饰性 vs 存疑
# 思路：功能性 = emoji 出现在「短行」且邻近 html 标签/属性/按钮类名/JS 字符串常量（icon 位）
#       装饰性 = 出现在长中文文案 / 注释行 / 提示语中间
#       存疑   = 无法明确判定

TAG_HINT = re.compile(r'(<button|<a\s|<span|<div|class=|onclick=|id=|title=|placeholder=|>[^<]{0,4}$)')
ICON_SLOT = re.compile(r'(nav-icon|data-icon|btn|icon|ico-|tool-|more-item|back|close|del|add|send|refresh|edit|search|upload|download|menu)', re.I)
COMMENT_HINT = re.compile(r'(^\s*(//|/\*|\*|<!--))')
LONGTEXT_HINT = re.compile(r'[\u4e00-\u9fff]{6,}')

def classify(line, ch):
    stripped = line.strip()
    # 注释行 -> 装饰性（不渲染）
    if COMMENT_HINT.match(stripped):
        return 'DECORATIVE'
    # 中文长文案包夹（>=6 个连续汉字），且 emoji 不在行首标签位 -> 装饰性
    if LONGTEXT_HINT.search(line):
        # 但若 emoji 紧跟 class/tag 说明是图标位
        if ICON_SLOT.search(line):
            return 'FUNCTIONAL'
        return 'DECORATIVE'
    # 含 html 标签/属性 或 icon 类名 -> 功能性
    if TAG_HINT.search(line) or ICON_SLOT.search(line):
        return 'FUNCTIONAL'
    # 短 JS 字符串常量含 emoji
    if re.search(r"['\"`].{0,3}$", line) or re.search(r"['\"`][^'\"`]{0,20}['\"`]", line):
        if len(stripped) <= 60:
            return 'FUNCTIONAL'
    return 'UNSURE'

# ---- 载入 icon-map.js keys ----
icon_keys = set()
imp = os.path.join(ROOT, 'assets', 'icon-map.js')
txt = open(imp, 'r', encoding='utf-8', errors='replace').read()
for m in re.finditer(r'"([a-z0-9\-]+)"\s*:\s*svg\(', txt):
    icon_keys.add(m.group(1))
for m in re.finditer(r"'([a-z0-9\-]+)'\s*:\s*svg\(", txt):
    icon_keys.add(m.group(1))

# 建议替换表：emoji -> 建议 icon key（先核实存在）
SUGGEST = {
    '🗑': 'trash', '🗑️': 'trash',
    '✕': 'close', '✖': 'close', '❌': 'close', '✗': 'close',
    '✓': 'check', '✅': 'check-circle', '✔': 'check',
    '←': 'arrow-left', '➡': 'arrow-right', '→': 'arrow-right',
    '➕': 'plus', '＋': 'plus',
    '✏️': 'edit', '✎': 'pencil', '✍️': 'edit', '🖊': 'pen',
    '🔍': 'search', '🔎': 'search',
    '💬': 'message-circle', '🗨': 'message-circle',
    '📷': 'camera', '📸': 'camera',
    '🖼': 'image', '🖼️': 'image', '🌄': 'image',
    '🔔': 'bell', '🏠': 'home', '👤': 'user', '👥': 'users',
    '⚙️': 'settings', '⚙': 'settings',
    '📄': 'file-text', '📁': 'archive', '📂': 'archive',
    '📥': 'download', '📤': 'upload', '📦': 'package',
    '🔄': 'rotate-ccw', '↺': 'rotate-ccw', '↻': 'rotate-ccw',
    '📊': 'chart-bar', '🎯': 'target', '📋': 'clipboard-list',
    '🚀': 'rocket', '📖': 'book-open', '🎧': 'headphones',
    '📝': 'file-text', '🌙': 'moon', '🔗': 'globe',
    '👁': 'eye', '👁️': 'eye', '❤': 'heart', '🤍': 'heart', '⭐': 'star',
    '★': 'star', '☆': 'star', '🎲': 'shuffle',
    '📍': 'map-pin', '🧹': 'eraser', '➤': 'send',
    '🛡': 'shield', '🏁': 'flag', '🥇': 'award', '🏆': 'trophy',
    '🎁': 'package', '🔥': 'fire', '✨': 'sparkles', '💡': 'lightbulb',
    '📌': 'pin', '📎': 'file', '🖥': 'monitor', '📱': 'smartphone',
    '🔒': 'locked', '🔓': 'locked', '⚠': 'alert-triangle', '⚠️': 'alert-triangle',
}

hits = []          # (relpath, lineno, line, [emoji], category)
per_file = {}

for path in iter_targets():
    fn = os.path.basename(path)
    if fn in SKIP_FILES:
        continue
    _P('read:' + fn)
    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    try:
        fh = open(path, 'r', encoding='utf-8', errors='replace')
        i = 0
        for line in fh:
            i += 1
            ems = emojis_in(line)
            if not ems:
                continue
            cats = {}
            for ch in ems:
                if ch == '\u200d':
                    continue
                c = classify(line, ch)
                cats[c] = cats.get(c, 0) + 1
            linecat = 'UNSURE'
            if 'FUNCTIONAL' in cats:
                linecat = 'FUNCTIONAL'
            elif 'DECORATIVE' in cats:
                linecat = 'DECORATIVE'
            uniq = []
            for ch in ems:
                if ch in ('\u200d', '\ufe0f'):
                    continue
                if ch not in uniq:
                    uniq.append(ch)
            snip = line.rstrip('\r\n')
            if len(snip) > 300:
                # 保留 emoji 附近片段，避免把超长压缩行整行存入内存
                idx = 0
                for k, cc in enumerate(snip):
                    if cc in ems:
                        idx = k
                        break
                s = max(0, idx - 80)
                snip = snip[s:s + 220]
            hits.append((rel, i, snip, uniq, linecat))
            per_file[rel] = per_file.get(rel, 0) + 1
        fh.close()
    except Exception as e:
        import traceback
        _P('ERR:' + fn + ':' + repr(e))
        _P(traceback.format_exc().replace('\n', ' | '))

# 统计
cnt = {'FUNCTIONAL': 0, 'DECORATIVE': 0, 'UNSURE': 0}
for h in hits:
    cnt[h[4]] += 1

# 输出
out = []
out.append('==== R88-M6 全树 emoji 残留扫描报告 (m6c) ====')
out.append('扫描根目录: %s' % ROOT)
out.append('范围: 全树 *.html (跳过 tools/ assets/ 目录) + assets/*.js')
out.append('跳过文件: %s' % ', '.join(sorted(SKIP_FILES)))
out.append('emoji 区段: ' + '; '.join('%04X-%04X %s' % (a,b,n) for a,b,n in RANGES))
out.append('')
out.append('命中总行数: %d' % len(hits))
out.append('涉及文件数: %d' % len(per_file))
out.append('分类统计: FUNCTIONAL=%d  DECORATIVE=%d  UNSURE=%d' % (
    cnt['FUNCTIONAL'], cnt['DECORATIVE'], cnt['UNSURE']))
out.append('')
out.append('---- icon-map.js 已载入 key 数: %d ----' % len(icon_keys))
out.append('')

def dump(cat):
    out.append('==================== %s ====================' % cat)
    rows = [h for h in hits if h[4] == cat]
    for rel, i, line, uniq, _ in rows:
        sugg = []
        for ch in uniq:
            k = SUGGEST.get(ch)
            if k:
                ok = 'OK' if k in icon_keys else 'NO'
                sugg.append('%s->%s[%s]' % (ch, k, ok))
            else:
                sugg.append('%s->?' % ch)
        out.append('%s:%d | %s | emoji=%s | 建议=%s' % (
            rel, i, line.strip()[:120], ''.join(uniq), ','.join(sugg)))
    out.append('')

dump('FUNCTIONAL')
dump('UNSURE')

# 装饰性只给文件计数，不逐条
out.append('==================== DECORATIVE (仅文件计数) ====================')
from collections import Counter
dc = Counter(h[0] for h in hits if h[4] == 'DECORATIVE')
for f, n in sorted(dc.items(), key=lambda x: -x[1]):
    out.append('%4d  %s' % (n, f))

open(os.path.join(ROOT, 'tools', 'm6c_report.txt'), 'w', encoding='utf-8').write('\n'.join(out))
_P('wrote report hits=%d' % len(hits))
print('OK hits=%d functional=%d decorative=%d unsure=%d files=%d' % (
    len(hits), cnt['FUNCTIONAL'], cnt['DECORATIVE'], cnt['UNSURE'], len(per_file)))
