# -*- coding: utf-8 -*-
import json
import re

cfg = open(r"D:\下载的文件\学习工作台\assets\ai-config.js", "rb").read().decode("utf-8")
reg = json.load(open(r"D:\下载的文件\学习工作台\server\data\model_registry.json", "r", encoding="utf-8"))
reg.pop("_note", None)

# extract builtinModels object literals (id/name/model/provider)
out = []
blocks = re.findall(r'\{[^{}]*?id\s*:\s*"([^"]+)"[^{}]*?\}', cfg)
# better: parse each model block by regex on id + model + provider
models = []
for m in re.finditer(r'id:\s*"([^"]+)"\s*,\s*\n\s*name:\s*"([^"]*)"\s*,\s*\n\s*provider:\s*"([^"]*)"\s*,\s*\n\s*model:\s*"([^"]*)"', cfg):
    models.append({"id": m.group(1), "name": m.group(2), "provider": m.group(3), "model": m.group(4)})

out.append("ai-config builtinModels parsed: %d" % len(models))
out.append("registry keys: %d" % len(reg))

reg_key_set = set(reg.keys())
reg_model_to_key = {}
for k, v in reg.items():
    if isinstance(v, dict) and v.get("model"):
        reg_model_to_key.setdefault(v["model"], []).append(k)

id_hit = 0
model_hit = 0
neither = []
for mm in models:
    if mm["id"] in reg_key_set:
        id_hit += 1
    if mm["model"] in reg_model_to_key:
        model_hit += 1
    if mm["id"] not in reg_key_set and mm["model"] not in reg_model_to_key:
        neither.append(mm)

out.append("ai-config id matches a registry KEY: %d / %d" % (id_hit, len(models)))
out.append("ai-config model matches a registry model value: %d / %d" % (model_hit, len(models)))
out.append("NEITHER: %d" % len(neither))
out.append("--- first 10 models: id | provider | model | id_in_regkey? | model_in_regval? ---")
for mm in models[:14]:
    out.append("%-22s | %-10s | %-34s | key=%s | val=%s" % (
        mm["id"], mm["provider"], mm["model"],
        "Y" if mm["id"] in reg_key_set else "N",
        "Y" if mm["model"] in reg_model_to_key else "N"))

out.append("")
out.append("=== 结论 ===")
out.append("若 modelId 用的是 ai-config 的 id，而 registry key 不同 -> resolve_model_name 查不到 -> 回退 .env 默认模型。")

with open(r"C:\Users\ATM\_r88m1_match.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
