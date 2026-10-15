#!/usr/bin/env python3
"""Optional independent SVG-to-raster + QR decoding test (CairoSVG, OpenCV, NumPy).

These are development-only tools. Nothing from Python is used by Qrypt at runtime.
"""
import io
import json
from pathlib import Path
import subprocess

import cairosvg
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
import { qrypt, toSVG } from './.m5-check/index.js';
const samples = JSON.parse(process.argv[1]);
for (const [payload, version, errorCorrectionLevel] of samples) {
  const qr = qrypt(payload, { version, errorCorrectionLevel });
  console.log(JSON.stringify({ payload, version, errorCorrectionLevel, svg: toSVG(qr, { scale: 10 }) }));
}
"""
response = subprocess.check_output(
    ['node', '--input-type=module', '-e', js, json.dumps(samples)],
    cwd=root, text=True
)
reader = cv2.QRCodeDetector()
for line in response.splitlines():
    item = json.loads(line)
    png_bytes = cairosvg.svg2png(bytestring=item['svg'].encode('utf-8'))
    image = cv2.imdecode(np.frombuffer(png_bytes, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    decoded, _, _ = reader.detectAndDecode(image)
    if decoded != item['payload']:
        raise AssertionError(
            f"QR SVG decoder mismatch at v{item['version']}-{item['errorCorrectionLevel']}: "
            f"{decoded!r} != {item['payload']!r}"
        )
    print(f"Scanned independent SVG raster: v{item['version']}-{item['errorCorrectionLevel']}")
print(f'Independent SVG scanning passed: {len(samples)} / {len(samples)}')
