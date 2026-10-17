#!/usr/bin/env python3
"""Independent decoding of actual logo PNG and SVG. Dev-only: CairoSVG, Pillow, OpenCV, NumPy."""
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
import { qrypt } from './.m15-check/index.js';
import {toLogoPNG,toLogoSVG} from './.m15-check/logo.js';
const logo={width:24,height:24,data:new Uint8ClampedArray(24*24*4)};
for(let y=0;y<24;y++) for(let x=0;x<24;x++) {
 const k=(y*24+x)*4, ink = x>4&&x<19&&y>4&&y<19 && (x<9||y<9||y>14);
 logo.data[k]=ink?10:0;logo.data[k+1]=ink?20:0;logo.data[k+2]=ink?30:0;logo.data[k+3]=ink?255:0;
}
const cases=[
 ['HELLO QRYPT LOGO',{errorCorrectionLevel:'H'},{scale:12}],
 ['https://example.org/qrypt-logo',{errorCorrectionLevel:'H'},{scale:10,moduleShape:'rounded'}],
 ['QRYPT-V1',{errorCorrectionLevel:'H',version:1},{scale:12}],
 ['QRYPT V7',{errorCorrectionLevel:'H',version:7},{scale:8,moduleShape:'rounded'}],
 ['QRYPT V10',{errorCorrectionLevel:'H',version:10},{scale:7,moduleShape:'dot'}],
 ['QRYPT Q ECC',{errorCorrectionLevel:'Q',version:4},{scale:10}],
 ['secure-token-example',{errorCorrectionLevel:'H',version:5},{scale:9,gradient:{from:'#000000',to:'#173B60'}}],
];
for (const [text,qrOptions,options] of cases) {
 const qr=qrypt(text,qrOptions);
 process.stdout.write(JSON.stringify({text, png:Buffer.from(toLogoPNG(qr,logo,options)).toString('base64'), svg:toLogoSVG(qr,logo,options)})+'\n');
}
"""
proc = subprocess.run(['node','--input-type=module','-e',js],cwd=root,text=True,capture_output=True,check=True)
for i,line in enumerate(proc.stdout.splitlines()):
    sample=json.loads(line)
    for fmt in ['png','svg']:
        payload=(base64.b64decode(sample['png']) if fmt=='png'
                 else cairosvg.svg2png(bytestring=sample['svg'].encode()))
        with Image.open(io.BytesIO(payload)) as img:
            rgb=np.asarray(img.convert('RGB'))
        value,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
        if value!=sample['text']:
            raise AssertionError(f'{i}: {fmt} decoded {value!r}, expected {sample["text"]!r}')
        print(f'PASS logo scan #{i+1} {fmt}')
print('All independently decoded logo scans passed.')
