import re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(root, 'assets', 'app.js')
src = open(p, encoding='utf-8').read()
i = src.index('const CET_VOCAB')
j = src.index('];', i)
block = src[i:j+2]
words = re.findall(r"word:\s*'([^']+)'", block)
out = os.path.join(root, '_existing_words.txt')
open(out, 'w', encoding='utf-8').write('\n'.join(words))
log = os.path.join(root, '_extract.log')
open(log, 'w', encoding='utf-8').write('COUNT=%d\nFIRST=%s\nLAST=%s\n' % (len(words), words[:5], words[-5:]))
