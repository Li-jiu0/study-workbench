import urllib.request, os, ssl

out_dir = r"D:\下载的文件\学习工作台\tencent_2025_interim"
os.makedirs(out_dir, exist_ok=True)

urls = {
    "tencent_2025_interim_en.pdf": "https://static.www.tencent.com/uploads/2025/08/26/d1d2fb988f5e910e254b3abb41dadb0f.pdf",
    "tencent_2025_interim_zh.pdf": "https://static.www.tencent.com/uploads/2025/08/26/00175ef813605d01873b4a533131aed0.pdf",
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for name, url in urls.items():
    dest = os.path.join(out_dir, name)
    print(f"Downloading {name} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    print(f"  -> {len(data)} bytes -> {dest}")

print("DONE")
