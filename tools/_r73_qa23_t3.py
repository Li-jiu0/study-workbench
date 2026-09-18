import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
print("HERE", repr(HERE))
PJ = os.path.join(HERE, "_r73_qa23_pages.json")
print("PJ", repr(PJ))
print("exists", os.path.exists(PJ))
with open(PJ, "r", encoding="utf-8") as f:
    cfg = json.load(f)
print("page2", repr(cfg["pages_32"][2]))
ROOT = os.path.dirname(HERE)
print("ROOT", repr(ROOT))
p = os.path.join(ROOT, cfg["pages_32"][2])
print("p", repr(p))
print("exists_p", os.path.exists(p))
