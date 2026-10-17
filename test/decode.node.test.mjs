import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt } from '../.m16-check/index.js'
import { decodeMatrix } from '../.m16-check/decode.js'
import { readMatrixData } from '../.m16-check/decode/matrix.js'
import { decodePayload as decodeTestPayload } from '../.m16-check/decode/payload.js'
import { repairBlock } from '../.m16-check/decode/reed-solomon.js'
import { reedSolomonRemainder } from '../.m16-check/ecc/reed-solomon.js'
import { createFunctionPatterns } from '../.m16-check/matrix/patterns.js'
import { getECCLayout } from '../.m16-check/encoding/capacity.js'

function bitCoordinates(version, level) {
  const { size, reserved } = createFunctionPatterns(version, level)
  const coordinates = []
  let up = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let offset = 0; offset < size; offset++) {
      const y = up ? size - 1 - offset : offset
      for (let column = 0; column < 2; column++) {
        const x = right - column
        if (!reserved[y * size + x]) coordinates.push([x, y])
      }
    }
    up = !up
  }
  return coordinates
}
function flipCodewords(matrix, version, level, indices) {
  const coords = bitCoordinates(version, level)
  for (const index of indices) {
    const [x,y] = coords[index * 8]
    matrix[y][x] = !matrix[y][x]
  }
}

test('decodes all 40 QR versions and all four ECC levels, with no decoder-specific encoder state', () => {
  for (let version = 1; version <= 40; version++) for (const level of ['L', 'M', 'Q', 'H']) {
    const text = 'QR-'+version+'-'+level
    const qr = qrypt(text, { version, errorCorrectionLevel:level })
    const result = decodeMatrix(qr.matrix())
    assert.equal(result.text, text, `v${version}-${level}`)
    assert.equal(result.version, version)
    assert.equal(result.errorCorrectionLevel, level)
    assert.equal(result.mask, qr.mask)
    assert.equal(result.correctedErrors, 0)
  }
})

test('numeric/alphanumeric/mixed Unicode/ECI and empty payload round-trip', () => {
  for (const payload of ['', '1234567890123456789', 'HELLO WORLD', 'hello world',
    '1234abcd567890', 'π 3.14', '日本語 + 🧪 / 🗝', 'test\u0000null', 'A'.repeat(180)]) {
    const qr = qrypt(payload, {errorCorrectionLevel:'Q'})
    const decoded = decodeMatrix(qr.matrix())
    assert.equal(decoded.text, payload)
    assert.ok(decoded.segments.length || payload === '')
    assert.ok(decoded.segments.every(s => typeof s.text === 'string'))
    if ([...payload].some(c=>c.codePointAt(0)>127)) assert.ok(decoded.segments.some(s=>s.mode==='byte' && s.eci===26))
  }
})

test('corrects damaged data codewords in single and multiple RS blocks', () => {
  for (const [version, level, text, errors] of [
    [1,'L','HELLO',3], [1,'H','HELLO',5], [7,'Q','Repaired version seven',5],
    [20,'H','MULTIBLOCK 12345',8], [40,'M','MANY BLOCKS',5]
  ]) {
    const qr=qrypt(text,{version,errorCorrectionLevel:level})
    const damaged=qr.matrix()
    const {blockCount} = getECCLayout(version,level)
    flipCodewords(damaged,version,level,Array.from({length:errors},(_,i)=>i*blockCount))
    const result=decodeMatrix(damaged)
    assert.equal(result.text,text,`v${version}-${level}`)
    assert.equal(result.correctedErrors,errors)
  }
})

test('rejects codeword corruption above RS capacity', () => {
  const qr=qrypt('HELLO',{version:1,errorCorrectionLevel:'L'})
  const matrix=qr.matrix()
  flipCodewords(matrix,1,'L',[0,1,2,3]) // 7 ECC bytes -> at most 3 unknown-byte errors
  assert.throws(()=>decodeMatrix(matrix),/Reed.Solomon|QR segment/)
})

test('decodes BCH-damaged format and version data using redundant copies', () => {
  const qr=qrypt('ABC123',{version:7,errorCorrectionLevel:'H'})
  const matrix=qr.matrix()
  matrix[0][8]=!matrix[0][8]
  matrix[1][8]=!matrix[1][8]
  matrix[2][8]=!matrix[2][8]
  // Both version copies: each tolerates at most three damaged bits.
  const size=qr.size
  for(const i of [0,1,2]) {
    const x=size-11+(i%3), y=Math.floor(i/3)
    matrix[y][x]=!matrix[y][x]
  }
  assert.equal(decodeMatrix(matrix).text,'ABC123')
  const invalid=qr.matrix()
  for(const i of [0,1,2,3]) {
    const x=size-11+i%3,y=Math.floor(i/3)
    invalid[y][x]=!invalid[y][x]
    invalid[x][y]=!invalid[x][y]
  }
  assert.throws(()=>decodeMatrix(invalid),/version information/)
})

test('rejects invalid module input without touching caller data', () => {
  const original=qrypt('DO NOT MUTATE').matrix()
  const before=original.map(r=>r.slice())
  assert.equal(decodeMatrix(original).text,'DO NOT MUTATE')
  assert.deepEqual(original,before)
  for (const bad of [[], [[true]], [new Array(21).fill(true)], null, 'qr',
    Array.from({length:21},()=>new Array(21).fill(1))]) {
    assert.throws(()=>decodeMatrix(bad))
  }
})

test('repairs RS blocks against the independent encoding remainder (1–15 errors)', () => {
  let seed=0x39490
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed&255}
  for (const ecc of [7,10,13,16,18,22,24,28,30]) for(const count of [1,Math.floor(ecc/2)]) {
    const data=Uint8Array.from({length:60},random)
    const block=new Uint8Array(data.length+ecc)
    block.set(data);block.set(reedSolomonRemainder(data,ecc),data.length)
    const damaged=block.slice()
    for(let i=0;i<count;i++) damaged[i*2]^=(random()||1)
    const {bytes,corrected}=repairBlock(damaged,ecc)
    assert.deepEqual(bytes,block)
    assert.equal(corrected,count)
  }
})

test('rejects unsupported ECI/modes and malformed UTF-8 rather than guessing', () => {
  // The payload parser is also tested directly to cover modes not produced by Qrypt.
  const { data, ...meta }=readMatrixData(qrypt('HELLO').matrix())
  const parsed={...meta,data:new Uint8Array(data.length)}
  const bits=(bytes)=>parsed.data.set(bytes)
  // FNC1-first is now supported by M18. FNC1 second-position (1001) is not.
  bits([0x90]);assert.throws(()=>decodeTestPayload(parsed),/Unsupported QR data mode/)
  // Unsupported ECI assignment 10.
  bits([0x70,0xa0]);assert.throws(()=>decodeTestPayload(parsed),/Unsupported QR ECI/)
  // ECI 26, byte segment 1 byte of invalid UTF-8 0x80.
  bits([0x71,0xa4,0x01,0x80]);assert.throws(()=>decodeTestPayload(parsed),/UTF-8/)
})
