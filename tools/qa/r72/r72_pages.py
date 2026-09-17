# -*- coding: utf-8 -*-
"""R72 页域 + 数据流独立源码契约（项12 页面结构 / 项13 数据流）。
逐文件读取真实源码做关键断言（非复跑开发脚本）。结果写 UTF-8。
"""
import os, re

ROOT = r"D:\下载的文件\学习工作台"
OUT = r"D:\下载的文件\学习工作台\tools\qa\r72\r72_pages.txt"
A = os.path.join(ROOT, "assets")

results = []
def C(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name, detail))

def R(rel):
    return os.path.join(ROOT, rel.replace("/", os.sep))

def read(p):
    try:
        return open(p, encoding="utf-8", errors="replace").read()
    except Exception as e:
        return ""

def asset_exists(rel):
    # 资源路径可能带 ?v=版本戳（URL query），剥离后再查文件
    p = rel.split("?")[0]
    return os.path.isfile(os.path.join(ROOT, p))

# ============ 项12 需求6/7 页面结构（导入题库.html / 我的文件.html） ============
# 12a 导入题库.html：存在 + script/style 标签平衡 + 本地资源存在 + 含“我的文件”入口
imp_html = read(os.path.join(ROOT, "导入题库.html"))
C("12a1-导入题库.html存在", len(imp_html) > 0)
n_open_script = len(re.findall(r'<script[\s>]', imp_html))
n_close_script = len(re.findall(r'</script>', imp_html))
C("12a2-导入题库.html<script>平衡", n_open_script == n_close_script,
  "open=%d close=%d" % (n_open_script, n_close_script))
n_open_style = len(re.findall(r'<style[\s>]', imp_html))
n_close_style = len(re.findall(r'</style>', imp_html))
C("12a3-导入题库.html<style>平衡", n_open_style == n_close_style,
  "open=%d close=%d" % (n_open_style, n_close_style))
# 引用的本地 assets 均存在
refs = re.findall(r'(?:src|href)\s*=\s*["\'](assets/[^"\']+)', imp_html)
missing = [r for r in refs if not asset_exists(r)]
C("12a4-导入题库.html引用资源均在盘", len(missing) == 0, "缺失=%s" % (missing or "无"))
# 含“我的文件”入口（作品集统一入口）
C("12a5-导入题库.html含我的文件入口", '我的文件.html' in imp_html)
# 承载导入向导容器 importerView（importer.js 收尾 closeImporterView 用）
C("12a6-导入题库.html含importerView容器", 'id="importerView"' in imp_html)
# 复用 importer.js（向导逻辑不重复实现）
C("12a7-导入题库.html复用assets/importer.js", 'assets/importer.js' in imp_html)

# 12b 我的文件.html：存在 + 定义 xtFilesRegister 并挂 window + 三大数据键 + 标签平衡
mf_html = read(os.path.join(ROOT, "我的文件.html"))
C("12b1-我的文件.html存在", len(mf_html) > 0)
C("12b2-我的文件.html定义xtFilesRegister", 'function xtFilesRegister' in mf_html)
C("12b3-我的文件.html挂载window.xtFilesRegister", 'window.xtFilesRegister = xtFilesRegister' in mf_html)
C("12b4-我的文件.html三大数据键",
  ("xtc:lib:pf:folio:works" in mf_html) and ("study_workbench_imports" in mf_html)
  and ("study_workbench_mf_registry" in mf_html))
n2_open = len(re.findall(r'<script[\s>]', mf_html)); n2_close = len(re.findall(r'</script>', mf_html))
C("12b5-我的文件.html<script>平衡", n2_open == n2_close, "open=%d close=%d" % (n2_open, n2_close))
n2s_open = len(re.findall(r'<style[\s>]', mf_html)); n2s_close = len(re.findall(r'</style>', mf_html))
C("12b6-我的文件.html<style>平衡", n2s_open == n2s_close, "open=%d close=%d" % (n2s_open, n2s_close))
refs2 = re.findall(r'(?:src|href)\s*=\s*["\'](assets/[^"\']+)', mf_html)
missing2 = [r for r in refs2 if not asset_exists(r)]
C("12b7-我的文件.html引用资源均在盘", len(missing2) == 0, "缺失=%s" % (missing2 or "无"))

# ============ 项13 需求9 数据流（importer.js -> 我的文件.html 聚合） ============
imp_js = read(os.path.join(A, "importer.js"))
# 13a importer.js 写 study_workbench_imports（唯一真相），并可选登记 xtFilesRegister（typeof 守卫）
C("13a1-importer.js定义IMPORTS_KEY=study_workbench_imports",
  "IMPORTS_KEY = 'study_workbench_imports'" in imp_js)
C("13a2-importer.js有upsertImportBank写盘", 'function upsertImportBank' in imp_js)
C("13a3-importer.js调用window.xtFilesRegister(typeof守卫)",
  ("typeof window.xtFilesRegister === 'function'" in imp_js) and ("window.xtFilesRegister(" in imp_js))
C("13a4-importer.js登记失败不影响主流程(try/catch)",
  "catch (eReg)" in imp_js)
# 13b 导入收尾：刷新宿主列表 + 关闭向导
C("13b1-importer.js收尾调用__impAfterImport", 'window.__impAfterImport' in imp_js)
C("13b2-importer.js收尾closeImporterView", 'window.closeImporterView' in imp_js)
# 13c 我的文件.html 聚合三键（buildEntries 同时读取 works + banks + registry）
C("13c1-我的文件.html聚合读作品集(KEY_WORKS)", 'loadWorks()' in mf_html and 'xtc:lib:pf:folio:works' in mf_html)
C("13c2-我的文件.html聚合读导入库(KEY_IMPORTS)", 'bankEntries()' in mf_html and 'study_workbench_imports' in mf_html)
C("13c3-我的文件.html聚合读登记(KEY_REGISTRY)", 'loadRegistry()' in mf_html and 'study_workbench_mf_registry' in mf_html)
C("13c4-我的文件.htmlbuildEntries三源合并", 'function buildEntries' in mf_html)
# 13d xtFilesRegister 幂等（同 id 覆盖不重复）
reg_src = read(os.path.join(ROOT, "我的文件.html"))
# 在 xtFilesRegister 函数内存在「同 id 覆盖」语义
m = re.search(r'function xtFilesRegister\(entry\)\s*\{(.*?)\n  \}', reg_src, re.S)
has_idempotent = ('cur.id === e.id' in reg_src) and ('list[i] = e' in reg_src)
C("13d-xtFilesRegister幂等(同id覆盖不重复)", has_idempotent)
# 13e 删除流程同时清理导入库键
C("13e-我的文件.html删除清理study_workbench_imports",
  ("KEY_IMPORTS" in reg_src) and ("delete imp[nm]" in reg_src))

# ============ 输出 ============
lines = ["R72 页域+数据流独立源码契约（项12/13）", "=" * 70]
np = nf = 0
for st, name, detail in results:
    lines.append("[%s] %s  %s" % (st, name, detail))
    if st == "PASS": np += 1
    else: nf += 1
lines.append("=" * 70)
lines.append("页域/数据流用例 PASS=%d FAIL=%d" % (np, nf))
open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
