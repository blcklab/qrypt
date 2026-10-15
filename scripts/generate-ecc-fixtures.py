"""Regenerate ECC reference vectors with the INDEPENDENT Python `qrcode` package.

Optional development check only. Not used by Qrypt or its npm build.
Requires: pip install qrcode (the Python package).

Reference values come from qrcode.base.Polynomial / .rs_blocks and
qrcode.util.create_bytes / .create_data, not Qrypt's TypeScript code.
"""
from hashlib import sha256
import json
from pathlib import Path

from qrcode import base, constants, util

LEVELS = {
    'L': constants.ERROR_CORRECT_L,
    'M': constants.ERROR_CORRECT_M,
    'Q': constants.ERROR_CORRECT_Q,
    'H': constants.ERROR_CORRECT_H,
}
SEEDS = {'L': 3, 'M': 5, 'Q': 7, 'H': 11}

fixture = {
    'provenance': (
        'Independent Python qrcode.util.create_bytes + qrcode.base.rs_blocks. '
        'Synthetic data byte[i] = (i*149 + (i>>1)*31 + version*17 + levelSeed*43) & 255.'
    ),
    'generator': {},
    'gf': [],
    'digests': {},
    'knownCodewords': {},
}

for degree in [1, 2, 7, 10, 13, 17, 22, 30]:
    polynomial = base.Polynomial([1], 0)
    for i in range(degree):
        polynomial *= base.Polynomial([1, base.gexp(i)], 0)
    fixture['generator'][str(degree)] = list(polynomial)

for a, b in [(0, 5), (1, 255), (0x53, 0xCA), (0x80, 2), (255, 255),
             (0x1D, 0x80), (2, 128), (29, 17), (0x57, 0x83)]:
    product = base.gexp(base.glog(a) + base.glog(b)) if a and b else 0
    fixture['gf'].append([a, b, product])

for level, level_constant in LEVELS.items():
    fixture['digests'][level] = []
    for version in range(1, 41):
        blocks = base.rs_blocks(version, level_constant)
        count = sum(block.data_count for block in blocks)
        data = bytes((i * 149 + (i >> 1) * 31 + version * 17 + SEEDS[level] * 43) & 255
                     for i in range(count))
        bits = util.BitBuffer()
        bits.buffer = list(data)
        codewords = bytes(util.create_bytes(bits, blocks))
        assert len(codewords) == sum(block.total_count for block in blocks)
        fixture['digests'][level].append(sha256(codewords).hexdigest())

examples = [
    (1, 'L', util.MODE_ALPHA_NUM, 'HELLO WORLD'),
    (1, 'L', util.MODE_NUMBER, '01234567'),
    (1, 'M', util.MODE_8BIT_BYTE, 'hello'),
]
for version, level, mode, text in examples:
    key = f'{version}-{level}-{text}'
    fixture['knownCodewords'][key] = util.create_data(
        version, LEVELS[level], [util.QRData(text, mode=mode)])

output = Path(__file__).resolve().parent.parent / 'test/fixtures/reference-ecc.json'
output.write_text(json.dumps(fixture, indent=2) + '\n', encoding='utf-8')
print('Wrote', output)
