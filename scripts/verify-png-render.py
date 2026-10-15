#!/usr/bin/env python3
"""Independent PNG decoding and QR scanning (Pillow, OpenCV, NumPy).

Development-only tools; none of these are runtime dependencies of Qrypt.
Run `npm run verify:png` first so .m6-check contains the compiled TS modules.
"""
import io
import json
from pathlib import Path
import subprocess

from PIL import Image
import cv2
import numpy as np

root = Path(__file__).resolve().parent.parent
samples = [
    ('Hello Qrypt', 1, 'M'),
    ('https://example.com/qrypt?x=42', 3, 'M'),
    ('Hello 🌐 世界', 3, 'H'),
    ('12345678901234567890', 2, 'Q'),
    ('A1B2C3 XYZ', 7, 'M'),
]
js = """
import {qrypt} from './.m6-check/index.js';
import {toPNG} from './.m6-check/png.js';
import {writeFileSync} from 'node:fs';
const cases = JSON.parse(process.argv[1]);
for (const [payload, version, errorCorrectionLevel] of cases) {
  const qr = qrypt(payload, {version, errorCorrectionLevel});
  const png = toPNG(qr, {scale: 10});
  console.log(JSON.stringify({payload, version, errorCorrectionLevel, png: Buffer.from(png).toString('base64'), matrix: qr.matrix()}));
}
"""
import base64
response = subprocess.check_output(['node', '--input-type=module', '-e', js, json.dumps(samples)], cwd=root, text=True)
reader = cv2.QRCodeDetector()
for line in response.splitlines():
    item = json.loads(line)
    png = base64.b64decode(item['png'])
    image = Image.open(io.BytesIO(png))
    image.load()  # verify real PNG decoding and zlib / CRC handling
    if image.mode != 'P' or image.info.get('transparency') is not None:
        raise AssertionError('Expected opaque indexed-color PNG')
    matrix = np.asarray(item['matrix'], dtype=bool)
    actual = np.asarray(image.convert('RGB'), dtype=np.uint8)
    expected_pixels = np.pad(matrix, ((4, 4), (4, 4)), constant_values=False)
    expected_pixels = np.repeat(np.repeat(expected_pixels, 10, axis=0), 10, axis=1)
    expected_rgb = np.where(expected_pixels[:, :, None], 0, 255).astype(np.uint8)
    expected_rgb = np.broadcast_to(expected_rgb, actual.shape)
    if not np.array_equal(actual, expected_rgb):
        raise AssertionError(f'PNG pixel mismatch at v{item["version"]}-{item["errorCorrectionLevel"]}')
    decoded, _, _ = reader.detectAndDecode(actual)
    if decoded != item['payload']:
        raise AssertionError(f'PNG scanner mismatch: {decoded!r} != {item["payload"]!r}')
    print(f'Independent PNG decode and QR scan: v{item["version"]}-{item["errorCorrectionLevel"]}')
print(f'Independent PNG scanning passed: {len(samples)} / {len(samples)}')
