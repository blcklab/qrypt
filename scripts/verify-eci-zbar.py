#!/usr/bin/env python3
"""Independent UTF-8 / ECI QR decoding with ZBar (development-only).

Requires Pillow and pyzbar with its native ZBar library. Compile the local
TypeScript source into .m6-check first via `npm run verify:png`. This suite
verifies that an independent QR decoder returns the original UTF-8 *bytes*;
it does not certify compatibility with all readers.
"""
import base64
import io
import json
from pathlib import Path
import subprocess

from PIL import Image
from pyzbar.pyzbar import decode

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = [
    ('Hello 🌐 世界', None, 'M'),
    ('café', None, 'M'),
    ('こんにちは世界', None, 'M'),
    ('QR 💡 emoji', None, 'M'),
    ('mañana åøñ', None, 'M'),
    ('😀😃😄😁', None, 'M'),
    ('é', None, 'M'),
    # OpenCV previously failed this specific ECI symbol; ZBar must read it.
    ('π 3.14', 2, 'M'),
    ('QRYPT-2026 UTF-8 🌐 世界', 7, 'Q'),
]
NODE = """
import {qrypt} from './.m6-check/index.js';
import {toPNG} from './.m6-check/png.js';
const samples = JSON.parse(process.argv[1]);
for (const [text,version,level] of samples) {
  const opts = {errorCorrectionLevel:level};
  if (version !== null) opts.version = version;
  const qr = qrypt(text,opts);
  const png = toPNG(qr,{scale:10,margin:4});
  console.log(JSON.stringify({version:qr.version,level,png:Buffer.from(png).toString('base64')}));
}
"""
output = subprocess.check_output(
    ['node', '--input-type=module', '-e', NODE, json.dumps(SAMPLES, ensure_ascii=False)],
    cwd=ROOT, text=True,
)
lines = output.splitlines()
assert len(lines) == len(SAMPLES), 'Unexpected number of PNG cases'
for sample, line in zip(SAMPLES, lines):
    text, _, _ = sample
    info = json.loads(line)
    decoded = decode(Image.open(io.BytesIO(base64.b64decode(info['png']))).convert('RGB'))
    if len(decoded) != 1 or decoded[0].data != text.encode('utf-8'):
        raise AssertionError(f'ZBar UTF-8 mismatch for {text!r} (v{info["version"]}-{info["level"]})')
    print(f'ZBar UTF-8 pass: v{info["version"]}-{info["level"]} / {text!r}')
print(f'ZBar independent UTF-8/ECI scans: {len(SAMPLES)}/{len(SAMPLES)} passed')
