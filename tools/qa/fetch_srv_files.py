import urllib.request,io,os,hashlib
base='http://110.42.134.62'
d=r'C:\Users\ATM\_srv'
os.makedirs(d,exist_ok=True)
files=['AI.html','assets/ai-config.js','assets/ai-service.js','assets/ai-page.js','assets/ai-presets.js','assets/config.js']
out=[]
for f in files:
    url=base+'/'+urllib.request.quote(f)
    try:
        r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'}),timeout=30)
        b=r.read()
        loc=os.path.join(d,f.replace('/','__'))
        open(loc,'wb').write(b)
        # 本地对比
        lp=os.path.join(r'D:\下载的文件\学习工作台',f.replace('/',os.sep))
        same='NOLOCAL'
        if os.path.exists(lp):
            lb=open(lp,'rb').read()
            same='SAME' if hashlib.md5(lb).hexdigest()==hashlib.md5(b).hexdigest() else 'DIFF(local=%d,srv=%d)'%(len(lb),len(b))
        out.append('%-28s srv=%-7d %s'%(f,len(b),same))
    except Exception as e:
        out.append('%-28s ERR %r'%(f,e))
io.open(r'C:\Users\ATM\_fetchsrv.txt','w',encoding='utf-8').write('\n'.join(out))
print('OK')
