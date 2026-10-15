// Dependency-free runtime conformance tests using compiled ESM, not TypeScript source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrypt, toSVG } from '../.m5-check/index.js'

function parseStrips(svg, qr, margin, scale) {
  const side = qr.size + 2 * margin
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.ok(svg.includes(`width="${side * scale}" height="${side * scale}" viewBox="0 0 ${side} ${side}"`))
  assert.ok(svg.includes(`shape-rendering="crispEdges"`))
  const match = /<path fill="#[0-9A-Fa-f]{6}" d="([^"]*)"\/>/.exec(svg)
  assert.ok(match, 'missing dark-module path')
  const result = Array.from({ length: side }, () => Array(side).fill(false))
  const cmds = match[1].trim() ? match[1].trim().split(' ') : []
  // Each path command is Mx y hN v1 h-N z; scan each whole command explicitly.
  const pattern = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g
  let matchCount = 0
  for (const cmd of match[1].matchAll(pattern)) {
    const [, xs, ys, widths, back] = cmd
    const x = Number(xs), y = Number(ys), width = Number(widths)
    assert.equal(width, Number(back))
    assert.ok(width > 0)
    assert.ok(x >= margin && x + width <= side - margin)
    assert.ok(y >= margin && y < side - margin)
    for (let xx = x; xx < x + width; xx++) {
      assert.equal(result[y][xx], false, 'overlapping path segments')
      result[y][xx] = true
    }
    matchCount++
  }
  assert.equal(cmds.length, matchCount * 2, 'SVG path contains an unexpected command')
  const modules = qr.matrix()
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const expected = x >= margin && x < side - margin && y >= margin && y < side - margin
        ? modules[y - margin][x - margin] : false
      assert.equal(result[y][x], expected, `module mismatch at ${x},${y}`)
    }
  }
}

test('default dimensions, quiet zone, and known first symbol', () => {
  const qr = qrypt('Hi', { version: 1 })
  const svg = toSVG(qr)
  assert.ok(svg.includes('width="232" height="232" viewBox="0 0 29 29"'))
  assert.ok(svg.includes('<rect width="29" height="29" fill="#FFFFFF"/>'))
  parseStrips(svg, qr, 4, 8)
})

test('all L/M/Q/H and selected versions render module-for-module', () => {
  for (const version of [1, 7, 22, 40]) {
    for (const errorCorrectionLevel of ['L', 'M', 'Q', 'H']) {
      const qr = qrypt('QR', { version, errorCorrectionLevel })
      parseStrips(toSVG(qr, { margin: 5, scale: 3 }), qr, 5, 3)
    }
  }
})

test('no border with zero margin; custom colors are literal and safe', () => {
  const qr = qrypt('https://example.com')
  const svg = toSVG(qr, { scale: 1, margin: 0, darkColor: '#aB12f0', lightColor: '#FeaC09' })
  assert.ok(svg.includes(`viewBox="0 0 ${qr.size} ${qr.size}"`))
  assert.ok(svg.includes(`fill="#aB12f0"`))
  assert.ok(svg.includes(`fill="#FeaC09"`))
  parseStrips(svg, qr, 0, 1)
})

test('SVG is deterministic and never embeds the input string', () => {
  const input = '<script>alert("x")</script> & "'
  const qr = qrypt(input)
  const a = toSVG(qr)
  assert.equal(a, toSVG(qr))
  assert.equal(a, toSVG(qrypt(input)))
  assert.ok(!a.includes('<script>'))
  assert.ok(!a.includes('alert('))
})

test('rejects invalid renderer inputs and unknown settings', () => {
  const qr = qrypt('test')
  for (const opts of [null, [], new Date(), 'text', { extra: 1 }]) {
    assert.throws(() => toSVG(qr, opts), /SVG options|Unknown SVG option/)
  }
  for (const scale of [0, -1, 1.1, NaN, Infinity, '4', null, 65536]) {
    assert.throws(() => toSVG(qr, { scale }), /SVG scale|SVG dimensions/)
  }
  for (const margin of [-1, 1.3, Infinity, '4', NaN, 1000000]) {
    assert.throws(() => toSVG(qr, { margin }), /SVG margin|SVG dimensions/)
  }
  for (const darkColor of ['', 'red', '#123', '#FF000000', '#123456" onload="alert(1)', 42, null]) {
    assert.throws(() => toSVG(qr, { darkColor }), /SVG darkColor/)
  }
  for (const lightColor of ['transparent', 'url(x)', '#12345x', {}, null]) {
    assert.throws(() => toSVG(qr, { lightColor }), /SVG lightColor/)
  }
})

test('rejects malformed or forged QR result without injecting arbitrary markup', () => {
  const qr = qrypt('hello')
  assert.throws(() => toSVG(null), /valid Qrypt/)
  assert.throws(() => toSVG({}), /valid Qrypt/)
  assert.throws(() => toSVG({ ...qr, size: 999999999 }), /valid Qrypt/)
  assert.throws(() => toSVG({ ...qr, matrix: () => [] }), /exactly size rows/)
  assert.throws(() => toSVG({ ...qr, matrix: () => [[], ...qr.matrix().slice(1)] }), /exactly size modules/)
  assert.throws(() => toSVG({ ...qr, matrix: () => qr.matrix().map(row => row.map(() => 'x')) }), /must be a boolean/)
})
