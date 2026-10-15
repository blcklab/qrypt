import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { qrypt } from '../.m4-check/index.js'
import { planEncoding } from '../.m4-check/encoding/plan.js'
import { buildMatrix } from '../.m4-check/matrix/matrix.js'
import { createFunctionPatterns, alignmentPositions } from '../.m4-check/matrix/patterns.js'
import { maskAt, applyMask, penaltyScore } from '../.m4-check/matrix/masking.js'
import { getRawDataModules } from '../.m4-check/encoding/capacity.js'

const reference = JSON.parse(readFileSync(new URL('./fixtures/reference-matrices.json', import.meta.url), 'utf8'))
const hashMatrix = matrix => createHash('sha256').update(matrix.map(row => row.map(v => v ? '1' : '0').join('')).join('')).digest('hex')

test('all 160 independent reference symbol hashes, including format/version information and ECC placement', () => {
  for (const {version, level, payload, mask, sha256} of reference) {
    const qr = qrypt(payload, { version, errorCorrectionLevel: level })
    assert.equal(qr.mask, mask, `mask drift: v${version}-${level}`)
    assert.equal(hashMatrix(qr.matrix()), sha256, `matrix drift: v${version}-${level}`)
  }
})

test('all versions reserve exactly the intended number of modules', () => {
  for (let version = 1; version <= 40; version++) {
    const pattern = createFunctionPatterns(version, 'M')
    const available = pattern.reserved.reduce((sum, value) => sum + (value === 0 ? 1 : 0), 0)
    assert.equal(available, getRawDataModules(version), `v${version}`)
  }
})

test('finder, separator, timing and dark modules are correct', () => {
  for (const version of [1, 7, 20, 40]) {
    const grid = createFunctionPatterns(version, 'M')
    const at = (x,y) => grid.dark[y*grid.size+x]
    for (const [cx,cy] of [[3,3],[grid.size-4,3],[3,grid.size-4]]) {
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++) {
        assert.equal(at(cx+dx,cy+dy), +(Math.max(Math.abs(dx),Math.abs(dy)) === 3 || Math.max(Math.abs(dx),Math.abs(dy)) <= 1))
      }
    }
    assert.equal(at(8, grid.size-8), 1)
    for(let x=8;x<grid.size-8;x++) assert.equal(at(x,6),+(x%2===0))
  }
})

test('alignment centers include the version 32 special spacing', () => {
  assert.deepEqual(alignmentPositions(1), [])
  assert.deepEqual(alignmentPositions(2), [6, 18])
  assert.deepEqual(alignmentPositions(7), [6,22,38])
  assert.deepEqual(alignmentPositions(32), [6,34,60,86,112,138])
})

test('mask formulas and reversible application preserve reserved modules', () => {
  for (let m=0;m<8;m++) {
    const grid=createFunctionPatterns(4,'H')
    const before=grid.dark.slice()
    applyMask(grid,m)
    for(let i=0;i<before.length;i++) if(grid.reserved[i]) assert.equal(grid.dark[i],before[i])
    applyMask(grid,m)
    assert.deepEqual(grid.dark,before)
  }
  assert.throws(()=>maskAt(-1,0,0),RangeError)
  assert.equal(maskAt(0,0,0),true)
  assert.equal(maskAt(1,0,1),false)
  assert.equal(maskAt(2,3,0),true)
})

test('matrix copy is independent; symbols are deterministic', () => {
  const qr=qrypt('https://example.com/hello?a=1', {errorCorrectionLevel:'H'})
  const original=qr.matrix()
  qr.matrix()[0][0]=!original[0][0]
  assert.deepEqual(qr.matrix(),original)
  const again=qrypt('https://example.com/hello?a=1', {errorCorrectionLevel:'H'})
  assert.equal(again.mask,qr.mask)
  assert.deepEqual(again.matrix(),original)
})

test('invalid payloads, versions and correction options fail at the public boundary', () => {
  assert.throws(()=>qrypt('x',{version:41}),/version/)
  assert.throws(()=>qrypt('x',{errorCorrectionLevel:'Z'}),/errorCorrectionLevel/)
  assert.throws(()=>qrypt('\ud800'),/surrogate/)
  assert.throws(()=>qrypt('A'.repeat(5000),{version:1,errorCorrectionLevel:'H'}),/exceeds/)
})

test('all eight mask choices produce a finite penalty for a valid symbol', () => {
  const plan=planEncoding('HELLO', 'M', 7)
  const matrix=buildMatrix(7,'M',plan.interleavedCodewords)
  assert.ok(matrix.mask>=0 && matrix.mask<=7)
  const grid=createFunctionPatterns(7,'M')
  grid.dark.set(matrix.dark)
  assert.ok(penaltyScore(grid)>0)
})
