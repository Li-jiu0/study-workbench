# -*- coding: utf-8 -*-
"""
任务五：需求 B —— 首页功能中心 6 卡更名 + 6 个 HTML 重命名 + 全站文案/引用同步。

用法：
    python t5_apply.py           # 预演（不写盘），输出统计报告
    python t5_apply.py --apply   # 真正执行

设计要点：
1. 换行符：以 newline='' 读写，原样保留 CRLF / LF。
2. 「广场」采用“保护 token + 兜底替换”策略，避免误伤：
   互动广场 / 笔记广场 / 题库正文里的 文化广场·现沿广场·社区广场·某市中心广场·文旅项目大广场。
3. 只替换完整文件名 token（带 .html），故 行测刷题.html / 商务礼仪.html 不受影响。
4. 绝不替换裸「表达」（664 处）与裸「商务礼仪」（26 处）。
5. ai-config.js 全程跳过。
"""
import io
import os
import sys

ROOT = r'D:\下载的文件\学习工作台'
REPORT = os.path.join(ROOT, 'tools', 'qa', 't5_apply_report.txt')
APPLY = '--apply' in sys.argv

# ---------------- 保护 token ----------------
PROTECT = [
    # (原文, token名) —— 顺序敏感：长/具体在前
    ('文化广场，广场的一边', 'P_BARE'),   # 行测数学题正文中的裸「广场」
    ('互动广场', 'P_HUDONG'),
    ('笔记广场', 'P_BIJI'),
    ('文化广场', 'P_WENHUA'),
    ('某市中心广场', 'P_SZX'),
    ('现沿广场', 'P_XIANYAN'),
    ('社区广场', 'P_SHEQU'),
    ('文旅项目大广场', 'P_WENLV'),
    ('四级备考四步法', 'P_CET4STEP'),     # ai-presets.js 语料，保留
    ('英语四级备考', 'P_CET4TITLE'),      # 四级经验分享.html 帖子标题，保留
]
# 逐个生成互不相同的私有区 token（UE+F0 向下递减）
TOK = {}
for i, (_txt, name) in enumerate(PROTECT):
    TOK[name] = chr(0xE5F0 - i)
assert len(set(TOK.values())) == len(PROTECT), 'token 生成重复'

# ---------------- 文件名 token 替换（先做，带 .html 唯一化） ----------------
FILE_RULES = [
    ('学习博客.html', '社区.html'),
    ('四级备考.html', '英语.html'),
    ('央国企笔试.html', '行测.html'),
    ('高情商表达.html', '表达.html'),
    ('商务礼仪面试.html', '面测.html'),
    ('PPT训练.html', '演示.html'),
]

# ---------------- 展示文案替换（长优先） ----------------
TEXT_RULES = [
    ('商务礼仪及面试', '面测'),
    ('商务礼仪面试', '面测'),
    ('高情商表达', '表达'),
    ('四级备考', '英语'),
    ('央国企笔试', '行测'),
    ('PPT 训练', '演示'),
    ('PPT训练', '演示'),
    ('广场', '社区'),
]

# ---------------- 例外预处理（在保护之后、通用规则之前） ----------------
PRE_RULES = [
    # 避免变成「行测(行测/企业定向库/...」：直接省掉已被新名覆盖的「行测/」
    ('央国企笔试(行测/', '行测('),
    # 避免变成「备考四级、行测、行测等」
    ('行测、央国企笔试等', '行测等'),
]

# ---------------- 文件重命名 ----------------
RENAME = [
    ('学习博客.html', '社区.html'),
    ('四级备考.html', '英语.html'),
    ('央国企笔试.html', '行测.html'),
    ('高情商表达.html', '表达.html'),
    ('商务礼仪面试.html', '面测.html'),
    ('PPT训练.html', '演示.html'),
]

SKIP_JS = {'ai-config.js'}


