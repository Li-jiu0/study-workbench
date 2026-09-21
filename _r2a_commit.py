# -*- coding: utf-8 -*-
"""R2A 收尾：暂存本批改动并提交（不推送）"""
import subprocess, os

os.chdir(r'D:\下载的文件\学习工作台')


def g(*a):
    r = subprocess.run(['git'] + list(a), capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=900)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


print('--- git add -u ---')
print(g('add', '-u')[1][:800])

NEW = [
    '协议.html', '数据管理.html', 'assets/img-viewer.js',
    'android/java/com/study/workbench/PollKeepAliveJobService.java',
    'docs/增量设计-实时位置双向共享.md',
    'docs/增量设计-图片查看与保存-协议重写-数据管理重构.md',
    'docs/增量设计-关于页-设置核对-横幅通知-模型删除.md',
    '_r2a_stamp.py', '_r2a_sync_main.py', '_r2a_prod_probe.py', '_r2a_preflight.py',
    '_r2a_srv_3layer.py', '_r2a_fulldiff.py', '_r2a_deploy.py', '_r2a_postverify.py',
]
print('--- git add 新增 ---')
print(g('add', '--', *NEW)[1][:600])

rc, out = g('status', '--porcelain')
lines = [l for l in out.split('\n') if l.strip()]
print('暂存/未跟踪条目数 =', len(lines))
for l in lines[:60]:
    print('   ', l)

MSG = (
    'R2A 全量：图片查看器/协议页/数据管理页/关于页/设置核对 + 双向位置共享 + 3D字段修复上线\n\n'
    '* 前端新增：assets/img-viewer.js（捏合缩放/拖动/翻页/保存到相册）、协议.html（UA九章+隐私八章）、\n'
    '  数据管理.html（微信存储空间风：分类占用/清理/备份/检测更新）\n'
    '* 前端改造：关于.html 八区块重写（版本单源 window.XT_VERSION）、设置.html 收敛为「存储空间」入口、\n'
    '  个人中心新增数据管理入口、chat-local/xt-moments 接入 ImgViewer、api.js aiStream 真实生效\n'
    '* 设置核对：删除 6 项无消费点设置键（studyLimitWarn/reviewRemind/cardAutoPlay/notesPublic/canSearch/studyPublic）；\n'
    '  aiContext 接入上下文门控；applyStudyReminder 迁入 xt-settings.js 并由 app.js boot 无条件注册\n'
    '* 服务端：liveloc.py 双向共享（pair/group 索引改列表、sessions[] 返回）、ai.py _task_view 内容类型加固、\n'
    '  删除 Hyper3D-Gen2（model_registry/model_quota）\n'
    '* Android：通知权限引导闭环 + PollKeepAliveJobService 保活 + 渠道 xt_msg_v2 + 图片存相册桥（需重打包 APK）\n'
    '* 部署：全量差量推送 105 个文件到生产，逐文件 MD5 校验通过，差异归零（豁免 4 项）\n'
    '* 修复：发现并修复 16 个页面尾部被重复追加片段导致的结构破损\n'
)
rc, out = g('commit', '-m', MSG)
print('--- commit ---')
print('rc=', rc)
print(out[:2000])
print('--- HEAD ---')
print(g('log', '--oneline', '-2')[1][:400])
