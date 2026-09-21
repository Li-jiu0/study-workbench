# -*- coding: utf-8 -*-
"""R11d/R11f 独立验证：直接调 server/quota_ledger.py，证明「额度满 → 拦截」真的生效。

注意：只在**临时文件**上验证，绝不污染 server/data/model_usage.json（线上账本）。
"""
import os
import sys
import json
import tempfile
from pathlib import Path

sys.path.insert(0, r'D:\下载的文件\学习工作台\server')
import quota_ledger as ql   # noqa: E402

fails = 0


def ok(name, cond, extra=''):
    global fails
    print(('  PASS ' if cond else '  FAIL ') + name + ('  ' + str(extra) if extra else ''))
    if not cond:
        fails += 1


# ---- 隔离：把账本落到临时文件，别碰真实 model_usage.json ----
tmp = tempfile.mkdtemp(prefix='r11d_quota_')
ql.USAGE_PATH = Path(tmp) / 'model_usage.json'
ql._usage = {'models': {}, 'updatedAt': ''}
ql._loaded = False
ql._dirty = False
ql.ensure_loaded()

print('=== 1) 额度表读数 ===')
q, t = ql.get_quota('ark-v4-flash')
ok('ark-v4-flash 有额度（R11f 补漏）', q == 500000 and t == 'tokens', (q, t))
q, t = ql.get_quota('ark-seedance-1-0-pro')
ok('ark-seedance-1-0-pro = 20/videos（R11d 新接入）', q == 20 and t == 'videos', (q, t))
q, t = ql.get_quota('ark-hyper3d-gen2')
ok('ark-hyper3d-gen2 = 60/tasks', q == 60 and t == 'tasks', (q, t))
q, t = ql.get_quota('ark-seedream-5-0-pro')
ok('ark-seedream-5-0-pro = 200/images', q == 200 and t == 'images', (q, t))
q, t = ql.get_quota('ark-seed3d-2-0')
ok('ark-seed3d-2-0 = 60/tasks（R11d 堵缺口）', q == 60 and t == 'tasks', (q, t))
q, t = ql.get_quota('gm-flash')
ok('非方舟（gemini）仍未登记 = 不限量放行（既定边界）', q is None, (q, t))

print()
print('=== 2) 未用量时：放行 ===')
allowed, reason = ql.check_quota('ark-v4-flash')
ok('未用量 → allowed=True', allowed is True, reason)
st = ql.model_status('ark-v4-flash')
ok('status = ok / exhausted=False', st['status'] == 'ok' and st['exhausted'] is False,
   (st['status'], st['exhausted'], st['remaining']))

print()
print('=== 3) 用满额度后：拦截（核心断言） ===')
# 注意：单次上报有防刷上限 MAX_AMOUNT=100000（record_usage 内部 clamp），
# 所以必须分多次累加，不能指望一次传 500000。
for _ in range(5):
    ql.record_usage('ark-v4-flash', 100000, ok=True)
st = ql.model_status('ark-v4-flash')
ok('used 累计到 500000', st['used'] == 500000, st['used'])
ok('status = exhausted', st['status'] == 'exhausted', st['status'])
ok('exhausted = True（前端据此隐藏该模型）', st['exhausted'] is True, st['exhausted'])
ok('remaining = 0 / percent = 100', st['remaining'] == 0 and st['percent'] == 100.0,
   (st['remaining'], st['percent']))
allowed, reason = ql.check_quota('ark-v4-flash')
ok('check_quota → allowed=False（服务端拒绝转发）', allowed is False, reason)
ok('拦截原因文案非空', bool(reason and reason.strip()), reason)

print()
print('=== 4) 「low」阈值（剩余 <=20% 提示，但不禁用） ===')
for _ in range(4):
    ql.record_usage('ark-v4-pro', 100000, ok=True)
st = ql.model_status('ark-v4-pro')
ok('used=400000/500000 → status=low', st['status'] == 'low', (st['status'], st['percent']))
allowed, _ = ql.check_quota('ark-v4-pro')
ok('low 仍放行（只提示不禁用）', allowed is True)
ql.record_usage('ark-v4-pro', 100000, ok=True)
allowed, _ = ql.check_quota('ark-v4-pro')
ok('越界后立刻拦截', allowed is False)

print()
print('=== 4b) 单次上报防刷上限（MAX_AMOUNT） ===')
ql.record_usage('ark-smart-router', 999999, ok=True)
st = ql.model_status('ark-smart-router')
ok('单次 999999 被 clamp 到 %d' % ql.MAX_AMOUNT, st['used'] == ql.MAX_AMOUNT, st['used'])

print()
print('=== 5) 上游 402 兜底：未登记模型也能被强制停用 ===')
before = ql.check_quota('gm-flash')[0]
ql.force_exhaust('gm-flash')
after = ql.check_quota('gm-flash')[0]
st = ql.model_status('gm-flash')
ok('未登记模型原本放行（freeQuota=None 不误拦）', before is True)
ok('force_exhaust 后被拦截', after is False)
ok('freeQuota 仍显示 None（不编造额度）', st['freeQuota'] is None, st['freeQuota'])

print()
print('=== 6) 快照与重置 ===')
snap = ql.ledger_snapshot()
ok('ledger_snapshot 含 models 字段', isinstance(snap.get('models'), dict), len(snap.get('models', {})))
ok('快照里 ark-v4-flash 已 exhausted', snap['models']['ark-v4-flash']['exhausted'] is True)
ql.reset_usage('ark-v4-flash')
ok('reset_usage 后恢复放行', ql.check_quota('ark-v4-flash')[0] is True)

print()
print('=== 7) 不污染真实账本 ===')
real = r'D:\下载的文件\学习工作台\server\data\model_usage.json'
ql.flush()
ok('临时账本已写盘', os.path.exists(ql.USAGE_PATH))
ok('真实账本未被本次烟测改写（临时路径生效）',
   ql.USAGE_PATH != real and str(ql.USAGE_PATH) != real, ql.USAGE_PATH)

print()
print('TOTAL_FAIL = %d' % fails)
sys.exit(1 if fails else 0)
