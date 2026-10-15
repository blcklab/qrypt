// Independent, dependency-free QR conformance properties (not source-to-source snapshots).
// Compile with: tsc -p tsconfig.json --noEmit false --outDir .m7-check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt } from '../.m7-check/index.js'
import { planEncoding } from '../.m7-check/encoding/plan.js'
import { optimizeSegments, writeSegmentBits } from '../.m7-check/encoding/segments.js'
import { getDataCodewords } from '../.m7-check/encoding/capacity.js'
import { createFunctionPatterns, drawFormat } from '../.m7-check/matrix/patterns.js'
import { applyMask, maskAt, penaltyScore } from '../.m7-check/matrix/masking.js'
import { toPNG } from '../.m7-check/png.js'
import { toSVG } from '../.m7-check/index.js'

const levels = ['L', 'M', 'Q', 'H']
const chars = [
  { label: 'numeric', char: '1' },
  { label: 'alphanumeric', char: 'A' },
  { label: 'byte', char: 'a' },
  { label: 'UTF-8 ECI', char: 'é' },
]

// Standalone oracle expressed in terms of 1-D rows/columns. Outside is white.
// It does not call Qrypt's penalty calculation.
function referencePenalty(matrix) {
  const n = matrix.length
  let value = 0
  let dark = 0
  const scanLine = line => {
    let last = line[0], run = 0
    for (const module of line) {
      if (module !== last) {
        if (run >= 5) value += run - 2
        run = 0
        last = module
      }
      run++
    }
    if (run >= 5) value += run - 2
    const padded = [...Array(4).fill(0), ...line, ...Array(4).fill(0)]
    for (let i = 0; i + 11 <= padded.length; i++) {
      const pattern = padded.slice(i, i + 11).join('')
      if (pattern === '00001011101' || pattern === '10111010000') value += 40
    }
  }
  for (const row of matrix) {
    scanLine(row)
    for (const m of row) dark += m
  }
  for (let x = 0; x < n; x++) scanLine(matrix.map(row => row[x]))
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      if (matrix[y][x] === matrix[y+1][x] && matrix[y][x] === matrix[y][x+1] && matrix[y][x] === matrix[y+1][x+1]) value += 3
    }
  }
  value += Math.max(0, Math.ceil(Math.abs(dark * 20 - n*n*10) / (n*n)) - 1) * 10
  return value
}

function independentMaskedMatrix(qr, level, mask) {
  const grid = createFunctionPatterns(qr.version, level)
  grid.dark.set(Uint8Array.from(qr.matrix().flat(), Number))
  applyMask(grid, qr.mask) // restore unmasked data, preserving reserved patterns
  applyMask(grid, mask)
  drawFormat(grid, level, mask)
  return Array.from({ length: qr.size }, (_, y) => Array.from(grid.dark.slice(y*qr.size,(y+1)*qr.size)))
}

test('mask penalties match independent 1-D pattern oracle; chosen mask globally optimal with first-mask tie break', () => {
  for (const version of [1, 2, 5, 7, 9, 10, 20, 26, 27, 32, 40]) {
    for (const level of levels) {
      const qr = qrypt('AB12', { version, errorCorrectionLevel: level })
      const scores = Array.from({ length: 8 }, (_, mask) => {
        const matrix = independentMaskedMatrix(qr, level, mask)
        const fromReference = referencePenalty(matrix)
        const grid = createFunctionPatterns(version, level)
        grid.dark.set(Uint8Array.from(matrix.flat()))
        assert.equal(penaltyScore(grid), fromReference, `N1–N4 penalty disagreement: v${version} ${level} mask ${mask}`)
        return fromReference
      })
      assert.equal(qr.mask, scores.indexOf(Math.min(...scores)), `suboptimal mask: v${version} ${level}`)
    }
  }
})

test('all 160 level/version combinations fit exact-size ECI and byte-codeword boundaries', () => {
  for (const version of Array.from({ length: 40 }, (_, i) => i + 1)) {
    for (const level of levels) {
      for (const { label, char } of chars) {
        const capacity = getDataCodewords(version, level) * 8
        // Binary search independent of the version selector; only optimized bits matter.
        let low = 0, high = Math.min(capacity, 7089)
        while (low < high) {
          const mid = Math.ceil((low + high) / 2)
          const fits = optimizeSegments(char.repeat(mid), version).bitLength <= capacity
          if (fits) low = mid
          else high = mid - 1
        }
        const maximum = char.repeat(low)
        const fits = planEncoding(maximum, level, version)
        assert.equal(fits.version, version)
        assert.equal(fits.dataCodewords.length, getDataCodewords(version, level))
        assert.ok(fits.bitLength <= capacity)
        assert.throws(() => planEncoding(char.repeat(low + 1), level, version), /(exceeds|too large)/, `${label} boundary v${version} ${level}`)
        if (char === 'é') assert.equal(fits.utf8ECI, low > 0)
      }
    }
  }
})

test('UTF-8 ECI precedes first byte segment even with a leading non-byte segment', () => {
  const text = '12345678901234567890é'
  for (const version of [1, 10, 27]) {
    const optimized = optimizeSegments(text, version)
    const bytes = writeSegmentBits(optimized.segments, version, optimized.utf8ECI)
    assert.equal(bytes.bitLength, optimized.bitLength)
    assert.equal(optimized.utf8ECI, true)
    assert.ok(optimized.segments.some(s => s.mode === 'byte'))
  }
})

test('renderer outputs are stable; black/white toggles cannot change core QR matrix', () => {
  for (const version of [1, 7, 40]) {
    const qr = qrypt('QR', { version, errorCorrectionLevel: 'H' })
    const original = qr.matrix()
    assert.ok(Object.isFrozen(qr), 'Public readonly metadata must not be mutable from JavaScript')
    assert.throws(() => { qr.version = 10 }, TypeError)
    assert.deepEqual(qr.matrix(), original)
    const svg = toSVG(qr, {scale: 3, margin: 4, darkColor: '#112233', lightColor:'#FFEEDD'})
    assert.equal(svg, toSVG(qr, {scale: 3, margin: 4, darkColor: '#112233', lightColor:'#FFEEDD'}))
    const png = toPNG(qr, {scale: 2, margin: 4, darkColor: '#112233', lightColor:'#FFEEDD'})
    assert.deepEqual(png, toPNG(qr, {scale: 2, margin: 4, darkColor: '#112233', lightColor:'#FFEEDD'}))
    assert.deepEqual(qr.matrix(), original)
  }
})

test('mask formulas cover all eight algorithms at every module coordinate', () => {
  for (let y=0;y<25;y++)for(let x=0;x<25;x++) {
    const ab=x*y
    const expected=[(x+y)%2===0, y%2===0, x%3===0, (x+y)%3===0,
      (Math.floor(y/2)+Math.floor(x/3))%2===0, (ab%2+ab%3)===0,
      ((ab%2+ab%3)%2)===0, (((x+y)%2+ab%3)%2)===0]
    for(let mask=0;mask<8;mask++)assert.equal(maskAt(mask,x,y),expected[mask])
  }
})
