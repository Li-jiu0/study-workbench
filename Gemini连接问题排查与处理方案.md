# Gemini API 连接问题排查与处理方案

> 日期：2026-09-17
> 问题：本地测试 Gemini API 可正常连通，但 workbuddy 环境连接不上

---

## 一、问题说明

本地测试结果：
- ✅ 网络连通正常（`generativelanguage.googleapis.com` 可访问，耗时2.2秒）
- ✅ `gemini-3.5-flash-lite` 模型可用（1.7秒响应）
- ⚠️ `gemini-3.5-flash` 429限流（免费额度限制）

但 workbuddy 环境连接不上 Gemini，大概率是**服务器网络环境无法直连 Google**（国内服务器普遍无法访问 googleapis.com）。

---

## 二、正确的 API 调用方式

### 2.1 端点格式

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
```

**注意**：Gemini 的 key 是通过 URL 参数传递的，**不是** Authorization header。

### 2.2 请求头

```
Content-Type: application/json
```

不需要 `Authorization: Bearer` 头。

### 2.3 请求体

```json
{
  "contents": [
    {
      "parts": [
        { "text": "用户问题" }
      ]
    }
  ]
}
```

### 2.4 响应解析

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "AI回复内容" }
        ]
      }
    }
  ]
}
```

取 `candidates[0].content.parts[0].text`。

### 2.5 API Key

```
***REMOVED-BY-R2C***
```

### 2.6 可用模型

| 模型ID | 状态 | 说明 |
|--------|------|------|
| `gemini-3.5-flash-lite` | ✅ 可用 | 轻量快速，当前主力 |
| `gemini-3.5-flash` | ⚠️ 429限流 | 标准版，时好时坏 |

---

## 三、连接不上的原因和处理方案

### 原因：服务器网络无法访问 Google

国内服务器（包括云服务器）通常无法直连 `googleapis.com`，会出现超时或连接拒绝。

### 方案一：自动降级（推荐）

在 ai-service.js 中增加逻辑：
1. 调用 Gemini 前先做一次连通性检测（超时5秒）
2. 连不上时，自动降级到国内模型（火山方舟 → 智谱 → 百度千帆）
3. 降级时在界面提示"当前网络无法访问Gemini，已自动切换到国内模型"
4. 不要反复重试，避免用户等待过久

### 方案二：走代理中转

如果用户配置了中转地址（海外平台代理访问设置中的 relay 模式），则：
- 请求地址 = 中转地址前缀 + encodeURIComponent(目标完整URL)
- body 和 headers 原样透传
- 例如：`https://my-worker.workers.dev/?url=https%3A%2F%2Fgenerativelanguage.googleapis.com%2Fv1beta%2Fmodels%2Fgemini-3.5-flash-lite%3AgenerateContent%3Fkey%3Dxxx`

### 方案三：标记为需梯子

在模型设置页面，给 Gemini 模型加上"需梯子"标签：
- 有梯子的用户可以正常使用
- 没梯子的用户看到标签就知道为什么连不上
- 调用失败时提示"Gemini需要梯子访问，请检查网络或切换到国内模型"

---

## 四、超时设置

- 连通性检测超时：**5秒**
- 正常调用超时：**30秒**
- 超时后立即降级，不要等待

---

## 五、操作要求

1. 检查 ai-config.js 中 Gemini 的 apiUrl 是否正确（应该是 `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`）
2. 检查调用时 key 是否通过 URL 参数传递，而不是 Authorization header
3. 增加 Gemini 调用失败时的自动降级逻辑
4. 模型设置页面给 Gemini 模型加"需梯子"标签
5. 调用失败时给用户明确提示，不要静默失败
