# -*- coding: utf-8 -*-
# R72 提交：先把 APK 摘出索引 -> 指定路径 add -> commit -> 复核 ref 落盘
import subprocess, os, glob, hashlib

T = r'D:\下载的文件\学习工作台'

def git(*args, check=False):
    r = subprocess.run(['git', '-c', 'core.quotepath=false'] + list(args), cwd=T,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    if check and r.returncode != 0:
        raise SystemExit('git %s failed rc=%d\n%s' % (' '.join(args), r.returncode, (r.stderr or '')[:800]))
    return r.returncode, (r.stdout or ''), (r.stderr or '')

out = []

# 1) APK 摘出索引（87MB 二进制不入库；.gitignore 已含它）
rc, so, se = git('rm', '--cached', '--quiet', '学习工作台-安卓App.apk')
out.append('git rm --cached APK rc=%d %s' % (rc, (se or '').strip()[:200]))

# 2) 组装本批提交清单
files = []
# 2.1 根 HTML（42 + blog_wechat；排除备份与临时）
for p in sorted(glob.glob(os.path.join(T, '*.html'))):
    n = os.path.basename(p)
    if n.startswith('_') or 'bak' in n:
        continue
    files.append(n)
# 2.2 资产（本批改动的 7 个）
files += ['assets/' + x for x in ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']]
# 2.3 后端
files += ['server/database.py', 'server/schemas.py', 'server/建表SQL.sql',
          'server/routers/chat.py', 'server/routers/friends.py', 'server/routers/groups.py']
# 2.4 安卓
files += ['android/AndroidManifest.xml', 'android/java/com/study/workbench/MainActivity.java',
          'android/make_icon.py', 'android/res/drawable/ic_launcher.png']
# 2.5 文档
files += ['用户需求与决策总账.md']
# 2.6 工具与证据（限定已知目录，避开 node_modules 等）
for pat in ['tools/deploy_update_20260917r72.py', 'tools/r72_deploy_verify.py',
            'tools/qa/r72/**/*', 'tools/r72_engineer/**/*', 'tools/verifier/verify_r72_task1_chat.js',
            'tools/r72_*.txt', 'tools/r72_*.md']:
    files += [os.path.relpath(p, T) for p in glob.glob(os.path.join(T, pat), recursive=True) if os.path.isfile(p)]
files += [os.path.basename(p) for p in glob.glob(os.path.join(T, '_r72_*')) if os.path.isfile(p)]

# 3) 体积过滤 + 去重（跳过 >5MB、备份、node_modules）
seen, final, skipped = set(), [], []
for f in files:
    if f in seen:
        continue
    seen.add(f)
    p = os.path.join(T, f.replace('/', os.sep))
    if not os.path.exists(p):
        skipped.append((f, 'MISSING'))
        continue
    if 'node_modules' in f or '.venv' in f or f.endswith(('.tar.gz', '.apk')):
        skipped.append((f, 'EXCLUDED-RULE'))
        continue
    sz = os.path.getsize(p)
    if sz > 5 * 1024 * 1024:
        skipped.append((f, 'TOO_BIG %d' % sz))
        continue
    final.append((f, sz))

out.append('提交候选 %d 个文件，合计 %.2f MB' % (len(final), sum(s for _, s in final) / 1048576.0))
out.append('跳过: %s' % (skipped if skipped else 'NONE'))

# 4) git add（分批，避免命令行过长）
B = 60
for i in range(0, len(final), B):
    chunk = [f for f, _ in final[i:i + B]]
    rc, so, se = git('add', '--', *chunk)
    if rc != 0:
        out.append('ADD FAIL chunk %d rc=%d %s' % (i, rc, (se or '')[:300]))
out.append('git add 完成（%d 批）' % ((len(final) + B - 1) // B))

# 5) 提交
MSG = '''feat(R72): 聊天Bug修复 + 我的文件页 + 模型设置优化 + 登录页 + 安卓通知

Bug 修复
- 管理员回复后会话消失：新增 GET /api/chat/conversations（全量往来会话），
  chat-local.js 以服务端为准构建会话列表；localStorage 键改多账号前缀 + 兼容回退；
  app.js migrateLegacyKeys 不再删除裸键（本 Bug 共因）
- 管理员群聊列表：groups.py list_groups 增加管理员只读分支（role=admin-view，详情仍 403）
- 好友备注昵称：新表 friend_remarks + PUT /api/friends/{peer_id}/remark，
  list_friends/conversations/unread 返回 peerRemark（仅回请求者本人）
- 给 AI 发消息误触发内置回复：callAI 预设短路改为仅 opts.allowPreset 时生效，
  默认走真实模型，失败才兜底（degraded）
- AI 好友不可用：getAiConfig 改前缀优先 + 裸键回退
- APK 通知横幅：AndroidBridge.notify(String,String) + 通知渠道 + POST_NOTIFICATIONS

页面与功能
- 新建 我的文件.html（作品集迁入 + 模块分类下拉 + 统一登记入口 xtFilesRegister）
- 新建 导入题库.html（导入题库独立成页，qubank/importer 接线）
- 演示.html 功能清空（保留下线提示 + 跳转），全站「演示」入口改为「我的文件」
- 个人中心移除作品集、增加我的文件入口；更多页删除穿越英语、导入题库改跳独立页
- 关于.html 内容优化 + 版本 v2.3

模型设置
- 批量检测并发 3（仅手动批量；后台队列仍串行，aiHealthCheck 本就不计限频）
- 模型列表移动端布局对齐模型说明页（不再挤压）
- 恢复默认改弹窗：按可用/按速率排序 + 映射到 AI 页模型下拉（写 order/overrides.name）
- 功能分类仅保留 文本/识图/推理 + 存量 catModels.translate 幂等迁移

登录页 / 图标
- 登录按钮仅「登录」；副标题改「祝君一切安好 · 诸事顺宜」；删除 JWT 说明段
- 应用图标重绘（纯几何、零字体依赖）

验证
- 独立 QA 全批回归 136/136 PASS，0 BUG；全站 escheck DONE 0
- 版本戳 20260916S（仅 bump 内容真改过的 6 个资产，109 处）
- 前端部署 MD5 48/48 全等；后端 5 文件 md5 三方一致；线上探针 28/28；users 回锚点 16
'''
rc, so, se = git('commit', '-F', '-', *[]) if False else (None, None, None)
# 用临时文件传 commit message（避免 bash 中文/反引号问题）
msgp = os.path.join(T, '_r72_commit_msg.txt')
open(msgp, 'w', encoding='utf-8', newline='\n').write(MSG)
rc, so, se = git('commit', '-F', msgp)
out.append('git commit rc=%d' % rc)
out.append('stdout: %s' % (so or '').strip()[:400])
out.append('stderr: %s' % (se or '').strip()[:400])

# 6) 复核 ref 是否真落盘（§6.2b：本机 ref 有静默失败怪癖）
rc, so, se = git('log', '--oneline', '-3')
out.append('git log rc=%d\n%s' % (rc, so.strip()))
rc, so, se = git('log', '-1', '--pretty=%H%n%an%n%ad')
out.append('HEAD: %s' % so.strip())

# 7) 提交后凭据自查
rc, so, se = git('ls-files')
bad = [x for x in so.splitlines() if ('data.db' in x or x.endswith('.env') or 'node_modules/' in x or x.endswith('.tar.gz') or x.endswith('.apk'))]
out.append('凭据/垃圾入库命中: %s' % (bad if bad else 'NONE'))
out.append('APK 是否仍被跟踪: %s' % ('YES(异常)' if any('apk' in x for x in so.splitlines()) else 'NO(正确)'))

open(os.path.join(T, '_r72_git_commit_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
