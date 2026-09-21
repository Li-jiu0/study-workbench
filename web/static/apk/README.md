# web/static/apk —— APK 构建产物落点

本目录用于存放「检测更新」对外提供的安卓安装包（APK）。

## 为什么需要它
`server/routers/update.py` 的 `GET /api/app/version` 会按 `Root_Path` 推导物理路径：

    <Root>/web/static/apk/<apkFileName>

- 文件**存在** → 返回 `apkReady=true` 且 `apkUrl=http(s)://<host>/static/apk/<apkFileName>`
- 文件**不存在** → 返回 `apkReady=false`、`apkUrl=""` → 前端只能显示「安装包暂时不可用」

（2026-09-18 R87 实测：`version.json` 指向的 `星途-1.24.apk` 全盘不存在、本目录也不存在
→ 「检测更新」必然失败。本目录即为此补齐。）

## 命名约定
APK 文件名必须与 `server/routers/version.json` 的 `apkFileName` 字段一致，
默认约定为 `星途-<version>.apk`（如 `星途-1.25.apk`）。

- 版本真源：`server/routers/version.json`
- 三处同步：`python tools/bump_versions_safe.py --apply [--version X.Y --code N]`
- 一致性校验：`python tools/qa/check_version_consistency.py`

## 注意
- 构建 / 上传 APK 属**生产操作**，需用户授权后由主理人统一执行。
- 本目录下的 APK 为二进制产物；`.gitkeep` 仅用于占位，保证空目录可被纳管。
