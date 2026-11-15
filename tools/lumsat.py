# Floor-box luminance (x 25-60%, y 75-95%), whole-frame mean saturation and mid-frame (20-80%) luminance
# SD of the screenshots:
# python3 tools/lumsat.py [dir]
import sys
from pathlib import Path
from PIL import Image, ImageStat

d = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'screenshots'
for f in sorted(d.glob('*.jpg')):
    im = Image.open(f).convert('RGB'); w, h = im.size
    floor = ImageStat.Stat(im.crop((int(w * .25), int(h * .75), int(w * .6), int(h * .95))).convert('L')).mean[0]
    sat = ImageStat.Stat(im.convert('HSV').split()[1]).mean[0] / 255
    sd = ImageStat.Stat(im.crop((int(w * .2), int(h * .2), int(w * .8), int(h * .8))).convert('L')).stddev[0]
    print(f'{f.name:20s} floor {floor:5.1f}  sat {sat:.2f}  mid SD {sd:4.1f}')
