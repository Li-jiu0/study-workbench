# AI 后端中转服务（学习工作台 · 可选增强）

给纯前端的学习工作台网页接上真实大模型。**不动你原来的网页结构，只需填一个地址。**

## 为什么需要这个后端？

纯静态网页（只有 HTML/JS）**不能安全地直接调用大模型 API**——密钥写在前端 JS 里，任何人按 F12 都能扒走盗刷。
所以密钥必须放在这个后端的 `.env` 文件里，前端只跟自己的后端通信。

不启动它也完全不影响使用：网页里的 AI 助手会以「本地演示模式」运行（规则引擎回复 + 打字机效果）。

## 部署运行步骤（3 步）

```bash
# ① 安装依赖（需要 Node.js 18+）
cd ai-server
npm install

# ② 配置密钥：复制 .env.example 为 .env，填入你的 API Key
#    （Windows 资源管理器里直接复制重命名，或命令行 copy .env.example .env）
copy .env.example .env

# ③ 启动
npm start
# 看到 ✅ AI后端已启动: http://localhost:3000 即成功
```

## 对接前端（1 步）

用记事本/编辑器打开 `学习工作台.html`，搜索 `AI_CONFIG`，把：

```js
const AI_CONFIG = {
  apiUrl: '',
};
```

改成：

```js
const AI_CONFIG = {
  apiUrl: 'http://localhost:3000/api/chat',
};
```

保存、刷新网页即可。右下角 AI 按钮上的徽标会从「演示」变成「在线」。

## 文件说明

| 文件 | 作用 |
|------|------|
| `server.js` | Express 服务：POST /api/chat，把大模型 SSE 流转成纯文本流给前端（打字机效果） |
| `package.json` | 仅 2 个依赖：express + dotenv |
| `.env.example` | 配置模板（复制为 .env 后填写） |

## 支持的模型（改 .env 即可切换）

DeepSeek / 通义千问 / Kimi / 智谱 GLM / OpenAI 等所有兼容 OpenAI Chat Completions 格式的服务。

## 安全要点

- 密钥只存在 `ai-server/.env`，前端代码里永远不出现
- `.env` 不要提交到 git、不要发给别人
- 只在本机使用时，接口默认开放 CORS 给本地网页；如需公网部署请自行加鉴权

## 常见问题

**Q：启动后前端还是显示「演示」？**
A：确认 `学习工作台.html` 里 `AI_CONFIG.apiUrl` 已填写并保存，然后刷新网页（Ctrl+F5）。

**Q：返回"未配置 LLM_API_KEY"？**
A：`ai-server` 目录下没有 `.env` 文件，或文件里没填 `LLM_API_KEY`。

**Q：想换端口？**
A：改 `.env` 里的 `PORT=3001`，前端 `apiUrl` 也同步改。
