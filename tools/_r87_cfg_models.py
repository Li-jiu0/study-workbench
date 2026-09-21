# -*- coding: utf-8 -*-
import io, re
s = io.open('assets/ai-config.js', encoding='utf-8', errors='replace').read()
i = s.find('builtinModels')
seg = s[i:]
j = seg.find('\n  ],')
seg = seg[:j+5]
out = []
out.append('builtinModels seg len=%d' % len(seg))
blocks = re.findall(r'\{[^{}]*?id:\s*"[^"]+"[^{}]*?\}', seg, re.S)
out.append('blocks=%d' % len(blocks))
for b in blocks:
    def g(p):
        m = re.search(p, b)
        return m.group(1) if m else '?'
    out.append('%-28s | %-12s | %-42s | %-26s | %s' % (
        g(r'id:\s*"([^"]+)"'), g(r'provider:\s*"([^"]+)"'), g(r'model:\s*"([^"]+)"'),
        g(r'types:\s*\[([^\]]*)\]'), g(r'tag:\s*"([^"]*)"')))
io.open('tools/_r87_cfg_models.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
