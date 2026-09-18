from PIL import Image
import os, glob

outdir = r'D:/下载的文件/学习工作台/_w2t1_img'
pairs = [(6,7),(8,9),(10,11),(14,15),(16,17)]
res = []
for c, a in pairs:
    cfiles = glob.glob(os.path.join(outdir, 'c_obj%d_*.jpg' % c)) + glob.glob(os.path.join(outdir, 'c_obj%d_*.ppm' % c))
    afiles = glob.glob(os.path.join(outdir, 'a_obj%d_*.pgm' % a))
    if not cfiles or not afiles:
        res.append('pair %d/%d missing' % (c, a))
        continue
    img = Image.open(cfiles[0]).convert('RGB')
    alpha = Image.open(afiles[0]).convert('L')
    if img.size != alpha.size:
        alpha = alpha.resize(img.size)
    rgba = img.convert('RGBA')
    rgba.putalpha(alpha)
    # composite on white
    bg = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    out = Image.alpha_composite(bg, rgba).convert('RGB')
    fn = os.path.join(outdir, 'final_obj%d.png' % c)
    out.save(fn)
    res.append('%s %s' % (fn, out.size))

open(r'D:/下载的文件/学习工作台/_w2t1_final.txt', 'w', encoding='utf-8').write('\n'.join(res))
