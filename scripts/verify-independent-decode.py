#!/usr/bin/env python3
"""Optional developer interoperability smoke test. Needs cv2 and numpy; no runtime npm deps."""
import json
from pathlib import Path
import subprocess
import cv2
import numpy as np

root = Path(__file__).resolve().parent.parent
values = [
    ('Hello Qrypt', 1, 'M'),
    ('https://example.com/qrypt?x=42', 3, 'M'),
    ('Hello 🌐 世界', 3, 'H'),
    ('12345678901234567890', 2, 'Q'),
    ('A1B2C3 XYZ', 7, 'M'),
]
js = """
import { qrypt } from './.m4-check/index.js';
const samples = JSON.parse(process.argv[1]);
for (const [payload,version,level] of samples) {
 const qr=qrypt(payload,{version,errorCorrectionLevel:level});
 console.log(JSON.stringify({payload,version,level,mask:qr.mask,matrix:qr.matrix()}));
}
"""
response = subprocess.check_output(['node','--input-type=module','-e',js, json.dumps(values)], cwd=root, text=True)
reader = cv2.QRCodeDetector()
for line in response.splitlines():
    item = json.loads(line)
    source = np.array(item['matrix'], dtype=np.uint8)
    # Place a four-module white border around a 10px nearest-neighbor rasterization.
    padded = np.pad(source, ((4,4),(4,4)), constant_values=0)
    picture = np.repeat(np.repeat((1-padded)*255, 10, axis=0), 10, axis=1)
    decoded, _, _ = reader.detectAndDecode(picture)
    if decoded != item['payload']:
        raise AssertionError(f"Decoder mismatch v{item['version']}-{item['level']}: {decoded!r} != {item['payload']!r}")
    print(f"Decoded v{item['version']}-{item['level']}, {len(item['payload'])} chars")
print(f'Independent decoder passed {len(values)} cases')
