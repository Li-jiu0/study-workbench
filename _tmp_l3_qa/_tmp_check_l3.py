# -*- coding: utf-8 -*-
"""L3 self-check: paris / forbidden syntax / alert-confirm-prompt. Writes UTF-8 report."""
import io, re

ROOT = 'D:\\下载的文件\\学习工作台\\'
HTML = ROOT + 'AI.html'
JS = ROOT + 'assets\\ai-page.js'
OUT = []


def read(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()


h = read(HTML)
j = read(JS)

# ---- 1. pairing ----
def cnt(s, pat):
    return len(re.findall(pat, s))

OUT.append('=== pairing ===')
OUT.append('AI.html   <!-- =%d  --> =%d' % (cnt(h, r'<!--'), cnt(h, r'-->')))
stripped = re.sub(r'<script\b[^>]*>.*?</script>', '', h, flags=re.S | re.I)
stripped = re.sub(r'<style\b[^>]*>.*?</style>', '', stripped, flags=re.S | re.I)
OUT.append('AI.html   <div =%d  </div> =%d (script/style removed)' % (cnt(stripped, r'<div\b'), cnt(stripped, r'</div>')))
OUT.append('AI.html   <script =%d  </script> =%d' % (cnt(h, r'<script\b'), cnt(h, r'</script>')))
OUT.append('AI.html   <button =%d  </button> =%d' % (cnt(h, r'<button\b'), cnt(h, r'</button>')))

# ---- 2. forbidden syntax in JS ----
FORB = [
    ('optional-chain ?.', r'\?\.'),
    ('nullish ??', r'\?\?'),
    ('replaceAll', r'\.replaceAll\s*\('),
    ('Object.fromEntries', r'Object\.fromEntries'),
    ('.at(', r'\.at\s*\('),
    ('lookbehind (?<=', r'\(\?<='),
    ('lookbehind (?<!', r'\(\?<!'),
    ('exponent **', r'\*\*'),
    ('object-spread {...', r'\{[^{}\'\"]*\.\.\.'),
    ('obj rest destruct', r'(?:var|let|const)\s*\{[^}]*\.\.\.'),
    ('catch {} bare', r'catch\s*\{'),
    ('native alert', r'\balert\s*\('),
    ('native confirm', r'(?<![.\w])confirm\s*\('),
    ('native prompt', r'(?<![.\w])prompt\s*\('),
]
OUT.append('')
OUT.append('=== forbidden syntax in ai-page.js ===')
for name, pat in FORB:
    m = re.findall(pat, j)
    OUT.append('%-22s %d' % (name, len(m)))

# top-level await (rough): 'await' outside async function -> just report count
OUT.append('await count (non-top-level expected): %d' % len(re.findall(r'\bawait\b', j)))

# ---- 3. duplicate global declarations check ----
OUT.append('')
OUT.append('=== globals in ai-page.js (top-level var/const/let/function) ===')
tops = re.findall(r'^(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)', j, flags=re.M)
OUT.append(', '.join(sorted(set(tops))))

# ---- 4. HTML key ids still present ----
OUT.append('')
OUT.append('=== key ids ===')
for i in ['aiInputBox', 'aiWelcomeInputSlot', 'aiDockInputSlot', 'aiModelPanel',
          'aiModelInfoBtn', 'aiSettingsBtn', 'aiClearBtn', 'aiModelBtn', 'aiModelLabel',
          'aiDeepThinkChip', 'aiSendBtn', 'aiAttachBtn', 'aiFileInput', 'aiChat', 'aiHistory']:
    OUT.append('%-22s html=%s js=%s' % (i, ('id="' + i + '"') in h, ("'" + i + "'") in j))

# ---- 5. css spot check ----
OUT.append('')
OUT.append('=== css spot check ===')
for pat in [r'\.ai-input-wrap\{width:100%;max-width:768px',
            r'\.ai-input-box\{[^}]*background:var\(--ai-card\)',
            r'\.ai-model-panel\{[^}]*z-index:330',
            r'\.ai-welcome \.ai-input-wrap\{max-width:768px\}',
            r'\.ai-hist-foot-btn \.ai-foot-label\{flex:1']:
    OUT.append('%-60s %s' % (pat[:58], bool(re.search(pat, h, flags=re.S))))

with io.open(ROOT + '_tmp_check_l3_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(OUT))
