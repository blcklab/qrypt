import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt } from '../.m18-check/index.js'
import { qryptBytes, qryptKanji, qryptGS1, qryptStructuredAppend } from '../.m18-check/advanced.js'
import { decodeMatrix, assembleStructuredAppend } from '../.m18-check/decode.js'
import { getDataCodewords } from '../.m18-check/encoding/capacity.js'
import { BitBuffer } from '../.m18-check/encoding/bits.js'
import { writeKanji } from '../.m18-check/encoding/advanced.js'

const roundTrip = (value, options) => decodeMatrix(qryptBytes(value, options).matrix())

test('byte payloads round-trip losslessly, including NUL and invalid UTF-8', () => {
  for (const raw of [[], [0,255,128,0xc3,0x28,0,42], Array.from({length:255},(_,i)=>i), Array.from({length:259},(_,i)=>i%256)]) {
    const bytes = Uint8Array.from(raw)
    const result = roundTrip(bytes, {errorCorrectionLevel:'L'})
    assert.deepEqual([...result.bytes], [...bytes])
    assert.ok(result.segments.every(segment=>segment.mode==='byte'))
  }
  for (const [level,version] of [['L',1],['M',7],['Q',10],['H',40]]) {
    const bytes = Uint8Array.from([0,1,42,255,0,1])
    const decoded = roundTrip(bytes,{version,errorCorrectionLevel:level})
    assert.deepEqual([...decoded.bytes], [...bytes])
  }
})

test('byte capacity, unsupported inputs, and explicit versions reject safely', () => {
  assert.throws(()=>qryptBytes([1,2,3]), /Uint8Array/)
  assert.throws(()=>qryptBytes(new Uint8Array(2954)), /capacity/)
  assert.throws(()=>qryptBytes(new Uint8Array(18),{version:1,errorCorrectionLevel:'L'}), /exceeds/)
  assert.deepEqual([...roundTrip(new Uint8Array(0),{version:1}).bytes], [])
  assert.equal(getDataCodewords(40,'L'),2956)
})

test('Kanji encodes the known 13-bit Shift-JIS vector and decodes Japanese', () => {
  // 茗荷 = E4AA 89D7 in Shift-JIS. Publicly documented QR Kanji known-answer vector.
  const kanji = new Uint8Array([0xe4,0xaa,0x89,0xd7])
  const writer = new BitBuffer()
  writeKanji(writer,kanji,1)
  assert.equal(writer.bitLength,4+8+26)
  const code = new BitBuffer()
  code.write(0x1aaa,13); code.write(0x697,13)
  const expected = new BitBuffer()
  expected.write(8,4);expected.write(2,8);expected.write(0x1aaa,13);expected.write(0x697,13)
  const pad = b=> {b.write(0, 8-(b.bitLength%8));return [...b.toBytes()]}
  assert.deepEqual(pad(writer),pad(expected))
  for (const version of [1,10,27,40]) {
    const decoded = decodeMatrix(qryptKanji(kanji,{version}).matrix())
    assert.equal(decoded.text,'茗荷')
    assert.equal(decoded.segments[0].mode,'kanji')
    assert.deepEqual([...decoded.segments[0].shiftJIS],[...kanji])
  }
})

test('Kanji rejects malformed byte pairs', () => {
  for (const bytes of [[],[0x81],[0x7f,0x7f],[0x81,0x7f],[0xed,0x40]]) {
    assert.throws(()=>qryptKanji(Uint8Array.from(bytes)))
  }
})

test('GS1 FNC1 first-position retains separators and literal percent', () => {
  const text='01095011015300031725010110BATCH%2\x1d21SERIAL5'
  for (const version of [2,10,27,40]) {
    const decoded=decodeMatrix(qryptGS1(text,{version,errorCorrectionLevel:'L'}).matrix())
    assert.equal(decoded.text,text)
    assert.equal(decoded.fnc1,'gs1')
  }
  assert.throws(()=>qryptGS1(''),/empty/)
  assert.throws(()=>qryptGS1('a123'),/alphanumeric/)
  assert.throws(()=>qryptGS1('ABC\n'),/alphanumeric/)
  assert.throws(()=>qryptGS1('X'.repeat(3000),{errorCorrectionLevel:'H'}),/exceeds/)
})

test('structured append carries ordered indices, shared parity, and reassembles out-of-order', () => {
  const parts=[Uint8Array.from([0,255,19]), Uint8Array.from([4,0,0x88]),Uint8Array.from([55,1,255])]
  const encoded=qryptStructuredAppend(parts,{errorCorrectionLevel:'M'})
  const decoded=encoded.map(qr=>decodeMatrix(qr.matrix()))
  assert.equal(encoded.length,3)
  for(let i=0;i<3;i++) {
    assert.equal(decoded[i].structuredAppend.index,i)
    assert.equal(decoded[i].structuredAppend.total,3)
  }
  const result=assembleStructuredAppend([decoded[2],decoded[0],decoded[1]])
  assert.deepEqual([...result],parts.flatMap(part=>[...part]))
  assert.throws(()=>assembleStructuredAppend([decoded[0],decoded[0],decoded[2]]),/Duplicate|mixed/)
  assert.throws(()=>assembleStructuredAppend([decoded[0],decoded[1]]),/Incomplete/)
})

test('structured append rejects oversized or invalid sets',()=>{
  assert.throws(()=>qryptStructuredAppend([Uint8Array.of(1)]),/2 to 16/)
  assert.throws(()=>qryptStructuredAppend(Array.from({length:17},()=>Uint8Array.of(1))),/2 to 16/)
  assert.throws(()=>qryptStructuredAppend([Uint8Array.of(1),new Uint8Array(0)]),/nonempty/)
  assert.throws(()=>qryptStructuredAppend([Uint8Array.of(1),Uint8Array.of(2)],{version:99}),/version/)
})

test('legacy qrypt() encoding and decoding remain unchanged',()=>{
  for (const text of ['HELLO','Hi😀','', '1234567 ABC xyz']) {
    const before=qrypt(text,{errorCorrectionLevel:'H'})
    const after=decodeMatrix(before.matrix())
    assert.equal(after.text,text)
    assert.equal(after.fnc1,undefined)
    assert.equal(after.structuredAppend,undefined)
  }
})
