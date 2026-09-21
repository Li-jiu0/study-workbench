# 创作者反馈接口说明（POST/GET /api/feedback）

批次：20260913j ｜ 负责人：kou-backend ｜ 本批唯一动 server 的改动，**部署时需重启后端服务生效**。

## 1. 背景

新增一条免登录的轻量反馈通道，供「设置页 - 帮助与反馈」表单（kou-settings 实现）使用。
与既有 `/api/feedbacks`（登录用户反馈，SQLite 表，`routers/feedback.py`）完全独立，互不影响。

## 2. 接口定义

### POST /api/feedback —— 免登录提交反馈

请求体（JSON，pydantic 严格校验，不合法返回 422）：

| 字段 | 类型 | 约束 |
|---|---|---|
| nickname | string | 1~20 字 |
| type | string | 仅允许 `suggestion`（优化建议）/ `bug`（问题反馈）/ `feature`（新功能） |
| content | string | 1~2000 字 |

成功返回 `200 {"ok": true}`。

```bash
curl -X POST http://<服务器>/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"nickname":"小明","type":"suggestion","content":"希望四级页面支持夜间模式"}'
```

### GET /api/feedback —— 创作者查看全部反馈

鉴权：请求头 `X-Admin-Key` 必须与 `server/.env` 中 `FEEDBACK_ADMIN_KEY` 一致。

- 密钥不匹配 / 缺失 → `401`
- `.env` 未配置 `FEEDBACK_ADMIN_KEY` → `503`（**接口只写不读**，POST 不受影响）
- 成功 → `200 {"count": n, "items": [...]}`，按 id 倒序（最新在前）

```bash
curl http://<服务器>/api/feedback -H "X-Admin-Key: <你的密钥>"
```

## 3. 存储位置

反馈以 JSON 数组追加写入：`server/data/feedback.json`（UTF-8，原子写盘：临时文件 + replace，进程内加锁）。每条记录：

```json
{"id": 1, "createdAt": "2026-09-13 16:38:06", "nickname": "自测同学",
 "type": "suggestion", "content": "...", "ip": "1.2.3.4"}
```

## 4. 创作者查看方式

**方式一（推荐，SSH 上服务器看原始数据）：**

```bash
ssh <你的服务器> "cat <项目路径>/server/data/feedback.json"
```

**方式二（HTTP 拉取）：**

```bash
curl http://<服务器>/api/feedback -H "X-Admin-Key: <FEEDBACK_ADMIN_KEY 的值>"
```

密钥保存在服务器 `server/.env` 的 `FEEDBACK_ADMIN_KEY` 行（当前本地值：`xj20260913j-f7a3c921b6d84e05`，部署时可自行更换，换后重启服务）。

## 5. 改动清单（server/）

| 文件 | 改动 |
|---|---|
| `server/routers/feedback_public.py` | 新增：两个接口的实现（独立 router，不影响任何现有接口） |
| `server/main.py` | 两处：import 元组加入 `feedback_public`；`app.include_router(feedback_public.router)` 一行 |
| `server/.env` | 追加 `FEEDBACK_ADMIN_KEY` 一行 |
| `server/data/feedback.json` | 运行时自动生成（含自测写入的 1 条记录，可留可删） |

其余接口 / 模型 / 路由组织一律未动。

## 6. ⚠️ 需重启服务声明

本批唯一动 server 的改动。新 router 在 `main.py` 中静态注册，**必须在服务器上重启 uvicorn 后端进程**才能生效；前端（设置页表单）联调前请先确认后端已重启。

## 7. 自测结论

本地 uvicorn 起服（127.0.0.1:8765）实测 8/8 通过：POST 正常落盘、type/昵称/正文越界均 422、GET 无钥/错钥 401、对钥 200 且能读到记录。日志：`tools/qa/j_kou_backend.log`，脚本：`tools/qa/j_kou_backend_selftest.py`。
