/**
 * 学习工作台 · AI 后端中转服务
 * ---------------------------------------------------------------
 * 作用：
 *   1. 密钥安全：大模型 API Key 只存在本文件目录的 .env 中，前端永远拿不到；
 *   2. 流式转发：把大模型的 SSE 流转换成纯文本流吐给前端，实现打字机效果。
 *
 * 接口：
 *   POST /api/chat   body: { "message": "用户的问题" }
 *   成功：流式返回纯文本（前端逐字追加显示）
 *   失败：JSON { "error": "原因" }
 *
 * 兼容：任何 OpenAI Chat Completions 格式的服务
 *   （DeepSeek / 通义千问 / Kimi / 智谱 / OpenAI 等，改 .env 即可切换）
 */
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS：允许本地静态网页（file:// 打开时 Origin 为 null）调用
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== 密钥与模型配置（全部来自 .env，不写死在代码里）=====
const API_KEY = process.env.LLM_API_KEY; // 必填
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const PORT = process.env.PORT || 3000;

// 系统提示词：让AI扮演本工作台的学习助手
const SYSTEM_PROMPT =
  '你是「学习工作台」网页里内置的AI学习助手，服务对象是备考英语四六级、央国企笔试、求职面试的大学生。' +
  '回答要求：使用简体中文；结构化（分点）；简洁实用，不啰嗦；能给出可执行的行动建议。';

app.post('/api/chat', async (req, res) => {
  const message = (req.body && req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message 不能为空' });
  if (!API_KEY) {
    return res.status(500).json({ error: '未配置 LLM_API_KEY：请复制 .env.example 为 .env 并填入你的密钥' });
  }

  try {
    const upstream = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY // 密钥只在这里出现（服务端）
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        stream: true
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: '上游模型返回 ' + upstream.status + '：' + errText.slice(0, 200) });
    }

    // 以纯文本流返回，前端用 ReadableStream 逐字追加
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 最后一段可能不完整，留到下一轮
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          if (delta && delta.content) res.write(delta.content);
        } catch (e) { /* 忽略无法解析的行 */ }
      }
    }
    res.end();
  } catch (e) {
    res.status(500).json({ error: '中转失败：' + (e.message || e) });
  }
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', tip: 'POST /api/chat { message }' });
});

app.listen(PORT, () => {
  console.log('✅ AI后端已启动: http://localhost:' + PORT);
  console.log('   前端对接：把 学习工作台.html 里 AI_CONFIG.apiUrl 填为 http://localhost:' + PORT + '/api/chat');
  if (!API_KEY) console.log('⚠️ 尚未配置 LLM_API_KEY，请先复制 .env.example 为 .env 并填写密钥');
});
