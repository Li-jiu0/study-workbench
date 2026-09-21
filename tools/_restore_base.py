# -*- coding: utf-8 -*-
import tarfile, io, os, re
ROOT = r'D:\下载的文件\学习工作台'
TAR = os.path.join(ROOT, 'tools', 'frontend_20260916k.tar.gz')
out = []
with tarfile.open(TAR) as tf:
    names = tf.getnames()
    for target in ['web/更多.html', 'web/工具.html']:
        if target in names:
            data = tf.extractfile(target).read().decode('utf-8')
            # 写回到可写代码树（覆盖当前可能已损坏的版本）
            dst = os.path.join(ROOT, target.replace('web/', ''))
            io.open(dst, 'w', encoding='utf-8-sig').write(data)
            cards = re.findall(r'class="morepage-card morepage-list-item"', data)
            out.append('%s: 恢复成功, 卡片div数=%d, 含openImporterView=%s, 含#importerView=%s, 含?k=%s'
                       % (target, len(cards), 'openImporterView' in data, 'id="importerView"' in data,
                          ('?v=20260916k' in data)))
        else:
            out.append('%s: !! tar 中不存在' % target)
io.open(r'C:\Users\ATM\_restore_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('written')
