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
