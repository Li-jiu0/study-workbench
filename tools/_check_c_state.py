# -*- coding: utf-8 -*-
import io, re, os
ROOT = r'D:\下载的文件/学习工作台'
out = []
for name in ['更多.html', '工具.html']:
    s = io.open(os.path.join(ROOT, name), encoding='utf-8-sig', errors='ignore').read()
    cards = re.findall(r'class="morepage-card morepage-list-item"[^>]*onclick="([^"]+)"', s)
    out.append('%s: openImporterView=%s, #importerView=%s, #impLibs=%s, importer.js标签=%s, 卡片数=%d'
               % (name, 'openImporterView' in s, 'id="importerView"' in s, 'id="impLibs"' in s,
                  ('assets/importer.js' in s), len(cards)))
    out.append('   卡片onclick: ' + ' | '.join(cards))
io.open(r'C:\Users\ATM\_check_c_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('written')
