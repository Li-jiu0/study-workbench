import re
t = open(r'D:\下载的文件\学习工作台\assets\chat-local.js', encoding='utf-8').read()
# find the object literal that contains imBuildChatsFromConversations: and see what precedes its opening brace
i = t.find('imBuildChatsFromConversations: imBuildChatsFromConversations')
# walk backwards to find the matching opening brace of the export object
depth = 0
j = t.find('{', i)
# instead, find the assignment: search backward from i for ' = {' or '={' on a line
seg = t[:i]
# last occurrence of '= {' before i
m = None
for mm in re.finditer(r'=\s*\{', seg):
    m = mm
if m:
    print('ASSIGN at', m.start(), repr(seg[m.start()-25:m.start()+5]))
else:
    print('no = { found before export; last 60 before export:')
    print(repr(seg[-60:]))
# also count window.IM anywhere (case-insensitive)
print('window.IM count:', len(re.findall(r'window\.IM', t)))
print('W.IM count:', len(re.findall(r'\bW\.IM\b', t)))
# find any 'IM =' with identifier
for mm in re.finditer(r'([A-Za-z_$.\[\]\'" ]{1,20})\bIM\b\s*=\s*\{', t):
    print('ID-IM=', repr(mm.group(0)[:40]))
