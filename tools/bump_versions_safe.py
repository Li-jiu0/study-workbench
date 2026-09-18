# -*- coding: utf-8 -*-
"""星途 · 版本戳「四处同步」bump（server/routers/version.json 为唯一真源）。

背景（2026-09-18 R87 / T05）
--------------------------------------------------------------------
线上「检测更新」失败的真实根因：版本号三处不一致 + APK 产物缺失。
    · server/routers/version.json    version=1.24  versionCode=25  apkFileName=星途-1.24.apk
    · android/AndroidManifest.xml    versionName=1.23  versionCode=24
    · 磁盘 APK 内部                    1.22
version.json 指向的「星途-1.24.apk」全盘不存在 → GET /api/app/version 里
apkReady=false、apkUrl="" → 前端只能显示「安装包暂时不可用」。

本脚本把「版本号」收敛为单一真源，一次操作同步四处：
    1) server/routers/version.json  —— version / versionCode / apkFileName（真源，先写）
    2) android/AndroidManifest.xml   —— versionName / versionCode（由真源派生，与真源对齐）
    3) assets/xt-update.js           —— CURRENT_VERSION 常量（前端「当前版本」展示，
                                        由真源派生；WebView 读不到 manifest，这里就是前端唯一来源）
    4) APK 文件名                     —— apkFileName 约定的物理产物
                                        <Root>/web/static/apk/<apkFileName>

用法
--------------------------------------------------------------------
    # 预演（默认行为，绝不写盘）：逐字段列出「改前 -> 改后」
    python tools/bump_versions_safe.py --dry-run
    python tools/bump_versions_safe.py --dry-run --version 1.25 --code 26

    # 真正写入（必须显式 --apply；且不能与 --dry-run 同用）
    python tools/bump_versions_safe.py --apply --version 1.25 --code 26
    python tools/bump_versions_safe.py --apply --bump            # 自动 patch+1 / versionCode+1

安全设计
--------------------------------------------------------------------
    · 幂等：目标值与现值相同的字段不写（无改动即不落盘）。
    · 失败不写半成品：三处全部计算成功后才落盘；任一写盘异常即回滚已写文件。
    · 二进制读写：open(p,'rb') 读 → 替换 → open(p,'wb') 写，绝不改行尾
      （version.json = LF；AndroidManifest.xml = CRLF；均以字节替换保原样）。
    · 默认 dry-run：不加 --apply 一律不写盘，杜绝误 bump。
    · 只改这三处；不碰缓存版本号（assets/*.js? v=）——那是另一套资产缓存机制。
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional, Tuple

# 项目根：本文件位于 <Root>/tools/ 之下
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VERSION_JSON = os.path.join(ROOT, "server", "routers", "version.json")
MANIFEST_XML = os.path.join(ROOT, "android", "AndroidManifest.xml")
XT_UPDATE_JS = os.path.join(ROOT, "assets", "xt-update.js")
APK_DIR = os.path.join(ROOT, "web", "static", "apk")

# ---- version.json 顶层字段 ----
# 注意：changelog 数组内的每个条目也含 "version" 键，故一律只替换「首个」匹配
# （顶层 version 出现在文件开头，changelog 在其后）。
RE_JSON_VERSION = re.compile(rb'("version"\s*:\s*")([^"]*)(")')
RE_JSON_CODE = re.compile(rb'("versionCode"\s*:\s*)(\d+)')
RE_JSON_APK = re.compile(rb'("apkFileName"\s*:\s*")([^"]*)(")')

# ---- AndroidManifest.xml ----
RE_XML_NAME = re.compile(rb'(android:versionName=")([^"]*)(")')
RE_XML_CODE = re.compile(rb'(android:versionCode=")(\d+)(")')

# ---- assets/xt-update.js（LF）：var CURRENT_VERSION = '1.23'; ----
RE_JS_VERSION = re.compile(rb"(\bCURRENT_VERSION\s*=\s*')([^']*)(')")


# ======================================================================
# 基础 IO（二进制，绝不改行尾）
# ======================================================================
def _read(path: str) -> bytes:
    with open(path, "rb") as fh:
        return fh.read()


def _write(path: str, data: bytes) -> None:
    with open(path, "wb") as fh:
        fh.write(data)


# ======================================================================
# 正则提取 / 首个替换
# ======================================================================
def _first_str(pattern: "re.Pattern[bytes]", data: bytes) -> Optional[str]:
    m = pattern.search(data)
    return m.group(2).decode("utf-8") if m else None


def _set_str(pattern: "re.Pattern[bytes]", new_val: str, data: bytes) -> Tuple[bytes, bool]:
    """替换首个匹配的字符串值，保留前缀与结尾引号，返回 (新字节, 是否变化)。"""
    enc = new_val.encode("utf-8")

    def _rep(m: "re.Match[bytes]") -> bytes:
        return m.group(1) + enc + m.group(3)

    new_data, n = pattern.subn(_rep, data, count=1)
    return new_data, (n > 0 and new_data != data)


def _set_int(pattern: "re.Pattern[bytes]", new_val: int, data: bytes) -> Tuple[bytes, bool]:
    """替换首个匹配的整数值，保留前缀，返回 (新字节, 是否变化)。"""
    enc = str(int(new_val)).encode("ascii")

    def _rep(m: "re.Match[bytes]") -> bytes:
        return m.group(1) + enc

    new_data, n = pattern.subn(_rep, data, count=1)
    return new_data, (n > 0 and new_data != data)


# ======================================================================
# 版本号处理
# ======================================================================
def _parse_parts(v: str) -> list:
    parts = []
    for seg in str(v or "").split("."):
        try:
            parts.append(int(seg))
        except ValueError:
            parts.append(0)
    return parts


def _bump_patch(v: str) -> str:
    """末位 +1：1.24 -> 1.25；1.24.0 -> 1.24.1；1 -> 1.1。"""
    parts = _parse_parts(v)
    if not parts:
        parts = [1, 0]
    if len(parts) < 2:
        parts.append(0)
    parts[-1] += 1
    return ".".join(str(x) for x in parts)


def _load_current() -> dict:
    vj = _read(VERSION_JSON)
    xml = _read(MANIFEST_XML)
    js = _read(XT_UPDATE_JS)
    code_str = _first_str(RE_JSON_CODE, vj) or "0"
    xml_code_str = _first_str(RE_XML_CODE, xml) or "0"
    try:
        json_code = int(code_str)
    except ValueError:
        json_code = 0
    try:
        xml_code = int(xml_code_str)
    except ValueError:
        xml_code = 0
    return {
        "json_version": _first_str(RE_JSON_VERSION, vj),
        "json_code": json_code,
        "json_apk": _first_str(RE_JSON_APK, vj),
        "xml_name": _first_str(RE_XML_NAME, xml),
        "xml_code": xml_code,
        "js_version": _first_str(RE_JS_VERSION, js),
    }


def _compute_target(cur: dict, args: argparse.Namespace) -> Tuple[str, int, str]:
    if args.version:
        new_version = str(args.version).strip()
    elif args.bump:
        new_version = _bump_patch(cur["json_version"] or "1.0")
    else:
        new_version = cur["json_version"]

    if args.code is not None:
        new_code = int(args.code)
    elif args.bump:
        new_code = cur["json_code"] + 1
    else:
        new_code = cur["json_code"]

    if args.apk:
        new_apk = str(args.apk).strip()
    elif new_version != cur["json_version"]:
        new_apk = "星途-%s.apk" % new_version
    else:
        new_apk = cur["json_apk"]
    return new_version, new_code, new_apk


def _maybe_rename_apk(old_apk: Optional[str], new_apk: Optional[str],
                      dry_run: bool, do_rename: bool) -> Optional[str]:
    """把已存在的旧名 APK 物理文件重命名为新名（可选；默认不做）。"""
    if not do_rename or not old_apk or not new_apk or old_apk == new_apk:
        return None
    src = os.path.join(APK_DIR, old_apk)
    dst = os.path.join(APK_DIR, new_apk)
    if not os.path.isfile(src):
        return None
    if os.path.exists(dst):
        return "跳过重命名：目标文件已存在 %s" % new_apk
    if not dry_run:
        os.replace(src, dst)
    return "%s -> %s" % (old_apk, new_apk)


# ======================================================================
# 主流程
# ======================================================================
def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="bump_versions_safe.py",
        description="星途版本戳三处同步 bump（version.json 为唯一真源）。默认 dry-run。",
    )
    p.add_argument("--version", help="目标 versionName，如 1.25")
    p.add_argument("--code", type=int, help="目标 versionCode，如 26")
    p.add_argument("--apk", help="目标 APK 文件名（缺省按 version 派生 星途-<version>.apk）")
    p.add_argument("--bump", action="store_true",
                   help="自动递增：version 末位 +1 且 versionCode +1")
    p.add_argument("--apply", action="store_true",
                   help="真正写盘（缺省不写；不加本参数一律只看不写）")
    p.add_argument("--dry-run", action="store_true",
                   help="只预演不写盘（默认行为，显式给亦可）")
    p.add_argument("--rename-apk", action="store_true",
                   help="同时把旧名 APK 物理文件重命名为新名（若存在）")
    return p


def main(argv: Optional[list] = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.apply and args.dry_run:
        print("错误：--apply 与 --dry-run 不能同时使用。")
        return 2

    # 缺省动作：无任何版本参数时，默认自动 patch bump（便于 --dry-run 直接预演）
    if not args.version and args.code is None and not args.bump:
        args.bump = True

    for path in (VERSION_JSON, MANIFEST_XML, XT_UPDATE_JS):
        if not os.path.isfile(path):
            print("错误：找不到必需文件 %s" % path)
            return 2

    dry_run = not args.apply
    cur = _load_current()
    new_version, new_code, new_apk = _compute_target(cur, args)

    mode_txt = "dry-run（不写盘）" if dry_run else "apply（写盘）"
    print("=== 星途版本戳四处同步 bump ===")
    print("模式: %s" % mode_txt)
    print("目标: version=%s  versionCode=%s  apkFileName=%s"
          % (new_version, new_code, new_apk))
    print("")

    # ---- 计算四处改动（先在内存里算好，全部成功才落盘）----
    vj = _read(VERSION_JSON)
    xml = _read(MANIFEST_XML)
    js = _read(XT_UPDATE_JS)

    vj2, c1 = _set_str(RE_JSON_VERSION, new_version, vj)
    vj2, c2 = _set_int(RE_JSON_CODE, new_code, vj2)
    vj2, c3 = _set_str(RE_JSON_APK, new_apk, vj2)

    xml2, c4 = _set_str(RE_XML_NAME, new_version, xml)
    xml2, c5 = _set_int(RE_XML_CODE, new_code, xml2)

    js2, c6 = _set_str(RE_JS_VERSION, new_version, js)

    rows = [
        ("server/routers/version.json", "version", cur["json_version"], new_version, c1),
        ("server/routers/version.json", "versionCode", str(cur["json_code"]), str(new_code), c2),
        ("server/routers/version.json", "apkFileName", cur["json_apk"], new_apk, c3),
        ("android/AndroidManifest.xml", "versionName", cur["xml_name"], new_version, c4),
        ("android/AndroidManifest.xml", "versionCode", str(cur["xml_code"]), str(new_code), c5),
        ("assets/xt-update.js", "CURRENT_VERSION", cur["js_version"], new_version, c6),
    ]
    for src, field, old, new, changed in rows:
        if changed:
            print("[改动]   %-30s %-12s %s  ->  %s" % (src, field, old, new))
        else:
            print("[无改动] %-30s %-12s %s" % (src, field, old))

    # ---- 落盘（带回滚）----
    to_write = []
    if c1 or c2 or c3:
        to_write.append((VERSION_JSON, vj2, vj))
    if c4 or c5:
        to_write.append((MANIFEST_XML, xml2, xml))
    if c6:
        to_write.append((XT_UPDATE_JS, js2, js))

    if dry_run:
        print("")
        print("[dry-run] 未写盘。去掉 --dry-run 并加 --apply 才会真正生效。")
    elif to_write:
        done = []
        try:
            for path, newdata, olddata in to_write:
                _write(path, newdata)
                done.append((path, olddata))
        except OSError as exc:
            for path, olddata in done:
                try:
                    _write(path, olddata)
                except OSError:
                    pass
            print("写盘失败，已回滚：%s" % exc)
            return 3
        print("")
        print("已写入 %d 个文件。" % len(to_write))
    else:
        print("")
        print("无需写入：三处已一致（幂等）。")

    # ---- APK 产物提示 ----
    rename_msg = _maybe_rename_apk(cur["json_apk"], new_apk, dry_run, args.rename_apk)
    if rename_msg:
        print("[APK] 重命名: %s" % rename_msg)

    apk_expected = os.path.join(APK_DIR, new_apk) if new_apk else ""
    apk_exists = bool(apk_expected) and os.path.isfile(apk_expected)
    print("")
    print("[APK] 约定产物: web/static/apk/%s  (当前存在: %s)"
          % (new_apk or "<未命名>", "是" if apk_exists else "否"))
    if not apk_exists:
        print("[提示] 请把构建好的 APK 放到上述路径；构建 / 上传属生产操作，需用户授权。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
