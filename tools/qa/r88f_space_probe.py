# -*- coding: utf-8 -*-
"""最小隔离探针：单独验证 modelId 带空格是否会绕过白名单。

刻意与 r88f_qa_probe.py 分离，且**每个 case 前后都 reset**，
排除「前序合法请求已把 used 累加、导致断言串味」的可能。
"""
import os
import sys
from pathlib import Path
from unittest import mock

ROOT = Path(r"D:\下载的文件\学习工作台")
SERVER = ROOT / "server"
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from fastapi.testclient import TestClient  # noqa: E402
import quota_ledger  # noqa: E402
from main import app  # noqa: E402

OUT = []


def main():
    client = TestClient(app)
    cases = [
        "ark-ds-v4-flash-ga",
        "ark-ds-v4-flash-ga ",
        " ark-ds-v4-flash-ga",
        "  ark-ds-v4-flash-ga  ",
        "\tark-ds-v4-flash-ga",
        "ark-ds-v4-flash-ga\n",
        "no-such-model ",
        " no-such-model",
        "ARK-DS-V4-FLASH-GA",
        "ark-ds-v4-flash-ga\x00",
    ]
    for c in cases:
        quota_ledger.reset_usage(reset_all=True)
        quota_ledger.flush(force=True)
        r = client.post("/api/ai/usage/consume", json={"modelId": c, "amount": 5})
        keys = list(quota_ledger._usage["models"].keys())
        OUT.append("in=%-28r -> HTTP %s  body=%s  ledger_keys=%s"
                   % (c, r.status_code, r.text[:70], keys))
    # 关键：确认账户里有没有出现「带空格的脏键」
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)
    client.post("/api/ai/usage/consume", json={"modelId": " ark-ds-v4-flash-ga ", "amount": 5})
    OUT.append("")
    OUT.append("脏键检测：reset 后发带空格请求，账本键 = %s"
               % list(quota_ledger._usage["models"].keys()))
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)
    OUT.append("清理后账本键 = %s" % list(quota_ledger._usage["models"].keys()))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        OUT.append("EXC: " + traceback.format_exc())
    (ROOT / "tools/qa/_r88f_space_probe.txt").write_text("\n".join(OUT), encoding="utf-8")
