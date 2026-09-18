"""上传文件校验：用文件头（magic bytes）嗅探真实格式，不信任浏览器声明的 content-type。

防止：把伪装成 .png/.jpg 的 html / 脚本 / 其它文件传上来。
"""

# 可接受图片类型 → 落盘扩展名
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def detect_image_mime(head: bytes) -> str | None:
    """按魔数识别图片类型，识别不了返回 None。"""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "image/gif"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def ext_for(data: bytes) -> str | None:
    """返回经魔数校验后的扩展名；内容不是可接受的图片时返回 None。"""
    mime = detect_image_mime(data)
    return ALLOWED_TYPES.get(mime or "")


# ---------- 音频（A7 语音消息）：同样用魔数嗅探，不信任浏览器声明的 content-type ----------
# 可接受音频类型 → 落盘扩展名
AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
}


def detect_audio_mime(head: bytes) -> str | None:
    """按魔数识别音频类型（webm / ogg / mp4(m4a) / wav），识别不了返回 None。"""
    if head[:4] == b"\x1a\x45\xdf\xa3":                 # EBML 容器（webm / mkv）
        return "audio/webm"
    if head[:4] == b"OggS":                             # Ogg（ogg / opus）
        return "audio/ogg"
    if len(head) >= 12 and head[4:8] == b"ftyp":        # MP4 / M4A（ftyp box 在第 5-8 字节）
        return "audio/mp4"
    if head[:4] == b"RIFF" and len(head) >= 12 and head[8:12] == b"WAVE":  # WAV
        return "audio/wav"
    return None


def ext_for_audio(data: bytes) -> str | None:
    """返回经魔数校验后的音频扩展名；内容不是可接受的音频时返回 None。"""
    mime = detect_audio_mime(data[:64])
    return AUDIO_TYPES.get(mime or "")


# ---------- 视频（R88-M3 朋友圈本地上传）：同样用魔数嗅探，不信任浏览器声明的 content-type ----------
# 可接受视频类型 → 落盘扩展名
# 说明：与 AUDIO_TYPES 分开维护，避免音频/视频语义混用；识别不到一律返回 None（由调用方 400）。
VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}


def detect_video_mime(head: bytes) -> str | None:
    """按魔数识别视频类型（mp4 / webm），识别不了返回 None。

    - MP4 / MOV / M4V：ISO-BMFF，第 5-8 字节为 b"ftyp"（前 4 字节是 box 长度）
    - WebM / MKV：EBML 容器，前 4 字节 b"\x1a\x45\xdf\xa3"
    """
    if len(head) >= 12 and head[4:8] == b"ftyp":       # MP4 系（含 isom/mp42/qt 等 brand）
        return "video/mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":                 # EBML（webm / mkv）
        return "video/webm"
    return None


def ext_for_video(data: bytes) -> str | None:
    """返回经魔数校验后的视频扩展名；内容不是可接受的视频时返回 None。"""
    mime = detect_video_mime(data[:64])
    return VIDEO_TYPES.get(mime or "")


# ===========================================================================
# ---------- 通用文档（R88-M8 私聊「发送文件」）：魔数嗅探 + 危险扩展名黑名单 ----------
# 说明：这是「任意文件上传入口」，安全口径从严：
#   1) 先按「原始文件名的扩展名」过黑名单（可执行 / 可被服务端或浏览器解释的一律拒）；
#   2) 再按「文件头魔数」判定真实类型，只放行白名单内的容器格式；
#   3) 落盘扩展名一律取自魔数判定结果，**绝不使用用户原始文件名**。
# 与既有 ALLOWED_TYPES / AUDIO_TYPES / VIDEO_TYPES 并列维护，互不影响。
# ===========================================================================

# 可接受文档类型（魔数 key）→ 落盘扩展名
FILE_TYPES = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.rar": ".rar",
}

# 危险扩展名黑名单（小写、不含点）—— 一律拒，绝不放行。
# 覆盖三类风险：
#   · 可执行/系统级：exe bat cmd com scr msi sh ps1 dll so jar apk
#   · 服务端可解释（配置不当时可 RCE）：php php3 php4 php5 phtml jsp asp aspx py rb pl cgi
#   · 浏览器可解释（XSS / 钓鱼页 / 挂马）：html htm xhtml svg xml xsl js mjs wasm
DANGEROUS_EXTS = frozenset([
    "exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "dll", "so", "jar", "apk",
    "php", "php3", "php4", "php5", "phtml", "jsp", "asp", "aspx", "py", "rb", "pl", "cgi",
    "html", "htm", "xhtml", "svg", "xml", "xsl", "js", "mjs", "wasm",
])

# OOXML（docx/xlsx/pptx 都是 ZIP 容器）在包内必须出现的特征串。
# 采用「子串探测」而非解压：既避免 zip-bomb 风险，也避免为一次校验解压整个包。
_OOXML_MARKERS = (
    ("word/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("xl/", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("ppt/", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
)
_OOXML_CT = b"[Content_Types].xml"


def filename_ext(filename: str) -> str:
    """取原始文件名的扩展名（小写、不含点）。无扩展名返回空串。

    ⚠️ 仅用于「黑名单判定」，绝不用于落盘命名。
    """
    name = (filename or "")
    name = name.replace("\\", "/").split("/")[-1]        # 去路径（含 Windows 反斜杠）
    name = name.replace("\x00", "")                        # 去空字节
    if "." not in name:
        return ""
    ext = name.rsplit(".", 1)[-1].strip().lower()
    return ext


def is_dangerous_ext(filename: str) -> bool:
    """原始文件名扩展名是否命中危险黑名单。"""
    return filename_ext(filename) in DANGEROUS_EXTS


def detect_file_mime(head: bytes) -> str | None:
    """按魔数识别文档类型（pdf / zip / docx / xlsx / pptx / rar），识别不了返回 None。

    校验深度说明：
      - PDF：`%PDF-` 头即可（PDF 无内嵌脚本执行面）。
      - RAR：`Rar!\x1a\x07`（v4/v5 共用前 7 字节前缀）。
      - ZIP：`PK\x03\x04`。若同时探测到 OOXML 特征串（[Content_Types].xml + word/xl/ppt），
        则细分为 docx/xlsx/pptx；否则一律按通用 zip 处理。
        → 这样「把普通 zip 改名成 .docx」不会骗过判定（无 OOXML 特征 → 仍判 zip），
          「把 docx 改名成 .zip」也只是降级为 zip（安全，不会误拒）。
    """
    if head[:5] == b"%PDF-":
        return "application/pdf"
    if head[:6] == b"Rar!\x1a\x07":
        return "application/vnd.rar"
    if head[:4] == b"PK\x03\x04":
        # ZIP 容器：进一步区分 OOXML 三兄弟
        if _OOXML_CT in head:
            for marker, mime in _OOXML_MARKERS:
                if marker.encode("ascii") in head:
                    return mime
        return "application/zip"
    return None


def ext_for_file(data: bytes, filename: str = "") -> str | None:
    """返回经「黑名单 + 魔数」双重校验后的落盘扩展名；不通过返回 None。

    @param data     文件字节（内部只看前若干字节）
    @param filename 用户原始文件名（仅用于黑名单判定，不参与落盘命名）
    @returns        ".pdf" / ".zip" / ".docx" / ".xlsx" / ".pptx" / ".rar"，或 None
    """
    if is_dangerous_ext(filename):
        return None
    mime = detect_file_mime(data[:4096])
    return FILE_TYPES.get(mime or "")

