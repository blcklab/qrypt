// Offline, dependency-free verification against fixture values produced by
// the independent Python qrcode package. Runs on the compiled TS source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gfMultiply, generatorPolynomial, reedSolomonRemainder } from '../.m3-check/ecc/reed-solomon.js'
import { interleaveWithErrorCorrection } from '../.m3-check/ecc/interleave.js'
import { getDataCodewords, getECCLayout, getRawDataModules } from '../.m3-check/encoding/capacity.js'
import { planEncoding } from '../.m3-check/encoding/plan.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/reference-ecc.json', import.meta.url), 'utf8'))
const levels = ['L', 'M', 'Q', 'H']
const seeds = { L: 3, M: 5, Q: 7, H: 11 }

function referenceInput(version, level) {
  return Uint8Array.from({ length: getDataCodewords(version, level) }, (_, i) =>
    (i * 149 + (i >>> 1) * 31 + version * 17 + seeds[level] * 43) & 255)
}

function unweave(codewords, version, level) {
  const { blockCount, eccCodewordsPerBlock: ecc } = getECCLayout(version, level)
  const shortTotal = Math.floor(codewords.length / blockCount)
  const shortCount = blockCount - codewords.length % blockCount
  const lengths = Array.from({ length: blockCount }, (_, i) => shortTotal - ecc + (i >= shortCount ? 1 : 0))
  const dataBlocks = lengths.map(len => new Uint8Array(len))
  const eccBlocks = lengths.map(() => new Uint8Array(ecc))
  let offset = 0
  for (let col = 0; col < Math.max(...lengths); col++) {
    for (let block = 0; block < blockCount; block++) {
      if (col < lengths[block]) dataBlocks[block][col] = codewords[offset++]
    }
  }
  for (let col = 0; col < ecc; col++) {
    for (let block = 0; block < blockCount; block++) eccBlocks[block][col] = codewords[offset++]
  }
  assert.equal(offset, codewords.length)
  return { dataBlocks, eccBlocks }
}

test('GF(256) known-answer multiplication vectors from an independent reference', () => {
  for (const [a, b, expected] of fixture.gf) {
    assert.equal(gfMultiply(a, b), expected, `${a} * ${b}`)
    assert.equal(gfMultiply(b, a), expected, `${b} * ${a}`)
  }
})

test('Reed–Solomon generator polynomials match independent known-answer coefficients', () => {
  for (const [degree, expected] of Object.entries(fixture.generator)) {
    assert.deepEqual([...generatorPolynomial(Number(degree))], expected)
  }
  for (const invalid of [0, -1, 1.5, 256, Infinity, NaN]) {
    assert.throws(() => generatorPolynomial(invalid), /degree/)
  }
})

test('RS remainder has exact expected width (including all-zero parity)', () => {
  assert.deepEqual([...reedSolomonRemainder(new Uint8Array(20), 7)], Array(7).fill(0))
  assert.equal(reedSolomonRemainder(Uint8Array.of(1, 2, 3), 30).length, 30)
})

test('all 160 version / error-correction interleavings match independent SHA-256 digests', () => {
  let checked = 0
  for (const level of levels) {
    for (let version = 1; version <= 40; version++) {
      const data = referenceInput(version, level)
      const copy = data.slice()
      const encoded = interleaveWithErrorCorrection(data, version, level)
      const hash = createHash('sha256').update(encoded).digest('hex')
      assert.equal(hash, fixture.digests[level][version - 1], `QR ${version}-${level}`)
      assert.equal(encoded.length, Math.floor(getRawDataModules(version) / 8))
      assert.deepEqual(data, copy, 'Input must not be mutated')
      checked++
    }
  }
  assert.equal(checked, 160)
})

test('unweaving reconstructs each complete data block and parity block', () => {
  for (const [version, level] of [[1,'L'],[5,'Q'],[10,'H'],[27,'M'],[40,'H']]) {
    const original = referenceInput(version, level)
    const result = interleaveWithErrorCorrection(original, version, level)
    const { dataBlocks, eccBlocks } = unweave(result, version, level)
    const flattened = Uint8Array.from(dataBlocks.flatMap(block => [...block]))
    assert.deepEqual(flattened, original)
    for (let i = 0; i < dataBlocks.length; i++) {
      assert.deepEqual(eccBlocks[i], reedSolomonRemainder(dataBlocks[i], eccBlocks[i].length))
    }
  }
})

test('known full QR codewords agree with independent numeric/alphanumeric/byte encodings', () => {
  for (const key of Object.keys(fixture.knownCodewords)) {
    const [version, level, ...parts] = key.split('-')
    const input = parts.join('-')
    const plan = planEncoding(input, level, Number(version))
    assert.deepEqual([...plan.interleavedCodewords], fixture.knownCodewords[key], key)
    assert.equal(plan.dataCodewords.length, getDataCodewords(Number(version), level))
  }
})

test('rejects incomplete/oversized/wrongly-typed data blocks and invalid QR versions', () => {
  assert.throws(() => interleaveWithErrorCorrection(new Uint8Array(18), 1, 'L'), /exactly 19/)
  assert.throws(() => interleaveWithErrorCorrection(new Uint8Array(20), 1, 'L'), /exactly 19/)
  assert.throws(() => interleaveWithErrorCorrection([1,2,3], 1, 'L'), /data codewords/)
  assert.throws(() => interleaveWithErrorCorrection(new Uint8Array(19), 0, 'L'), /version/)
})

test('planEncoding exposes deterministic interleaved output while public QR API stays unfinished', () => {
  const first = planEncoding('Hello 😀', 'H')
  const second = planEncoding('Hello 😀', 'H')
  assert.deepEqual(first.interleavedCodewords, second.interleavedCodewords)
  assert.equal(first.interleavedCodewords.length, Math.floor(getRawDataModules(first.version) / 8))
  assert.ok(first.utf8ECI)
})
