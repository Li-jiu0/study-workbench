# -*- coding: utf-8 -*-
P = r"D:\下载的文件\学习工作台\server\routers\ai.py"
t = open(P, "rb").read().decode("utf-8")
tests = {
    "import-a": "from quota_ledger import (check_quota, force_exhaust, known_model_ids,\r\n",
    "import-b": "                           resolve_model_name, tokens_from_usage)",
    "models-line": '            {"id": pid, "name": f"{cfg[\'name\']}（{cfg[\'model\']}）", "model": cfg["model"]}',
    "chat-comment": "    # 模型名：modelId 在 model_registry.json 里能查到就用它，否则退回 .env 的默认模型",
    "streaming": '    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")',
}
out = []
for k, v in tests.items():
    out.append("%-14s count=%d" % (k, t.count(v)))
with open(r"C:\Users\ATM\_r88m1_dbg.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
