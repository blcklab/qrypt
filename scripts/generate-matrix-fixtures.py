#!/usr/bin/env python3
"""Dev-only reference hashes. Python qrcode must be installed; not an npm dependency.

The fixture hashes reference matrices emitted by python-qrcode using Qrypt's
selected mask, so differences in legitimate mask scoring do not change the test.
We deliberately use single-mode payloads to avoid segmentation differences.
"""
import hashlib
import json
from pathlib import Path
import subprocess

import qrcode

root = Path(__file__).resolve().parent.parent
command = """
import { qrypt } from './.m4-check/index.js';
const payloads = ['HELLO', '123456789012', 'qr42!'];
for (let version = 1; version <= 40; version++) {
  for (const level of ['L', 'M', 'Q', 'H']) {
    const payload = payloads[(version + ['L','M','Q','H'].indexOf(level)) % 3];
    const qr = qrypt(payload, {version, errorCorrectionLevel: level});
    console.log(JSON.stringify({version, level, payload, mask: qr.mask}));
  }
}
"""
encoded = subprocess.check_output(['node', '--input-type=module', '-e', command], cwd=root, text=True)
levels = dict(zip('LMQH', [qrcode.constants.ERROR_CORRECT_L, qrcode.constants.ERROR_CORRECT_M,
                          qrcode.constants.ERROR_CORRECT_Q, qrcode.constants.ERROR_CORRECT_H]))
fixtures = []
for line in encoded.splitlines():
    item = json.loads(line)
    qr = qrcode.QRCode(version=item['version'], error_correction=levels[item['level']], border=0)
    qr.add_data(item['payload'], optimize=0)
    qr.makeImpl(False, item['mask'])
    matrix = qr.get_matrix()
    assert len(matrix) == 4 * item['version'] + 17
    flat = ''.join('1' if bit else '0' for row in matrix for bit in row).encode('ascii')
    item['sha256'] = hashlib.sha256(flat).hexdigest()
    fixtures.append(item)
(root / 'test' / 'fixtures' / 'reference-matrices.json').write_text(json.dumps(fixtures, indent=2) + '\n')
print(f'Wrote {len(fixtures)} reference matrices from python-qrcode')
