# -*- coding: utf-8 -*-
"""为 common.css 追加「AI 伙伴（多角色模式）」样式"""
import io

path = r'D:\下载的文件\学习工作台\assets\common.css'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

css = """

/* ===== AI 伙伴（多角色模式）：伙伴条 + 角色选择弹窗 ===== */
.ai-partner-bar { display: flex; align-items: center; padding: 10px 12px 2px; }
.ai-partner-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb); border-radius: 20px; padding: 4px 12px 4px 6px;
  cursor: pointer; font-size: 13px; box-shadow: 0 1px 4px rgba(0,0,0,.06); transition: transform .15s; }
.ai-partner-chip:active { transform: scale(.96); }
.ai-partner-emoji { font-size: 18px; line-height: 1; }
.ai-partner-name { font-weight: 600; }
.ai-partner-tag { font-size: 11px; border-radius: 10px; padding: 1px 7px; margin-left: 2px; }
.ai-partner-switch { font-size: 11px; color: var(--primary, #5B8DEF); margin-left: 2px; white-space: nowrap; }

.ai-partner-picker { position: fixed; inset: 0; z-index: 99999; display: none; }
.ai-partner-picker.open { display: block; }
.ai-partner-picker-mask { position: absolute; inset: 0; background: rgba(0,0,0,.45); }
.ai-partner-picker-box { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: min(380px, 90vw); max-height: 72vh; background: var(--bg, #fff); border-radius: 16px;
  overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,.25); }
.ai-partner-picker-head { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border, #eee); flex: 0 0 auto; }
.ai-partner-picker-title { font-weight: 700; font-size: 15px; }
.ai-partner-list { overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; }
.ai-partner-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px;
  border: 1.5px solid var(--border, #eee); cursor: pointer; transition: all .15s; background: var(--card-bg, #fff); }
.ai-partner-card:active { transform: scale(.98); }
.ai-partner-card.active { border-color: var(--pc, #5B8DEF); background: linear-gradient(135deg, var(--pbg, #eef4ff), var(--card-bg, #fff)); }
.ai-partner-card-emoji { font-size: 26px; width: 46px; height: 46px; display: flex; align-items: center;
  justify-content: center; border-radius: 12px; flex: 0 0 auto; }
.ai-partner-card-info { flex: 1 1 auto; min-width: 0; }
.ai-partner-card-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.ai-partner-card-tag { font-size: 10px; border-radius: 8px; padding: 1px 6px; }
.ai-partner-card-desc { font-size: 11.5px; color: var(--text-secondary, #888); margin-top: 3px; line-height: 1.45; }
.ai-partner-card-check { margin-left: auto; font-size: 11px; font-weight: 600; white-space: nowrap; flex: 0 0 auto; }
.ai-partner-card-use { margin-left: auto; font-size: 11px; border: 1px solid currentColor; border-radius: 10px;
  padding: 2px 9px; white-space: nowrap; flex: 0 0 auto; }

/* 窄屏适配 */
@media (max-width: 480px) {
  .ai-partner-picker-box { width: 92vw; }
  .ai-partner-card-desc { font-size: 11px; }
}
"""

with io.open(path, 'a', encoding='utf-8') as f:
    f.write(css)
print('OK: common.css appended, new size =', len(src) + len(css))
