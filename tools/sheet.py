# Contact sheet of the four screenshots (2x2 at half size) for a quick look: python3 tools/sheet.py [out.jpg]
import sys
from pathlib import Path
from PIL import Image

shots = sorted(Path(__file__).resolve().parent.parent.joinpath('screenshots').glob('*.jpg'))[:4]
sheet = Image.new('RGB', (1280, 720))
for i, path in enumerate(shots):
    sheet.paste(Image.open(path).resize((640, 360)), ((i % 2) * 640, (i // 2) * 360))
sheet.save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/sheet.jpg', quality=85)
