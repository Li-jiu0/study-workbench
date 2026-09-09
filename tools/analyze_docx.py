# -*- coding: utf-8 -*-
import zipfile, os, re
from xml.etree import ElementTree as ET

docx = r'C:\Users\ATM\Desktop\数据结构.docx'
print('文件存在:', os.path.exists(docx))
print('文件大小:', os.path.getsize(docx), 'bytes')

with zipfile.ZipFile(docx) as z:
    names = z.namelist()
    print('docx 内部文件:', [n for n in names if 'document' in n or 'content' in n])
    
    # 读取 document.xml
    with z.open('word/document.xml') as f:
        xml_content = f.read().decode('utf-8', errors='replace')
    
    # 提取所有文本
    # 用正则提取 <w:t> 标签内容
    texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', xml_content, re.S)
    full_text = '\n'.join(t for t in texts if t.strip())
    print()
    print('===== 提取的文本（前 2000 字）=====')
    print(full_text[:2000])
    print()
    print('总文本长度:', len(full_text))
    print('段落数:', full_text.count('\n') + 1)
    
    # 看是否有图片
    media = [n for n in names if n.startswith('word/media/')]
    print('包含图片:', len(media), '张')
