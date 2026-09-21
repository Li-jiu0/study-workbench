# -*- coding: utf-8 -*-
# R73b git 步骤3：提交 + 走代理推送
import subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"
MSG = """R74-R85 第五批交付：动态空间重构/TA资料页/火山方舟模型/代理支持/UI优化

- R74: 朋友圈.html→动态空间.html 迁移合并，动态.html并入；TA资料页(删好友/备注/动态列表/私信入口/非好友态)
- R75: 各平台模型与Key配置更新(ai-config.js)
- R76: 火山方舟12款新模型接入(arkimage图片生成)
- R77: 代理访问支持(auto/relay/direct三态+探测降级)
- R78: 动态空间顶部背景自定义+我的动态卡片改列表入口
- R79/R80: 换背景浮钮删除，背景功能迁移至我的动态.html封面(模块休眠保留)
- R81: 修复4个火山模型ID(404)；图片生成调用链(images/generations)
- R82: 动态空间图标统一lucide
- R83: 检测超时5s/响应30s/总90s；检测失败分场景文案+需梯子徽标
- R84: 动态空间删除自定义背景按钮组；R85: 删除"我→头像→动态"副标题
- 全站版本戳 20260917b(18个变更资产/44页/214处)

QA: 全量回归10/10通过(死链0/侧栏35/35/E1守卫/行尾矩阵/ES2017/jsdom双态)
"""

def run(args):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

rc, out, err = run(["commit", "-m", MSG])
print("commit rc=%d" % rc)
print(out[-1200:])
if err.strip(): print("STDERR:", err[-800:])

rc, out, err = run(["log", "--oneline", "-3"])
print("=== log ===")
print(out)

# 推送：第一优先用环境变量代理端口(本次 60765)，HTTP/1.1
rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:60765",
                    "-c", "https.proxy=http://127.0.0.1:60765",
                    "-c", "http.version=HTTP/1.1",
                    "push", "origin", "main"])
print("push rc=%d" % rc)
print(out[-1500:])
if err.strip(): print("PUSH-STDERR:", err[-1500:])
