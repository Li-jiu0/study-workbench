# -*- coding: utf-8 -*-
# R73j v2：服务端 AI 中转状态码友好化（LF 内存处理 + CRLF 落盘 + 防截断守卫）
import ast, shutil, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8') if False else sys.stdout
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
P = r"D:\下载的文件\学习工作台\server\routers\ai.py"

# 防截断守卫：源文件必须是完整文件
size0 = os.path.getsize(P)
assert size0 > 5000, '源文件异常(%dB)，拒绝继续' % size0
shutil.copyfile(P, P + '.bak-pre-402')

with open(P, 'rb') as f:
    t = f.read().decode('utf-8').replace('\r\n', '\n')

old = '''                    if resp.status_code != 200:
                        text = (await resp.aread()).decode("utf-8", "ignore")[:300]
                        msg = f"⚠️ 模型服务返回 {resp.status_code}：{text}"
                        acc.append(msg)
                        yield msg.encode("utf-8")
                        return
'''
new = '''                    if resp.status_code != 200:
                        text = (await resp.aread()).decode("utf-8", "ignore")[:300]
                        # R73j：常见状态友好化——402 欠费 / 401 Key 无效 / 429 限流等，
                        # 不再向用户裸吐平台原始报文（原始报文保留在括号内便于排查）。
                        hint = _STATUS_HINTS.get(resp.status_code)
                        if hint:
                            msg = "⚠️ " + hint + f"（模型服务返回 {resp.status_code}：{text}）"
                        else:
                            msg = f"⚠️ 模型服务返回 {resp.status_code}：{text}"
                        acc.append(msg)
                        yield msg.encode("utf-8")
                        return
'''
assert t.count(old) == 1, '402 分支锚点非唯一: %d' % t.count(old)
t = t.replace(old, new, 1)

anchor = '_MAX_MSGS = 20\n'
table = '''_MAX_MSGS = 20

# R73j：上游非 200 的友好提示（key=HTTP 状态码）。未命中的状态码仍回退为原始报文。
_STATUS_HINTS = {
    400: "请求参数不被该模型平台接受",
    401: "该平台 API Key 无效或已过期，请在 server/.env 更新后重启服务",
    402: "该模型平台账户余额不足，请充值后重试，或切换其他模型/平台",
    403: "该平台拒绝了本次请求（Key 权限不足或地域限制）",
    404: "模型 ID 不存在或接口地址有误，请检查服务端模型配置",
    413: "对话内容过长，请精简后重试",
    429: "该平台限流或额度已用完，请稍后再试或切换模型",
    500: "模型平台服务内部错误，请稍后再试或切换模型",
    502: "模型平台网关异常，请稍后再试",
    503: "该模型平台暂时不可用，请稍后再试",
}
'''
assert t.count(anchor) == 1
t = t.replace(anchor, table, 1)

ast.parse(t)
data = t.replace('\n', '\r\n').encode('utf-8')
with open(P, 'wb') as f:
    f.write(data)
# 写后完整守卫
assert os.path.getsize(P) > size0, '写后体积异常'
raw = open(P, 'rb').read()
print('py 语法: OK | bytes %d -> %d | CRLF: %d/%d' % (
    size0, len(raw), raw.count(b'\r\n'), raw.count(b'\n')))
print('402 提示在:', '该模型平台账户余额不足'.encode('utf-8') in raw)
