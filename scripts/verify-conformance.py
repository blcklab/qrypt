#!/usr/bin/env python3
"""Independent QR matrix reference comparison for all 40 versions and L/M/Q/H.

Requires the development-only Python `qrcode` package and Node.js. Neither is
part of Qrypt's runtime dependency graph. Compile with `npm run verify:conformance`
first. This script compares matrices, not only decoded content, with the exact
mask selected by Qrypt (because conforming mask choices may legitimately vary).
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import qrcode
from qrcode import constants, util

ROOT = Path(__file__).resolve().parent.parent
LEVELS = {'L': constants.ERROR_CORRECT_L, 'M': constants.ERROR_CORRECT_M,
          'Q': constants.ERROR_CORRECT_Q, 'H': constants.ERROR_CORRECT_H}
MODE_SAMPLES = {
    'numeric': '31415926535897932384626433832795028841971693993751',
    'alphanumeric': 'QRYPT-1234ABCXYZ',
    'byte': 'qrypt_test_lowercase-',
}


def cases():
    result = []
    for version in range(1, 41):
        for label, correction in LEVELS.items():
            capacity = util.BIT_LIMIT_TABLE[correction][version]
            count_bits = (10 if version < 10 else 12 if version < 27 else 14)
            for mode, source in MODE_SAMPLES.items():
                if mode == 'numeric':
                    length = max(1, int((capacity - count_bits - 4) * 0.58 * 3 / 10))
                elif mode == 'alphanumeric':
                    width = 9 if version < 10 else 11 if version < 27 else 13
                    length = max(1, int((capacity - width - 4) * 0.58 * 2 / 11))
                else:
                    width = 8 if version < 10 else 16
                    length = max(1, int((capacity - width - 4) * 0.58 / 8))
                payload = (source * ((length + len(source) - 1) // len(source)))[:length]
                result.append({'version': version, 'level': label,
                               'mode': mode, 'payload': payload})
    return result


def reference_hash(qr):
    return hashlib.sha256(''.join('1' if m else '0' for row in qr.get_matrix()
                                  for m in row).encode('ascii')).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--full', action='store_true', help='check 480 combinations instead of a 160-case rotated-mode set')
args = parser.parse_args()
all_cases = cases()
SAMPLES = all_cases if args.full else [sample for index, sample in enumerate(all_cases) if index % 3 == (index // 3) % 3]
NODE = r"""
import { qrypt } from './.m7-check/index.js';
import {createHash} from 'node:crypto';
const samples = JSON.parse(process.argv[1]);
for (const {version,level,payload} of samples) {
  const qr = qrypt(payload,{version,errorCorrectionLevel:level});
  const encoded = qr.matrix().map(row=>row.map(m=>m?'1':'0').join('')).join('');
  const hash = createHash('sha256').update(encoded).digest('hex');
  process.stdout.write(JSON.stringify({version,level,mask:qr.mask,hash})+'\n');
}
"""
# Keep a bounded argv size across platforms; each chunk remains deterministic.
result = []
for offset in range(0, len(SAMPLES), 60):
    chunk = SAMPLES[offset:offset+60]
    output = subprocess.check_output(['node', '--input-type=module', '-e', NODE, json.dumps(chunk)],
                                     cwd=ROOT, text=True)
    result.extend(json.loads(line) for line in output.splitlines())

assert len(result) == len(SAMPLES)
for index, (item, actual) in enumerate(zip(SAMPLES, result)):
    assert item['version'] == actual['version'] and item['level'] == actual['level']
    qr = qrcode.QRCode(version=item['version'], error_correction=LEVELS[item['level']],
                       box_size=1, border=0, mask_pattern=actual['mask'])
    qr.add_data(item['payload'], optimize=0)
    qr.make(fit=False)
    expected = reference_hash(qr)
    if actual['hash'] != expected:
        raise AssertionError(f"Reference mismatch #{index}: v{item['version']} "
                             f"{item['level']}, mode={item['mode']}, mask={actual['mask']}")
print(f'Independent module-for-module comparisons passed: {len(result)}/{len(SAMPLES)}')
print('Covers 40 versions × 4 error-correction levels with all three single-mode payload types' if args.full else 'Covers 40 versions × 4 error-correction levels; modes rotate per configuration')
