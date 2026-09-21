import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PJ = os.path.join(HERE, "_r73_qa23_pages.json")
with open(PJ, "rb") as f:
    cfg = json.loads(f.read().decode("utf-8"))
print("page2", repr(cfg["pages_32"][2]))
print("dynamic0", repr(cfg["dynamic_4"][0]))
ok = True
for p in cfg["pages_32"] + cfg["dynamic_4"]:
    fp = os.path.join(ROOT, p)
    if not os.path.exists(fp):
        ok = False
        print("MISSING", repr(p), repr(fp))
print("all_exist", ok)
