# 服务器 Gemini 出网代理（mihomo）· 2026-09-21 R11h

## 一句话
线上服务器（110.42.134.62）**直连 Google 系域名必超时**，因此 Gemini 内置 Key 的中转出网改走服务器本机的 mihomo（机场订阅客户端），监听 `127.0.0.1:7897`；只把 Google 系域名走代理，其余直连。**`GEMINI_API_KEY` 本身没有被改动。**

## 根因证据（服务器上实测，只读 curl）
| 目标 | 结果 |
|---|---|
| `https://generativelanguage.googleapis.com/`（`curl -4`） | `code=000`、`conn=0.000000s`、15s 超时（TCP 未建立） |
| 同上 `curl -6` | `rc=7`（无 IPv6 路由；DNS 双栈解析均正常） |
| `https://www.google.com/`、`https://www.googleapis.com/` | 同样 000 超时 |
| `https://openrouter.ai/api/v1/models` | **200**（1.63s）→ 海外出网本身是通的 |
| `https://www.gstatic.com/generate_204` | **204**（0.10s） |

⇒ 只有 Google 系被墙。`GEMINI_ALLOW_DIRECT=1` 在这台机器上**无效**，必须走代理。

## 部署形态
- 二进制：`/opt/mihomo/mihomo`（MetaCubeX/mihomo **v1.19.31** linux-amd64-compatible；服务器到 GitHub 仅 ~33 KB/s，故改为**本机下载后 pscp 上传**）。
- 配置：`/opt/mihomo/config.yaml`（`chmod 600`，含机场凭据，**不入库**）
  - `mixed-port: 7897`、`bind-address: 127.0.0.1`、`allow-lan: false` → **仅本机可访问**
  - 规则：`DOMAIN-SUFFIX` 命中 `generativelanguage.googleapis.com` / `googleapis.com` / `google.com` / `googleusercontent.com` → 走代理组；`MATCH,DIRECT` → 其余全部直连（避免占用机场流量、也不影响服务器其它出网）
  - 代理组 `AUTO` = `url-test`（`https://www.gstatic.com/generate_204`，interval 300）
  - 节点（anytls，来自用户机场订阅）：`us-ks`(69.30.197.147:443)、`uk`(51.89.216.207:443)、`de`(51.75.77.164:6001)、`jp1`(jp-1.aikunapp.com:7001)
- 服务：`/etc/systemd/system/mihomo.service`，`systemctl enable --now mihomo`（开机自启、`Restart=always`）
- 后端接线：`/opt/study-workbench/server/.env` 增加一行 `GEMINI_PROXY=http://127.0.0.1:7897`（改前已备份为 `.env.bak-r11h-<时间戳>`），随后重启 uvicorn。
- httpx 版本 0.28.1 → 支持 `AsyncClient(proxy=...)`（R132 代码路径）。

## ⚠️ 关键坑：Gemini API 的出口地区限制
逐节点探测时，**香港节点返回 `400 {"message":"User location is not supported for the API use.","status":"FAILED_PRECONDITION"}`**（能连上 Google，但地区不被 API 支持），新加坡节点同样未通过。
**线上只保留 us / uk / de / jp 四个节点**，`AUTO` 组在这四个里自动择优。

## 验证方式（三条，全绿才算正常）
```bash
# 1) 代理链路能拿到 Google 响应
curl -s -x http://127.0.0.1:7897 -o /dev/null -w '%{http_code}\n' \
  "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"   # 期望 200

# 2) 后端认为 Gemini 通道就绪
curl -s http://127.0.0.1:8000/api/ai/models | python3 -c \
 "import sys,json;d=json.load(sys.stdin);print([(m['id'],m.get('relayAvailable')) for m in d['models'] if m['id'] in ('gemini','openrouter')])"
# 期望 [('openrouter', True), ('gemini', True)]

# 3) 端到端真实调用（经服务端中转、用内置 Key）
curl -sN -X POST http://127.0.0.1:8000/api/ai/chat -H 'Content-Type: application/json' \
  -d '{"provider":"gemini","modelId":"gm-flash-lite-latest","messages":[{"role":"user","content":"只回复两个字：成功"}],"maxTokens":64}'
# 期望正文出现「成功」
```
2026-09-21 实测：① `200`（0.61s）② 两者均 `True` ③ 正文 `成功`（0.96s）。

## 日常运维
- 看状态：`systemctl status mihomo` / `journalctl -u mihomo -n 50` / `ss -ltnp | grep 7897`
- 重载配置：改 `/opt/mihomo/config.yaml` 后 `systemctl restart mihomo`
- 换节点：编辑配置里的 `proxies` 与组内 `proxies` 列表 → 重启 → 跑上面三条验证（**必须先确认新节点地区被 Gemini API 支持**，香港/部分节点会 400）
- 排查"Gemini 又不可用"：先跑验证①；①不过=代理或机场节点问题（与 Key 无关），①过而②不过=`.env` 的 `GEMINI_PROXY` 丢了或被部署覆盖，②过而③不过=上游 Key 或额度问题
- 彻底停用：`systemctl disable --now mihomo` + 从 `.env` 删掉 `GEMINI_PROXY`（此时前端会按设计回落到"让用户填自己的 Key"）

## 成本与风险（需留意）
- **机场流量**：用户套餐标注"剩余流量 20.64 GB / 距离下次重置 2 天"。所有用户的 Gemini 请求现在都经这条线出网，**流量消耗随使用量增长**；必要时改为多节点分摊或换独立线路。
- **账号合规**：订阅来自机场，从数据中心 IP 使用是否被允许取决于机场条款；如遇节点大面积失效，优先怀疑账号侧限制。
- **凭据边界**：机场凭据只写在服务器 `/opt/mihomo/config.yaml`（600）与上传时为传参的临时文件（已删）；工作树全库扫描**零命中**，不入 git。
