import os, glob

cands = [
    r"C:\Users\ATM\Desktop\持续升级优化.txt",
    r"D:\下载的文件\学习工作台\持续升级优化.txt",
    r"D:\下载的文件\学习工作台\持续升级优化.md",
]
for c in cands:
    print("%-60s exists=%s size=%s" % (c, os.path.exists(c), os.path.getsize(c) if os.path.exists(c) else "-"))

print("\n--- Desktop txt files ---")
try:
    for f in os.listdir(r"C:\Users\ATM\Desktop"):
        if f.lower().endswith((".txt", ".md")):
            p = os.path.join(r"C:\Users\ATM\Desktop", f)
            print("  ", f, os.path.getsize(p))
except Exception as e:
    print("ERR", e)

print("\n--- repo root: 持续/赞助/星图/星途/需求 ---")
root = r"D:\下载的文件\学习工作台"
for f in sorted(os.listdir(root)):
    if any(k in f for k in ("持续", "赞助", "星图", "星途", "需求", "适配")):
        print("  ", f)
