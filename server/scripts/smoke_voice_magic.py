# -*- coding: utf-8 -*-
"""T02 隔离自测：filecheck 音频魔数（纯 stdlib，无需第三方依赖）。
说明：本机 server/.venv 为残缺安装（pydantic/sqlalchemy/jwt/dotenv 均不完整），
故后端集成测试只能在服务器进行；此处仅验证不依赖第三方的音频魔数判定。"""
import os
import sys

# 使 filecheck（位于 server/）可被导入：加入上一级目录
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import filecheck

fails = 0


def ck(label, cond, detail=""):
    global fails
    print(("  OK  " if cond else "  FAIL") + " " + label + (("  -> " + str(detail)) if detail else ""))
    if not cond:
        fails += 1


webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 60
ogg = b"OggS" + b"\x00" * 60
mp4 = b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 52
wav = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 52
txt = b"hello world this is not audio"
png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 52

ck("webm 魔数 → .webm", filecheck.ext_for_audio(webm) == ".webm", filecheck.ext_for_audio(webm))
ck("ogg 魔数 → .ogg", filecheck.ext_for_audio(ogg) == ".ogg", filecheck.ext_for_audio(ogg))
ck("mp4(m4a) 魔数 → .m4a", filecheck.ext_for_audio(mp4) == ".m4a", filecheck.ext_for_audio(mp4))
ck("wav 魔数 → .wav", filecheck.ext_for_audio(wav) == ".wav", filecheck.ext_for_audio(wav))
ck("纯文本 → None（拒绝）", filecheck.ext_for_audio(txt) is None, filecheck.ext_for_audio(txt))
ck("PNG 冒充音频 → None（拒绝）", filecheck.ext_for_audio(png) is None, filecheck.ext_for_audio(png))
ck("空字节 → None", filecheck.ext_for_audio(b"") is None, filecheck.ext_for_audio(b""))
ck("图片校验不受影响 ext_for(png)=.png", filecheck.ext_for(png) == ".png", filecheck.ext_for(png))

print("\nT02 隔离自测（音频魔数）：失败 %d 项" % fails)
sys.exit(1 if fails else 0)
