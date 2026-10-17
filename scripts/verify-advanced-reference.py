"""Independent byte-mode matrix comparison. Dev-only: pip install qrcode."""
import json
import subprocess
import pathlib

import qrcode
from qrcode.util import QRData, MODE_8BIT_BYTE

root = pathlib.Path(__file__).resolve().parent.parent
payload = subprocess.check_output(['node', 'scripts/verify-advanced-reference.mjs'], cwd=root, text=True)
cases = json.loads(payload)
levels = dict(L=qrcode.constants.ERROR_CORRECT_L, M=qrcode.constants.ERROR_CORRECT_M,
              Q=qrcode.constants.ERROR_CORRECT_Q, H=qrcode.constants.ERROR_CORRECT_H)
for item in cases:
    reference = qrcode.QRCode(version=item['version'], error_correction=levels[item['level']],
                              mask_pattern=item['mask'], border=0, box_size=1)
    reference.add_data(QRData(bytes(item['bytes']), mode=MODE_8BIT_BYTE), optimize=0)
    reference.make(fit=False)
    expected = [[int(cell) for cell in row] for row in reference.get_matrix()]
    if expected != item['matrix']:
        raise AssertionError((item['version'], item['level'], item['mask']))
print(f"Advanced byte-mode matrices matched independent Python QR encoder: {len(cases)}/{len(cases)}")
