import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt } from '../.m17-check/index.js'
import { toPixels } from '../.m17-check/render.js'
import { decodePixels, decodeMatrix } from '../.m17-check/decode.js'
import { signQRPayload, verifyQRPayload } from '../.m17-check/secure.js'
import { webcrypto } from 'node:crypto'

function rotated90(image) {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const from=(y*width+x)*4, to=(x*height+(height-1-y))*4
    out.set(data.subarray(from,from+4),to)
  }
  return {width:height,height:width,data:out}
}

function offsetCanvas(image, padding=18) {
  const width=image.width+2*padding,height=image.height+2*padding
  const data=new Uint8ClampedArray(width*height*4)
  data.fill(255)
  for(let y=0;y<image.height;y++)data.set(image.data.subarray(y*image.width*4,(y+1)*image.width*4),((y+padding)*width+padding)*4)
  return {width,height,data}
}

test('decodes images across all 40 versions and 4 error correction levels', () => {
  for(let version=1;version<=40;version++)for(const errorCorrectionLevel of ['L','M','Q','H']){
    const text=`QR M17-${version}-${errorCorrectionLevel}`
    const qr=qrypt(text,{version,errorCorrectionLevel})
    const pixels=toPixels(qr,{scale:version>=24?3:5})
    const result=decodePixels(pixels)
    assert.equal(result?.text,text,`v${version}/${errorCorrectionLevel}`)
    assert.equal(result?.version,version)
    assert.equal(result?.errorCorrectionLevel,errorCorrectionLevel)
    assert.ok(Number.isInteger(result?.correctedErrors) && result.correctedErrors >= 0)
    assert.equal(result.corners.length,4)
    for(const p of result.corners)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y))
  }
})

test('handles 90-degree rotation, translated placement, and custom RGB and grayscale buffers', () => {
  for(const text of ['ROTATED', '日本語 🧪', 'HELLO'.repeat(10)]) {
    const qr=qrypt(text,{errorCorrectionLevel:'Q'})
    const original=toPixels(qr,{scale:8})
    assert.equal(decodePixels(rotated90(original))?.text,text)
    assert.equal(decodePixels(offsetCanvas(original))?.text,text)
    const rgb=new Uint8Array(original.width*original.height*3)
    const gray=new Uint8Array(original.width*original.height)
    for(let p=0;p<gray.length;p++){
      const v=original.data[p*4]
      gray[p]=v
      rgb.set([v,v,v],p*3)
    }
    assert.equal(decodePixels({width:original.width,height:original.height,data:rgb,format:'rgb'})?.text,text)
    assert.equal(decodePixels({width:original.width,height:original.height,data:gray,format:'gray'})?.text,text)
  }
})

test('reads generated QR matrices through existing decoder and does not mutate pixels', () => {
  const text='PIXEL INPUT MUST STAY UNCHANGED'
  const qr=qrypt(text)
  assert.equal(decodeMatrix(qr.matrix()).text,text)
  const image=toPixels(qr)
  const before=image.data.slice()
  assert.equal(decodePixels(image)?.text,text)
  assert.deepEqual(image.data,before)
})

test('returns null for no symbol and malformed but correctly sized images', () => {
  const blank=new Uint8Array(128*128*4);blank.fill(255)
  assert.equal(decodePixels({width:128,height:128,data:blank}),null)
  const gray=new Uint8Array(128*128);gray.fill(0)
  assert.equal(decodePixels({width:128,height:128,data:gray,format:'gray'}),null)
})

test('rejects oversized, malformed and incorrectly typed image buffers', () => {
  for(const value of [null,undefined,{}, {width:0,height:10,data:new Uint8Array()},
    {width:4096,height:4096,data:new Uint8Array()},
    {width:30,height:30,data:new Uint8Array(1)},
    {width:30,height:30,data:[]},
    {width:30,height:30,format:'unknown',data:new Uint8Array(900)},
    {width:30,height:30,data:new Uint8Array(2700)},
  ]) assert.throws(()=>decodePixels(value))
  const pixels=new Uint8Array(30*30*4)
  for(const options of [null,[],{maxCandidates:0},{maxFinders:100},{maxCandidates:Infinity}]){
    assert.throws(()=>decodePixels({width:30,height:30,data:pixels},options))
  }
})


test('decodes a signed attendance QR image without automatically trusting the payload', async () => {
  const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  const issuer='https://issuer.example',audience='attendance',purpose='checkin'
  const token=await signQRPayload({
    issuer,audience,purpose,keyId:'active1',privateKey:keys.privateKey,
    expiresInSeconds:120,now:1000,data:{record:'QR-ATTENDANCE-123'},
  })
  const qr=qrypt(token,{errorCorrectionLevel:'H'})
  const decoded=decodePixels(toPixels(qr,{scale:7}))
  assert.equal(decoded?.text,token)
  // Only a separate trusted-key signature/policy check establishes authenticity.
  const result=await verifyQRPayload(decoded.text,{issuer,audience,purpose,now:1001,
    resolvePublicKey:(kid)=>kid==='active1'?keys.publicKey:null})
  assert.equal(result.valid,true)
  const wrongAudience=await verifyQRPayload(decoded.text,{issuer,audience:'other',purpose,now:1001,
    resolvePublicKey:(kid)=>kid==='active1'?keys.publicKey:null})
  assert.equal(wrongAudience.valid,false)
})
