#!/usr/bin/env python3
"""Independently generate QR matrices with Python qrcode and decode in Qrypt.
Dev-only: requires `qrcode` Python package; not a runtime dependency.
"""
import json
import subprocess
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H

root = Path(__file__).resolve().parent.parent
samples = []
for version in range(1, 41):
    for level, constant in {'L': ERROR_CORRECT_L, 'M': ERROR_CORRECT_M, 'Q': ERROR_CORRECT_Q, 'H': ERROR_CORRECT_H}.items():
        payload = f'REF-{version}-{level}'
        qr = qrcode.QRCode(version=version, error_correction=constant, box_size=1, border=0, mask_pattern=(version % 8))
        qr.add_data(payload, optimize=0)
        qr.make(fit=False)
        samples.append({'text': payload, 'version':version, 'level':level, 'matrix':qr.get_matrix()})

javascript = '''import { decodeMatrix } from './.m16-check/decode.js';
import { readFileSync } from 'node:fs';
const cases=JSON.parse(readFileSync(0, 'utf8'));
for(const [i,item] of cases.entries()){
  const result=decodeMatrix(item.matrix);
  if(result.text!==item.text || result.version!==item.version || result.errorCorrectionLevel!==item.level)
    throw new Error('Reference mismatch '+i+' '+item.text);
}
console.log('Independent Python qrcode -> Qrypt decoding: '+cases.length+'/'+cases.length+' passed');
'''
result = subprocess.run(['node', '--input-type=module', '-e', javascript],
    cwd=root, input=json.dumps(samples), capture_output=True, text=True)
if result.returncode:
    raise SystemExit(result.stderr or result.stdout)
print(result.stdout.strip())
