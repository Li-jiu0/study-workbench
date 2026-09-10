#!/bin/bash
cd /opt/study-workbench/server
source .venv/bin/activate
python3 << 'PYEOF'
from database import SessionLocal, User
db = SessionLocal()
users = db.query(User).all()
print(f"用户总数: {len(users)}")
for u in users:
    print(f"  ID={u.id}  username={u.username}  nickname={u.nickname}")
db.close()
PYEOF
