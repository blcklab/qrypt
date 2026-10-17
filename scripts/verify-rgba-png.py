#!/usr/bin/env python3
"""Decode actual Qrypt M11 RGBA PNG bytes independently with Pillow and OpenCV."""
import io
import subprocess
from pathlib import Path
import cv2
from PIL import Image

root = Path(__file__).resolve().parent.parent
js = r"""
import { qrypt } from './.m11-check/index.js';
import { toPNG } from './.m11-check/png.js';
const texts = ['https://example.com', 'Hello, Qrypt!', '世界 hello', 'Qrypt π 3.14'];
for (let i=0; i<texts.length; i++) {
  const bytes = toPNG(qrypt(texts[i]), { scale: 6, margin: 4, lightAlpha: 0 });
  process.stdout.write(JSON.stringify({name:`rgba-${i}.png`, text: texts[i], bytes: Buffer.from(bytes).toString('base64')})+'\n');
}
"""
import base64, json
result = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, cwd=root, check=True)
for line in result.stdout.splitlines():
    item = json.loads(line)
    payload = base64.b64decode(item['bytes'])
    image = Image.open(io.BytesIO(payload))
    image.load()
    assert image.mode == 'RGBA' and image.getpixel((0,0))[3] == 0
    # Composite over white as a typical browser/page renderer would.
    opaque = Image.new('RGBA', image.size, (255, 255, 255, 255))
    opaque.alpha_composite(image)
    from numpy import array
    detected, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(array(opaque.convert('RGB')), cv2.COLOR_RGB2BGR))
    assert detected == item['text'], (item['name'], detected, item['text'])
    print('RGBA PNG decoded:', item['name'])
print('All RGBA PNGs decoded and scanned successfully.')
