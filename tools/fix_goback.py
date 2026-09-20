# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'

# 修复三个页面的 goBack() 语法错误
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(A, name)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    # 匹配损坏的 goBack 函数并替换
    old = re.search(r'function\s+goBack\s*\([^)]*\)\s*\{[^}]*\}\s*else\s*\{[^}]*\}\s*\}', h, re.S)
    if old:
        h = h[:old.start()] + "function goBack() { location.href='学习工作台.html'; }" + h[old.end():]
        with io.open(fp, 'w', encoding='utf-8') as f:
            f.write(h)
        print('FIXED:', name)
    else:
        # 尝试简单匹配
        old2 = re.search(r'function\s+goBack.*?\}\s*else\s*\{.*?\}\s*\}', h, re.S)
        if old2:
            h = h[:old2.start()] + "function goBack() { location.href='学习工作台.html'; }" + h[old2.end():]
            with io.open(fp, 'w', encoding='utf-8') as f:
                f.write(h)
            print('FIXED(v2):', name)
        else:
            print('NOT FOUND:', name)

# 验证修复后语法
print()
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(A, name)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    m = re.search(r'function\s+goBack\s*\([^)]*\)\s*\{[^}]*\}', h)
    print(name, '->', m.group(0) if m else 'NOT FOUND')
