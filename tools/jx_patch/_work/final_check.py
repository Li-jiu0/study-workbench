# -*- coding: utf-8 -*-
"""最终校验：存疑项看完整上下文 + 更多 入/人 复合词探测。"""
import json, io, os

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))
doc = {}
for t in texts:
    doc[t["id"]] = t

# 1) 更多 入/人 复合词探测
EXTRA = ["加入","写入","注入","混入","并入","编入","渗入","迁入","嵌入","装入","汇入",
         "转入","归入","导入","流入","落入","陷入","卷入","涉入","参入","插入","放入",
         "存入","载人","送入","纳入","纳入","减人","套人","进人","送人","过人","走人",
         "找人","选人","引人","输入","投入","收入","进入","融入","深入"]
base = [w.replace("入","人") for w in EXTRA]

alltext = []
for t in texts:
    alltext.append(("q", t["id"], t["q"]))
    for k, o in enumerate(t["o"] or []):
        alltext.append(("o%d" % k, t["id"], str(o)))

def cnt(s):
    n = 0
    for f, i, txt in alltext:
        n += txt.count(s)
    return n

print("########## 入/人 复合词对照（错形 / 正形）##########")
for w, b in zip(EXTRA, base):
    cb, cw = cnt(b), cnt(w)
    if cb or cw:
        print("%s(错) %d  |  %s(正) %d" % (b, cb, w, cw))

print("\n########## 存疑项完整上下文 ##########")
TARGETS = [("年未","年末"),("于部","干部"),("自化","白化"),("西川","四川"),
           ("人库","入库"),("人股","入股"),("人场","入场"),("人境","入境"),
           ("微分儿何","微分几何"),("裤碟","砗磲"),("裤化石","砗磲化石"),
           ("人围","入围"),("人门","入门"),("人账","入账"),("人学","入学")]
for frm, to in TARGETS:
    ids = set()
    for f, tid, txt in alltext:
        if frm in txt: ids.add(tid)
    print("\n=== %s -> %s  (命中 %d, 涉及 %d 题) ===" % (frm, to, cnt(frm), len(ids)))
    for tid in sorted(ids):
        t = doc[tid]
        s = t["q"]
        for k, o in enumerate(t["o"] or []):
            s += " ||o%d: " % k + str(o)
        p = 0
        while True:
            p = s.find(frm, p)
            if p < 0: break
            print("   id=%s ...%s..." % (tid, s[max(0,p-40):p+len(frm)+40].replace("\n","\\n")))
            p += 1
