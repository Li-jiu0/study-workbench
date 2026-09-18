# -*- coding: utf-8 -*-
import urllib.request
import urllib.parse
BASE = "http://110.42.134.62"
L = []
for path in ["/mock_exam.html", "/mock_exam_run.html", "/mock_exam_result.html",
             "/AI模拟面试.html", "/学途.html", "/好友申请.html", "/登录.html"]:
    url = BASE + "/" + urllib.parse.quote(path)
    try:
        body = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "x"}), timeout=25
        ).read().decode("utf-8", "replace")
        # 取 <style> 段里 html/body 的声明
        import re
        seg = body[:4000]
        has_y = "overflow-y" in seg and "auto" in seg
        has_lock = "height: 100%" in seg.replace(" ", "").replace("height:100%", "height: 100%")
        L.append("%-26s overflow-y:auto=%s  (前 4KB 片段含 overflow-y 与 auto: %s)" % (
            path, "YES" if has_y else "NO", has_y))
    except Exception as e:
        L.append("%-26s ERR %r" % (path, e))
with open(r"D:\下载的文件\学习工作台\tools\_live_out2.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(L))
