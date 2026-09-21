# -*- coding: utf-8 -*-
"""为 smoke_news 准备隔离后端副本（不触碰仓库/生产的 data.db）。

复制 server/ 到临时目录，剔除 .venv / data.db / .env / uploads / backups，
另造隔离 .env（新 JWT_SECRET + 新库）。用法：
    python tools/tmp_setup_news_env.py
"""
import os
import shutil
import sys

SRC = r"D:\下载的文件\学习工作台\server"
DST = r"C:\Users\ATM\AppData\Local\Temp\xingtu_news_smoke\server"

EXCLUDE_DIRS = {".venv", "venv", "__pycache__", "uploads", "backups"}
EXCLUDE_FILES = {"data.db", "data.db-journal", ".env"}


def main() -> int:
    if os.path.exists(DST):
        shutil.rmtree(DST)
    os.makedirs(DST, exist_ok=True)

    n = 0
    for root, dirs, files in os.walk(SRC):
        rel = os.path.relpath(root, SRC)
        # 过滤目录
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not (rel == "." and False)]
        for f in files:
            if f in EXCLUDE_FILES:
                continue
            src_f = os.path.join(root, f)
            dst_dir = os.path.join(DST, rel) if rel != "." else DST
            os.makedirs(dst_dir, exist_ok=True)
            shutil.copy2(src_f, os.path.join(dst_dir, f))
            n += 1

    env = (
        "JWT_SECRET=smoke-news-20260911-not-a-real-secret-0123456789abcdef\n"
        "JWT_EXPIRE_DAYS=7\n"
        "DATABASE_PATH=data.db\n"
    )
    with open(os.path.join(DST, ".env"), "w", encoding="utf-8") as fh:
        fh.write(env)
    print("copied %d files -> %s" % (n, DST))
    return 0


if __name__ == "__main__":
    sys.exit(main())
