# -*- coding: utf-8 -*-
"""R171 发版：把「更新说明 + 更新日志」写成 v1.44（面向用户的大白话），并刷新发布时间。

只改 server/routers/version.json 的 notes / changelog[0] / publishedAt 三处，
其余键（version / versionCode / apkFileName / forced / 历史 changelog）一律原样保留。
"""
import io
import json
import os
from datetime import datetime, timedelta, timezone

P = r"D:\下载的文件\学习工作台\server\routers\version.json"

NOW = datetime.now(timezone(timedelta(hours=8)))
STAMP = NOW.strftime('%Y-%m-%dT%H:%M:%S+08:00')

NOTES = [
    "全新管理后台：顶部一排标签改为「功能列表」，打开后台先看到一张清单，点哪一项就进哪个功能，页内有「返回」与「刷新」",
    "管理员能力大幅增强：可封禁 / 解封用户、禁言、强制下线（踢下线）、重置密码、修改用户资料、查看用户数据概览，以及彻底删除用户（删除需输入账号二次确认，删除后不可恢复）",
    "内容治理：管理员可隐藏或删除动态、动态评论、笔记、留言板留言与回复，被隐藏的内容普通用户将不再看到",
    "全站公告：管理员可发布公告，所有用户均可看到；有新公告时入口会显示红点提醒",
    "群组与私聊管理：可查看群成员、修改群名称与群公告、移除成员、解散群；可检索用户会话与消息内容；管理员的每一次管理操作都会留下记录，可在「操作日志」中追溯",
    "管理员隐身：管理员可选择对普通用户隐身，隐身时不会出现在好友列表、用户搜索、动态、留言板等任何公开位置",
    "新增：应用列表上报（默认开启）——App 会读取你手机上已安装应用的「名称与图标」并上报，用于设备安全与账号风险核查（例如识别异常设备）。你可在「设置 → 隐私与安全」中随时关闭，关闭后会同时清除服务器上已保存的这份列表；隐私政策已同步补充说明",
    "反馈回复提醒：管理员回复你的反馈后，你会在「消息通知」里收到一条提醒，点一下直接跳到「我的反馈」查看回复，不必再自己翻找",
    "修复：管理员后台的「删除用户 / 封禁 / 禁言 / 公告 / 内容治理」等功能此前点击无效、反馈提交后看不到回复提醒等问题",
    "更新：《用户服务协议》与《隐私政策》版本号更新为 V1.44，生效日期 2026-09-23，新增已安装应用列表上报的说明与关闭入口",
]

CHANGELOG_ENTRY = {
    "version": "v1.44",
    "date": NOW.strftime('%Y-%m-%d'),
    "notes": NOTES,
}

s = io.open(P, encoding='utf-8', newline='').read()
d = json.loads(s)

old_keys = list(d.keys())
old_notes_len = len(d.get('notes') or [])
old_cl_len = len(d.get('changelog') or [])
old_pub = d.get('publishedAt')

d['notes'] = NOTES
cl = [e for e in (d.get('changelog') or []) if e.get('version') != 'v1.44']
d['changelog'] = [CHANGELOG_ENTRY] + cl
d['publishedAt'] = STAMP

out = json.dumps(d, ensure_ascii=False, indent=2) + '\n'
io.open(P, 'w', encoding='utf-8', newline='\n').write(out)

# ---- 回读校验 ----
back = json.load(io.open(P, encoding='utf-8'))
checks = [
    ('顶层键集合不变', list(back.keys()) == old_keys, '%s' % list(back.keys())),
    ('version 仍为 1.44', back.get('version') == '1.44', back.get('version')),
    ('versionCode 仍为 45', back.get('versionCode') == 45, back.get('versionCode')),
    ('apkFileName 仍为 星途-1.44.apk', back.get('apkFileName') == '星途-1.44.apk', back.get('apkFileName')),
    ('forced 仍为 False', back.get('forced') is False, back.get('forced')),
    ('notes 已替换为 %d 条新说明' % len(NOTES), back.get('notes') == NOTES, '%d -> %d 条' % (old_notes_len, len(back.get('notes') or []))),
    ('changelog 新增 1 条（%d -> %d）' % (old_cl_len, old_cl_len + 1), len(back.get('changelog') or []) == old_cl_len + 1, len(back.get('changelog') or [])),
    ('changelog[0] 是 v1.44', (back.get('changelog') or [{}])[0].get('version') == 'v1.44', (back.get('changelog') or [{}])[0].get('version')),
    ('changelog[1] 仍是 v1.43（历史未丢）', (back.get('changelog') or [{}, {}])[1].get('version') == 'v1.43', (back.get('changelog') or [{}, {}])[1].get('version')),
    ('publishedAt 已刷新', back.get('publishedAt') == STAMP, '%s -> %s' % (old_pub, back.get('publishedAt'))),
    ('无 v1.44 重复条目', sum(1 for e in back.get('changelog') or [] if e.get('version') == 'v1.44') == 1, ''),
]
print('---- version.json 回读校验 ----')
fails = 0
for name, ok, extra in checks:
    print('  [%s] %s%s' % ('PASS' if ok else 'FAIL', name, ('  :: ' + str(extra)) if extra else ''))
    if not ok:
        fails += 1
print()
print('v1.44 更新说明（%d 条）：' % len(NOTES))
for i, n in enumerate(NOTES, 1):
    print('  %2d. %s' % (i, n))
print()
print('publishedAt = %s' % STAMP)
print('R171_VERSION_NOTES_' + ('PASS' if not fails else 'FAIL'))
raise SystemExit(0 if not fails else 1)
