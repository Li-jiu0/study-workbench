# 火山方舟模型ID配置错误修复说明

> 日期：2026-09-17
> 问题：模型设置页面中多个火山方舟模型显示"失败"，经测试是模型ID配置错误导致的404

---

## 一、失败原因总结

所有显示"失败"的模型，**不是模型不能用，而是模型ID写错了**，调用时返回404（模型不存在）。

主要两类错误：
1. **图片生成模型少了 `doubao-` 前缀**
2. **Code模型少了日期后缀**

---

## 二、需要修正的模型ID（4个）

### 2.1 图片生成模型（3个）

| 显示名称 | 当前错误ID | 正确ID | 错误原因 | 测试状态 |
|---------|-----------|--------|---------|---------|
| Seedream-4.0 | `seedream-4-0-20260415` | `doubao-seedream-4-0-20260415` | 少了 `doubao-` 前缀 | ✅ 已验证可用 |
| Seedream-4.0-Fast | `seedream-4-0-250828` | `doubao-seedream-4-0-250828` | 少了 `doubao-` 前缀 | ✅ 已验证可用（约4秒） |
| Seedream-5-Pro | `seedream-5-0-pro-260628` | `doubao-seedream-5-0-pro-260628` | 少了 `doubao-` 前缀 | ✅ 已验证可用（约35秒） |

### 2.2 代码模型（1个）

| 显示名称 | 当前错误ID | 正确ID | 错误原因 | 测试状态 |
|---------|-----------|--------|---------|---------|
| Doubao-Code-Preview | `doubao-seed-2-0-code-preview` | `doubao-seed-2-0-code-preview-260215` | 少了日期后缀 `-260215` | ✅ 已验证可用（4.5秒） |

---

## 三、图片生成模型API说明

图片生成模型用的不是 `chat/completions` 接口，是 `images/generations` 接口：

- **端点**：`https://ark.cn-beijing.volces.com/api/v3/images/generations`
- **请求体**：
```json
{
  "model": "doubao-seedream-4-0-250828",
  "prompt": "图片描述文字",
  "size": "1024x1024",
  "response_format": "url"
}
```
- **响应**：返回 `data[0].url` 图片地址
- **注意**：Seedream-5-Pro 生成较慢（约35秒），前端超时时间建议设为60秒以上

---

## 四、操作要求

1. 在 `ai-config.js` 中，把上述4个模型的ID修正为正确ID
2. 修正后点击"检测"按钮，应该显示"成功"而不是"失败"
3. 图片生成模型的调用逻辑要单独处理，不能和文本模型共用 `chat/completions` 接口
4. 修正完成后，把所有模型重新检测一遍，确保没有其他404

---

## 五、验证方法

修正后可以用以下命令验证（替换模型ID）：

```bash
# 文本模型验证
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Authorization: Bearer ark-e725e1de-7d62-4b4a-aebb-a5def4f05ba7-c22bf" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seed-2-0-code-preview-260215","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'

# 图片生成模型验证
curl https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer ark-e725e1de-7d62-4b4a-aebb-a5def4f05ba7-c22bf" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-4-0-250828","prompt":"a red apple","size":"1024x1024","response_format":"url"}'
```
