// A dependency-free foundation smoke suite, runnable before Vitest is installed.
// This does NOT test QR encoding correctness.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt, toSVG } from '../.foundation-check/index.js'
import { normalizeOptions, validateText } from '../.foundation-check/validation.js'

test('public entry points are available', () => {
  assert.equal(typeof qrypt, 'function')
  assert.equal(typeof toSVG, 'function')
})

test('the unimplemented encoder fails loudly', () => {
  assert.throws(() => qrypt('hello'), /encoder is not implemented/)
})

test('the unimplemented renderer fails loudly', () => {
  assert.throws(() => toSVG({}), /SVG rendering is not implemented/)
})

test('empty string and correct Unicode pairs are allowed', () => {
  assert.doesNotThrow(() => validateText(''))
  assert.doesNotThrow(() => validateText('hello 🌐'))
})

test('lone UTF-16 surrogates are rejected', () => {
  assert.throws(() => qrypt('\ud800'), /unpaired high surrogate/)
  assert.throws(() => qrypt('\udc00'), /unpaired low surrogate/)
  assert.throws(() => qrypt('\ud800hello'), /unpaired high surrogate/)
})

test('non-string input is rejected', () => {
  assert.throws(() => qrypt(42), /must be a string/)
  assert.throws(() => qrypt(null), /must be a string/)
})

test('encoding defaults are stable', () => {
  assert.deepEqual(normalizeOptions(), { version: 'auto', errorCorrectionLevel: 'M' })
})

test('explicit encoding settings are respected', () => {
  assert.deepEqual(normalizeOptions({ version: 40, errorCorrectionLevel: 'H' }), {
    version: 40, errorCorrectionLevel: 'H',
  })
})

test('invalid versions are rejected', () => {
  for (const version of [-1, 0, 41, NaN, Infinity, 1.1, null, '2']) {
    assert.throws(() => qrypt('x', { version }), /version must/)
  }
})

test('invalid error correction is rejected', () => {
  for (const errorCorrectionLevel of [null, 'X', 1]) {
    assert.throws(() => qrypt('x', { errorCorrectionLevel }), /errorCorrectionLevel/)
  }
})

test('unknown options and non-plain objects are rejected', () => {
  assert.throws(() => qrypt('x', { errorCorrection: 'M' }), /Unknown Qrypt option/)
  assert.throws(() => qrypt('x', []), /plain object/)
  assert.throws(() => qrypt('x', new Date()), /plain object/)
})
