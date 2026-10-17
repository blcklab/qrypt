"""Dev-only QR image fixtures: independently encode, rotate and warp with Python.

Dependencies: qrcode, Pillow, NumPy, OpenCV. No Qrypt runtime dependency.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
import qrcode

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix='qrypt-m17-') as directory:
    folder = Path(directory)
    cases = []
    for version in (1, 2, 5, 10):
        text = f'REF{version}' if version <= 2 else f'PYTHON REFERENCE V{version}'
        qr = qrcode.QRCode(version=version, error_correction=qrcode.constants.ERROR_CORRECT_H,
                           box_size=9, border=4)
        qr.add_data(text)
        qr.make(fit=False)
        original = np.asarray(qr.make_image(fill_color='black', back_color='white').convert('L'))
        height, width = original.shape
        transformations = {
            'plain': original,
            'rotate90': cv2.rotate(original, cv2.ROTATE_90_CLOCKWISE),
            'rotate25': cv2.warpAffine(
                original, cv2.getRotationMatrix2D((width / 2, height / 2), 25, .85),
                (width, height), borderValue=255),
        }
        if version in (2, 5, 10):
            side = width + 80
            src = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
            dst = np.float32([[37, 25], [width + 27, 35], [width + 38, height + 18], [25, height + 36]])
            transformations['perspective'] = cv2.warpPerspective(
                original, cv2.getPerspectiveTransform(src, dst), (side, side), borderValue=255)
        for label, transformed in transformations.items():
            name = f'v{version}-{label}'
            file = folder / f'{name}.gray'
            transformed.tofile(file)
            cases.append({'label': name, 'file': str(file), 'text': text, 'version': version,
                          'width': int(transformed.shape[1]), 'height': int(transformed.shape[0])})
    manifest = folder / 'cases.json'
    manifest.write_text(json.dumps(cases), encoding='utf-8')
    subprocess.run(['node', 'scripts/verify-image-decoder-reference.mjs', str(manifest)],
                   cwd=ROOT, check=True)
