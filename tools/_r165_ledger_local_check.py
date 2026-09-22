# -*- coding: utf-8 -*-
"""R165 服务端账本本地验证 v2（隔离临时目录，不碰真实数据）。
真实结构：{"models": {model_id: {used,calls,failCalls,updatedAt,blocked,blockedAt}}, "updatedAt": ""}
用例：
  1) record_usage 记账累加
  2) force_exhaust → 24h 内 check_quota 拦截（exhausted）
  3) blockedAt 改为 25h 前 → 自愈窗口过期 → 放行
  4) blocked=True 但无 blockedAt（旧账本）→ 视为过期 → 放行
  5) 成功调用（record_usage ok=True）→ 清除 blocked 标记
  6) videos 型按「次」记账不被 token 数污染
"""
import json, os, shutil, sys, tempfile, datetime

SRC = r'D:\下载的文件\学习工作台\server\quota_ledger.py'
tmp = tempfile.mkdtemp(prefix='r165_ledger_')
fails = []


def chk(name, cond, extra=''):
    print(('  PASS  ' if cond else '  FAIL  ') + name + ('  ' + str(extra) if extra else ''))
    if not cond:
        fails.append(name)


try:
    os.makedirs(os.path.join(tmp, 'data'))
    shutil.copy(SRC, os.path.join(tmp, 'quota_ledger.py'))
    with open(os.path.join(tmp, 'data', 'model_quota.json'), 'w', encoding='utf-8') as f:
        json.dump({"m-tok": {"freeQuota": 1000, "quotaType": "tokens"},
                   "m-vid": {"freeQuota": 20, "quotaType": "videos"}}, f)
    sys.path.insert(0, tmp)
    import quota_ledger as ql

    USAGE = os.path.join(tmp, 'data', 'model_usage.json')

    def hard_patch(fn):
        """先落盘，再按真实结构改 records，最后强制重载。

        注意：_load_all() 带 `if _loaded: return` 幂等守卫，直接调用是空操作，
        内存里还是旧值（v2 三处假失败的真因）。必须先置 _loaded=False 再重载。
        """
        ql.flush(force=True)
        d = json.load(open(USAGE, encoding='utf-8'))
        recs = d.get('models') or {}
        fn(recs)
        d['models'] = recs
        json.dump(d, open(USAGE, 'w', encoding='utf-8'), ensure_ascii=False)
        ql._loaded = False
        ql._load_all()

    print('== 1) record_usage 记账 ==')
    ql.record_usage('m-tok', 300, ok=True)
    ql.record_usage('m-tok', 200, ok=True)
    st = ql.model_status('m-tok')
    chk('used 累加 = 500', st.get('used') == 500, st.get('used'))
    chk('未 block 时 exhausted=False', st.get('exhausted') is False)

    print('== 2) force_exhaust → 24h 内拦 ==')
    ql.force_exhaust('m-tok')
    st = ql.model_status('m-tok')
    chk('exhausted=True', st.get('exhausted') is True)
    ok, reason = ql.check_quota('m-tok')
    chk('check_quota 拦截', ok is False, reason)

    print('== 3) blockedAt 改为 25h 前 → 自愈放行 ==')
    old = (datetime.datetime.now() - datetime.timedelta(hours=25)).strftime('%Y-%m-%dT%H:%M:%S')
    hard_patch(lambda r: r['m-tok'].update({'blockedAt': old}))
    st = ql.model_status('m-tok')
    ok, reason = ql.check_quota('m-tok')
    chk('过期后 exhausted=False', st.get('exhausted') is False, st.get('status'))
    chk('过期后 check_quota 放行', ok is True, reason)

    print('== 4) 旧账本 blocked=True 无 blockedAt → 不锁死 ==')
    def drop_ts(r):
        r['m-tok']['blocked'] = True
        r['m-tok'].pop('blockedAt', None)
    hard_patch(drop_ts)
    ok, reason = ql.check_quota('m-tok')
    chk('无时间戳视为过期放行', ok is True, reason)

    print('== 5) 成功调用清除 blocked ==')
    ql.record_usage('m-tok', 1, ok=True)
    st = ql.model_status('m-tok')
    chk('blocked 已清除 → exhausted=False', st.get('exhausted') is False, st.get('status'))

    print('== 6) videos 型按次记账 ==')
    ql.record_usage('m-vid', 1, ok=True)
    st = ql.model_status('m-vid')
    chk('m-vid used=1（不是 100000）', st.get('used') == 1, st.get('used'))

    print('\nRESULT: ' + ('R165_LEDGER_LOCAL_ALL_PASS' if not fails else 'HAS_FAIL ' + str(fails)))
finally:
    shutil.rmtree(tmp, ignore_errors=True)
raise SystemExit(0 if not fails else 2)