def collect():
    """收集待处理文件：根 *.html + assets/*.js（排除 ai-config.js）。"""
    res = []
    for n in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, n)
        if os.path.isfile(p) and n.lower().endswith('.html'):
            res.append(p)
    ad = os.path.join(ROOT, 'assets')
    for n in sorted(os.listdir(ad)):
        p = os.path.join(ad, n)
        if os.path.isfile(p) and n.lower().endswith('.js') and n not in SKIP_JS:
            res.append(p)
    return res


def main():
    files = collect()
    log = []
    # 全局计数
    g_protect = {}
    g_file = {}
    g_text = {}
    g_pre = {}
    changed_files = []

    for p in files:
        with io.open(p, 'r', encoding='utf-8', errors='replace', newline='') as f:
            src = f.read()
        rel = os.path.relpath(p, ROOT)
        orig = src

        # 1) 保护
        for txt, name in PROTECT:
            if txt in src:
                n = src.count(txt)
                g_protect[name] = g_protect.get(name, 0) + n
                src = src.replace(txt, TOK[name])

        # 2) 例外预处理
        for a, b in PRE_RULES:
            if a in src:
                n = src.count(a)
                g_pre[a] = g_pre.get(a, 0) + n
                src = src.replace(a, b)

        # 3) 文件名 token
        for a, b in FILE_RULES:
            if a in src:
                n = src.count(a)
                g_file[a] = g_file.get(a, 0) + n
                src = src.replace(a, b)

        # 4) 展示文案
        for a, b in TEXT_RULES:
            if a in src:
                n = src.count(a)
                g_text[a] = g_text.get(a, 0) + n
                src = src.replace(a, b)

        # 5) 还原保护 token
        for txt, name in PROTECT:
            src = src.replace(TOK[name], txt)

        if src != orig:
            changed_files.append(rel)
            if APPLY:
                with io.open(p, 'w', encoding='utf-8', newline='') as f:
                    f.write(src)

    # 6) 重命名
    ren_log = []
    for old, new in RENAME:
        op = os.path.join(ROOT, old)
        np = os.path.join(ROOT, new)
        if os.path.exists(np):
            ren_log.append('  SKIP(目标已存在) %s -> %s' % (old, new))
            continue
        if not os.path.exists(op):
            ren_log.append('  SKIP(源不存在) %s -> %s' % (old, new))
            continue
        if APPLY:
            os.rename(op, np)
        ren_log.append('  OK %s -> %s' % (old, new))

    log.append('MODE = %s' % ('APPLY' if APPLY else 'DRY-RUN'))
    log.append('扫描文件数 = %d（根 html + assets js，跳过 ai-config.js）' % len(files))
    log.append('')
    log.append('=== 文件重命名 ===')
    log.extend(ren_log)
    log.append('')
    log.append('=== 保护（未改动，原样保留）===')
    tot_p = 0
    for txt, name in PROTECT:
        c = g_protect.get(name, 0)
        tot_p += c
        log.append('  %-22s : %d' % (txt, c))
    log.append('  保护合计            : %d' % tot_p)
    log.append('')
    log.append('=== 例外预处理 ===')
    for a, b in PRE_RULES:
        log.append('  %-18s -> %-14s : %d' % (a, b, g_pre.get(a, 0)))
    log.append('')
    log.append('=== 文件名引用替换 ===')
    tot_f = 0
    for a, b in FILE_RULES:
        c = g_file.get(a, 0)
        tot_f += c
        log.append('  %-18s -> %-14s : %d' % (a, b, c))
    log.append('  文件名替换合计      : %d' % tot_f)
    log.append('')
    log.append('=== 展示文案替换 ===')
    tot_t = 0
    for a, b in TEXT_RULES:
        c = g_text.get(a, 0)
        tot_t += c
        log.append('  %-16s -> %-14s : %d' % (a, b, c))
    log.append('  展示文案替换合计    : %d' % tot_t)
    log.append('')
    log.append('=== 被修改文件（%d）===' % len(changed_files))
    log.append('  ' + ', '.join(changed_files))

    with io.open(REPORT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(log))
    print('WROTE', REPORT)


if __name__ == '__main__':
    main()
