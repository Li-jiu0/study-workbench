# -*- coding: utf-8 -*-
"""测试 Edge TTS（微软免费神经语音，无 Key）协议是否可用。
参考 edge-tts 项目：wss://speech.platform.bing.com 收音频流。
"""
import asyncio, base64, hashlib, json, uuid
from datetime import datetime, timedelta

TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
WINDOWS_EPOCH = datetime(1601, 1, 1)

def generate_sec_ms_gec() -> str:
    # 新版 edge-tts 算法：sha256(TrustedClientToken + "WINDOWS:edge-synthetics" + epoch秒数)
    now = datetime.utcnow()
    seconds = int((now - WINDOWS_EPOCH).total_seconds())
    digest = hashlib.sha256((TRUSTED_CLIENT_TOKEN + "WINDOWS:edge-synthetics" + str(seconds)).encode()).digest()
    return base64.b64encode(digest).decode()

def rfc1123(now):
    # 服务端要求 X-Timestamp 格式
    return now.strftime('%a, %d %b %Y %H:%M:%S GMT')

async def main():
    gec = generate_sec_ms_gec()
    conn_id = str(uuid.uuid4())
    url = ("wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
           "?TrustedClientToken=" + TRUSTED_CLIENT_TOKEN +
           "&Sec-MS-GEC=" + gec +
           "&Sec-MS-GEC-Version=1-130.0.2849.68" +
           "&ConnectionId=" + conn_id)
    print("URL:", url[:120] + "...")
    try:
        import websockets
        headers = {
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
            "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        }
        async with websockets.connect(url, additional_headers=list(headers.items())) as ws:
            print("WebSocket connected OK")
            # 1) speech.config
            cfg = {"context": {"synthesis": {"audio": {"metadataoptions": {"sentenceBoundaryEnabled": "false", "wordBoundaryEnabled": "true"},
                                                       "outputFormat": "audio-24khz-48kbitrate-mono-mp3"}}}} 
            await ws.send("X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\nX-RequestId:{}\r\n\r\n".format(rfc1123(datetime.utcnow()), conn_id) + json.dumps(cfg))
            # 2) synthesis.context
            ctx = {"context": {"synthesis": {"audio": {"metadataoptions": {"sentenceBoundaryEnabled": "false", "wordBoundaryEnabled": "false"},
                                                       "outputFormat": "audio-24khz-48kbitrate-mono-mp3"}}}}
            await ws.send("X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:synthesis.context\r\nX-RequestId:{}\r\n\r\n".format(rfc1123(datetime.utcnow()), conn_id) + json.dumps(ctx))
            # 3) ssml
            text = "Hello, this is a test of the edge text to speech service."
            ssml = ("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
                    "<voice name='en-US-AriaNeural'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>" + text + "</prosody></voice></speak>")
            await ws.send("X-Timestamp:{}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\nX-RequestId:{}\r\n\r\n".format(rfc1123(datetime.utcnow()), conn_id) + ssml)
            # 收数据
            audio_chunks = []
            done = False
            import time
            start = time.time()
            while not done and time.time() - start < 15:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2)
                except asyncio.TimeoutError:
                    print("  (timeout waiting data)")
                    break
                if isinstance(msg, bytes):
                    # 二进制帧: 2字节头长 + header + 4字节长 + audio
                    i = 0
                    while i + 6 <= len(msg):
                        hl = int.from_bytes(msg[i:i+2], 'big')
                        header = msg[i+2:i+2+hl]
                        try:
                            hjson = json.loads(header)
                            path = hjson.get('path', '')
                        except Exception:
                            path = ''
                        i += 2 + hl
                        if i + 4 > len(msg): break
                        alen = int.from_bytes(msg[i:i+4], 'big')
                        i += 4
                        audio = msg[i:i+alen]
                        i += alen
                        if path == 'audio':
                            audio_chunks.append(audio)
                        elif path == 'turn.end':
                            done = True
                        # print(f"  frame: path={path} audio={len(audio)}B")
                else:
                    txt = msg
                    if 'turn.end' in str(txt):
                        done = True
            total = sum(len(c) for c in audio_chunks)
            print("Audio total:", total, "bytes, done =", done)
            if audio_chunks:
                out = r'D:\下载的文件\学习工作台\tools\edge_tts_test.mp3'
                with open(out, 'wb') as f:
                    for c in audio_chunks:
                        f.write(c)
                print("Saved:", out)
    except Exception as e:
        print("FAIL:", type(e).__name__, e)

asyncio.run(main())
