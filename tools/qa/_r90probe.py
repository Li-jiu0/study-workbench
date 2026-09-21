# -*- coding: utf-8 -*-
import os
ROOT = 'D:/下载的文件/学习工作台'
out = []
for f in ['私聊.html', 'assets/xt-region.js', '朋友圈发布.html']:
    b = open(os.path.join(ROOT, f), 'rb').read()
    crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
    out.append('%-24s bytes=%-7d crlf=%-5d loneLF=%-4d loneCR=%d' % (f, len(b), crlf, lf, cr))
open(os.path.join(ROOT, 'tools/qa/_r90probe.txt'), 'wb').write('\n'.join(out).encode('utf-8'))
