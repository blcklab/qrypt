#!/usr/bin/env python3
"""Decode real styled SVG/PNG QR output independently with CairoSVG, Pillow, and OpenCV.
Dependencies are development-only; no runtime dependency is added to Qrypt.
"""
import base64
import io
import json
import subprocess

import cairosvg
import cv2
import numpy as np
from PIL import Image
from pathlib import Path

root = Path(__file__).resolve().parent.parent
js = r"""
import { qrypt } from './.m14-check/index.js';
import { toStyledSVG, toStyledPNG } from './.m14-check/styled.js';
const cases = [
  ['https://example.com/m14', {moduleShape:'square'}],
  ['HELLO QRYPT 2026', {moduleShape:'dot'}],
  ['https://example.org/one-time-token', {moduleShape:'rounded'}],
  ['M14 finder', {moduleShape:'dot',finderStyle:'rounded'}],
  ['Qrypt gradients 123', {moduleShape:'rounded',gradient:{from:'#000000',to:'#153d66'}}],
  ['Qrypt gradients 456', {moduleShape:'dot',finderStyle:'rounded',gradient:{from:'#073057',to:'#151515',direction:'horizontal'}}],
  ['Qrypt Version 7', {moduleShape:'rounded',gradient:{from:'#000000',to:'#263a53'}}],
];
for (let i=0;i<cases.length;i++) {
  const [text,opts]=cases[i];
  const qr=qrypt(text,{version:i===6 ? 7:'auto',errorCorrectionLevel:'H'});
  const options={...opts,scale:10,margin:4};
  process.stdout.write(JSON.stringify({text, png:Buffer.from(toStyledPNG(qr,options)).toString('base64'),svg:toStyledSVG(qr,options)})+'\n');
}
"""
result = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True,
                        text=True, cwd=root, check=True)
for n, line in enumerate(result.stdout.splitlines()):
    sample = json.loads(line)
    for fmt in ['png', 'svg']:
        payload = (base64.b64decode(sample['png']) if fmt == 'png'
                   else cairosvg.svg2png(bytestring=sample['svg'].encode('utf8')))
        with Image.open(io.BytesIO(payload)) as im:
            image = np.asarray(im.convert('RGB'))
        decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(
            cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
        if decoded != sample['text']:
            raise AssertionError((n, fmt, decoded, sample['text']))
        print('Styled decode PASS', n, fmt)
print('All independent styled decoding checks passed.')
