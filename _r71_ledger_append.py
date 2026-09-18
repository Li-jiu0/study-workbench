# -*- coding: utf-8 -*-
# R71 台账记录：备份 -> 二进制追加 R68/R70 补记 + R71 新需求 -> 复验行尾与尾部
import shutil

P = r'D:\下载的文件\学习工作台\用户需求与决策总账.md'
BAK = r'D:\下载的文件\学习工作台\用户需求与决策总账.md.bak-pre-r68-20260917'

# 1) 备份
shutil.copyfile(P, BAK)

# 2) 校验备份为真·原样
raw0 = open(P, 'rb').read()
bak0 = open(BAK, 'rb').read()
assert raw0 == bak0, 'backup mismatch'
assert raw0.count(b'\r\n') == 638 and (raw0.count(b'\n') - raw0.count(b'\r\n')) == 0, 'source line-ending unexpected'

ADD = (
    "\r\n"
    "---\r\n"
    "\r\n"
    "## R68 备忘（补记 · 2026-09-17）\r\n"
    "\r\n"
    "**移动端 AI 对话框布局**：输入区单行化、控件缩小、隐藏圆环，4 连修 commits `64c7945`/`f748547`/`d7d8f76`/`98cdac0`。已随戳 `20260916R` 上线。\r\n"
    "\r\n"
    "## R70 备忘（补记 · 2026-09-17）\r\n"
    "\r\n"
    "1. **设置页连通性检测修复**：`ai-settings.html` 补载 `assets/ai-service.js`（根因=该页从未加载底座，`window.aiHealthCheck` 不存在 → 误报「当前环境不支持」）；新坑=script 清单插标签漏 `</script>` 会静默吞掉后续脚本，改完必须核对 count(<script)==count(</script>)（现 9/9）。commit `f34939d`。\r\n"
    "2. **APK 静态壳修复**：`android/build_apk.py` 曾用正则剔除各页 api.js 导致 673KB 无联网空壳 → 改二进制整页复制 + 资源白名单补全（api.js + AI 五件等）+ 打包期硬断言（入口页必须含 api.js+config.js 否则中止）；重打 versionCode 18 / versionName 1.17 / 87.3MB 完整包，apksigner 验证通过。**真机功能验收未做（唯一硬性遗留）**。\r\n"
    "\r\n"
    "## R71 备忘（2026-09-17 12:40 用户报，截图 2 张）\r\n"
    "\r\n"
    "**移动端「模型设置 → 模型列表」Tab 内容挤压，要求重设计为同页「模型说明」Tab 同款布局**\r\n"
    "\r\n"
    "- 现象（截图 1）：窄屏下模型列表卡片内容竖向堆叠挤压——模型名逐字折行（如 GLM-4.5-Flash 折成 3 行）、倍率徽章/状态徽章/星级/开关/操作按钮（编辑/检测/↑↓）全部纵向堆叠、「待检测·实测」等文字逐字折行，卡片超高、一屏只装得下 1~2 张卡。\r\n"
    "- 参照（截图 2）：同页「模型说明」Tab 布局正常——①标题行：模型名 + 倍率徽章 + 状态徽章同行；②标签行：平台 + 能力徽章；③明细行：星级/速度/说明 按「标签列 + 值列」对齐；④底部：模型 ID 灰字。信息密度高且不折行。\r\n"
    "- **用户要求**：把「模型列表」Tab 移动端卡片布局设计成与「模型说明」Tab 一致（信息同行排布、不再竖向挤压）；必须保留模型列表自身全部功能（点行选中 / 启用开关 / 当前使用高亮 / 编辑 / 检测 / 拖拽+↑↓排序 / 星级）。\r\n"
    "- 涉及文件（预估）：`assets/ai-settings.js`（LF，模型列表卡片渲染）、`ai-settings.html`（LF，卡片 CSS）；行尾铁律照旧，改前备份 `.bak-pre-r71-日期`。\r\n"
    "- 状态：**已记录，未开工**（等用户指令放行）。\r\n"
)

raw1 = raw0 + ADD.encode('utf-8')
open(P, 'wb').write(raw1)

# 3) 复验
raw2 = open(P, 'rb').read()
crlf = raw2.count(b'\r\n')
lone = raw2.count(b'\n') - raw2.count(b'\r\n')
lone_cr = raw2.count(b'\r') - raw2.count(b'\r\n')
out = []
out.append('bak=%s' % BAK)
out.append('bak_ok=true')
out.append('old_size=%d new_size=%d' % (len(raw0), len(raw2)))
out.append('CRLF=%d loneLF=%d loneCR=%d' % (crlf, lone, lone_cr))
out.append('R71_hits=%d' % raw2.count('R71'.encode('utf-8')))
out.append('R68_hits=%d R70_hits=%d' % (raw2.count(b'R68'), raw2.count(b'R70')))
tail = raw2[-200:].decode('utf-8', 'replace')
out.append('tail=%r' % tail)
open(r'D:\下载的文件\学习工作台\_r71_verify_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
