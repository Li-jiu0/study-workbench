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
