#!/bin/bash
# lead 独立生产只读复核（不写生产）——批4 版
B=/opt/study-workbench
A=$B/web/assets
echo "=== [1] 9 文件 md5 ==="
md5sum $B/server/routers/chat.py $B/server/database.py $B/server/ws.py $A/xt-region.js $A/chat-local.js $B/web/地区选择.html $B/web/朋友圈发布.html $B/web/社区.html $B/web/私聊.html

echo "=== [2] counter（应为 count=3）==="
cat $B/server/data/geo_place_count.json

echo "=== [3] 4 页戳 h / g 与引用串 ==="
cd $B/web && python3 - <<'PYEOF'
import io, re
for f in ['地区选择.html','朋友圈发布.html','社区.html','私聊.html']:
    t = io.open(f, encoding='utf-8', errors='replace').read()
    print('STAMP %s h=%d g=%d' % (f, t.count('20260919h'), t.count('20260919g')))
t = io.open('私聊.html', encoding='utf-8', errors='replace').read()
print('REF', sorted(set(re.findall(r'(?:xt-region|chat-local)\.js\?v=\S{10}', t))))
PYEOF

echo "=== [4] 批4 钩子 ==="
printf 'xt-region: myloc=%s doMyLoc=%s enableHighAccuracy=%s curPrecise=%s\n' \
 "$(grep -c 'data-act=.myloc' $A/xt-region.js)" "$(grep -c 'doMyLoc' $A/xt-region.js)" "$(grep -c 'enableHighAccuracy' $A/xt-region.js)" "$(grep -c 'curPrecise' $A/xt-region.js)"
printf 'chat-local: im-loc-badge=%s precise=%s\n' "$(grep -c 'im-loc-badge' $A/chat-local.js)" "$(grep -c 'precise' $A/chat-local.js)"
printf 'chat.py: precise=%s\n' "$(grep -c 'precise' $B/server/routers/chat.py)"

echo "=== [5] DB 迁移实况 ==="
python3 - <<'PYEOF'
import sqlite3, os, glob
cands = ['/opt/study-workbench/server/data/data.db', '/opt/study-workbench/server/data.db'] + glob.glob('/opt/study-workbench/server/**/*.db', recursive=True)
db = next((c for c in cands if os.path.exists(c)), None)
print('DB', db)
c = sqlite3.connect(db)
cols = [r[1] for r in c.execute("PRAGMA table_info(messages)")]
print('has_precise', 'precise' in cols, 'ncols', len(cols))
print('count', c.execute("SELECT COUNT(*) FROM messages").fetchone()[0])
print('locrows', c.execute("SELECT COUNT(*) FROM messages WHERE kind='location'").fetchone()[0])
for r in c.execute("SELECT id, content, sub, lat, lng, precise FROM messages WHERE kind='location' AND lat IS NOT NULL ORDER BY id DESC LIMIT 3"):
    print('ROW', r)
c.close()
PYEOF

echo "=== [6] 版本 / 服务 ==="
curl -s http://127.0.0.1:8000/api/app/version | python3 -c "import sys,json; d=json.load(sys.stdin); print('VER', d.get('version'), d.get('versionCode'), d.get('apkReady'))"
ps -eo pid,etimes,cmd | grep -i uvicorn | grep -v grep
echo DONE
