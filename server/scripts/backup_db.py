"""学习工作台 · 数据库与上传文件自动备份脚本。

用法（在 server/ 目录下）：
    python scripts/backup_db.py                  # 备份到 server/backups/<时间戳>/
    python scripts/backup_db.py --keep 30        # 保留最近 30 份，超出自动删除
    python scripts/backup_db.py --no-uploads     # 只备份数据库，不带 uploads 图片

说明：
- 数据库用 sqlite3 在线备份 API 复制，保证写操作进行时也能得到一致快照；
- uploads（头像 + 笔记插图）一起拷入本次快照文件夹；
- 每份备份是独立文件夹 backups/YYYY-MM-DD_HHMMSS/，内含 data.db 与 uploads/。

定时备份示例（Windows 计划任务 / Linux crontab）：
    # 每天 03:30 执行（Linux crontab）
    30 3 * * *  cd /path/to/server && python scripts/backup_db.py --keep 14

手动恢复：
    1) 停止后端 uvicorn；
    2) 把 backups/<时间戳>/data.db 覆盖回 server/data.db（先备份当前的）；
    3) 如需恢复图片，把 backups/<时间戳>/uploads 覆盖回 server/uploads；
    4) 重新启动后端。
"""
import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # server/
DB_PATH = BASE_DIR / "data.db"
UPLOADS_DIR = BASE_DIR / "uploads"
BACKUP_ROOT = BASE_DIR / "backups"


def backup_once(include_uploads: bool) -> Path:
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    dest = BACKUP_ROOT / stamp
    dest.mkdir(parents=True, exist_ok=True)

    if DB_PATH.exists():
        # 在线一致性快照：sqlite3 backup 允许目标库正在被读写
        try:
            src = sqlite3.connect(DB_PATH)
            dst = sqlite3.connect(dest / "data.db")
            with dst:
                src.backup(dst)
            dst.close()
            src.close()
        except Exception as e:  # 极端情况退回普通拷贝
            shutil.copy2(DB_PATH, dest / "data.db")
            print(f"[warn] sqlite 在线备份失败，改用直接拷贝：{e}", file=sys.stderr)
    else:
        print("[warn] 未找到 data.db，跳过数据库备份", file=sys.stderr)

    if include_uploads and UPLOADS_DIR.exists():
        shutil.copytree(UPLOADS_DIR, dest / "uploads", dirs_exist_ok=True)

    return dest


def prune(keep: int) -> None:
    if keep <= 0 or not BACKUP_ROOT.exists():
        return
    folders = sorted(
        (p for p in BACKUP_ROOT.iterdir() if p.is_dir() and p.name[:4].isdigit()),
        key=lambda p: p.name,
    )
    for old in folders[:-keep]:
        shutil.rmtree(old, ignore_errors=True)
        print(f"[prune] 删除过期备份：{old.name}")


def main() -> int:
    ap = argparse.ArgumentParser(description="学习工作台数据备份")
    ap.add_argument("--keep", type=int, default=14, help="保留最近 N 份备份（默认 14）")
    ap.add_argument("--no-uploads", action="store_true", help="不备份 uploads 图片目录")
    args = ap.parse_args()

    dest = backup_once(include_uploads=not args.no_uploads)
    prune(args.keep)
    print(f"[ok] 备份完成：{dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
