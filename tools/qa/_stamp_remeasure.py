# -*- coding: utf-8 -*-
"""执行前再实测一次：所有待改文件的行尾 + 当前字节数。"""
import os, io, json

ROOT = r"D:\下载的文件\学习工作台"

# 待改 HTML 页面（由 _stamp_final.json 得出）+ blog_wechat
TARGET_HTML = [
 "AI.html","AI模拟面试.html","PPT案例拆解.html","PPT版式库.html","ai-settings.html",
 "blog_wechat.html","mock_exam.html","mock_exam_result.html","mock_exam_run.html",
 "万能金句库.html","个人中心.html","个人资料.html","企业定向库.html","关于.html",
 "动态空间.html","商务礼仪.html","四级词汇.html","地区选择.html","场景话术库.html",
 "好友申请.html","学习工作台.html","学习概括.html","学途.html","导入题库.html",
 "工具.html","我的动态.html","我的文件.html","时政热点.html","更多.html","更新.html",
 "朋友圈发布.html","演示.html","申论刷题.html","登录.html","社区.html","私聊.html",
 "管理员.html","英语.html","行测.html","行测刷题.html","表达.html","设置.html",
 "赞助.html","错题本.html","面测.html","面试题库.html",
]

def probe(path):
    b = open(path,"rb").read()
    crlf=b.count(b"\r\n"); lf=b.count(b"\n"); cr=b.count(b"\r")
    kind = "CRLF" if (crlf>0 and lf==crlf) else ("LF" if (crlf==0 and lf>0) else ("MIXED" if lf>0 else "NONE"))
    return {"bytes":len(b),"lines":lf,"crlf":crlf,"lone_lf":lf-crlf,"lone_cr":cr-crlf,"kind":kind}

def main():
    rows=[]
    for rel in TARGET_HTML:
        p=os.path.join(ROOT, rel)
        rows.append((rel, probe(p) if os.path.exists(p) else None))
    lines=["rel\tbytes\tlines\tcrlf\tloneLF\tloneCR\tkind"]
    for rel,e in rows:
        if e is None: lines.append(rel+"\tMISSING"); continue
        lines.append("\t".join([rel,str(e["bytes"]),str(e["lines"]),str(e["crlf"]),str(e["lone_lf"]),str(e["lone_cr"]),e["kind"]]))
    io.open(os.path.join(ROOT,"tools","qa","_stamp_remeasure.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
    print("OK", len(rows))

main()
