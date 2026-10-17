"""Independent QR image stress corpus (dev-only qrcode, Pillow, NumPy, OpenCV).

This uses neither Qrypt's encoder nor its renderer; the Node script runs Qrypt's
image decoder on raw grayscale buffers. Synthetic tests do not replace phones.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
import qrcode

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix='qrypt-m20-stress-') as directory:
    dest = Path(directory)
    fixtures = []
    for version in (1, 2, 5, 10):
        text = f'M20 INDEPENDENT VERSION {version}' if version > 2 else f'M20-{version}'
        code = qrcode.QRCode(version=version, error_correction=qrcode.constants.ERROR_CORRECT_H,
                             box_size=9, border=4)
        code.add_data(text)
        code.make(fit=False)
        original = np.asarray(code.make_image(fill_color='black', back_color='white').convert('L'))
        height, width = original.shape
        gradient = np.linspace(0, 50, width)[None, :]
        rng = np.random.default_rng(seed=0x20 + version)
        cases = {
            'original': original,
            'low-contrast': np.clip(original.astype(np.float64) * .21 + 120, 0, 255).astype(np.uint8),
            'uneven-light': np.clip(original.astype(np.float64) - gradient, 0, 255).astype(np.uint8),
            'mild-noise': np.clip(original.astype(np.float64) + rng.integers(-17, 18, original.shape), 0, 255).astype(np.uint8),
            'gentle-blur': cv2.GaussianBlur(original, (3,3), .6),
        }
        for label, data in cases.items():
            path = dest / f'v{version}-{label}.gray'
            data.tofile(path)
            fixtures.append({'label':f'v{version}-{label}', 'file':str(path), 'text':text,
                             'version':version,'width':width,'height':height})
    manifest = dest / 'manifest.json'
    manifest.write_text(json.dumps(fixtures), encoding='utf8')
    subprocess.run(['node','scripts/verify-reliability-images.mjs',str(manifest)], cwd=ROOT, check=True)
