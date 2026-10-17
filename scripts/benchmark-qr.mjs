/** Non-gating, reproducible local performance measurements. Not a score or certification. */
import { performance } from 'node:perf_hooks'
import { qrypt } from '../.m19-check/index.js'
import { qryptBytes } from '../.m19-check/advanced.js'
import { toSVG } from '../.m19-check/index.js'
import { toPNG } from '../.m19-check/png.js'
import { toPixels } from '../.m19-check/render.js'
import { decodeMatrix, decodePixels } from '../.m19-check/decode.js'

function measure(name, run, iterations) {
  const samples = []
  for (let i=0;i<iterations+2;i++) {
    const start=performance.now()
    run()
    if (i>=2) samples.push(performance.now()-start)
  }
  samples.sort((a,b)=>a-b)
  const med=samples[Math.floor(samples.length/2)]
  const p95=samples[Math.min(samples.length-1,Math.ceil(samples.length*.95)-1)]
  console.log(`${name.padEnd(27)} median ${med.toFixed(2).padStart(8)} ms   p95 ${p95.toFixed(2).padStart(8)} ms   n=${iterations}`)
}
console.log(`Qrypt M19 local performance snapshot — Node ${process.version}; ${process.platform}/${process.arch}`)
const small = qrypt('https://blcklab.example/qrypt')
const medium = qrypt('SECURE-TICKET-'.repeat(22), {errorCorrectionLevel:'H'})
const max = qryptBytes(new Uint8Array(2953), {errorCorrectionLevel:'L'})
measure('encode small', () => qrypt('https://blcklab.example/qrypt'), 35)
measure('encode medium/H', () => qrypt('SECURE-TICKET-'.repeat(22), {errorCorrectionLevel:'H'}), 12)
measure('encode maximum 2953B/L', () => qryptBytes(new Uint8Array(2953), {errorCorrectionLevel:'L'}), 3)
measure('decode matrix medium', () => decodeMatrix(medium.matrix()), 20)
measure('decode matrix V40-L', () => decodeMatrix(max.matrix()), 4)
measure('render SVG small', () => toSVG(small), 30)
measure('render PNG small', () => toPNG(small), 15)
const pixels = toPixels(small, {scale:6})
measure('decode RGBA small', () => decodePixels(pixels), 7)
console.log(`Examples: ${Buffer.byteLength(toSVG(small))} bytes SVG, ${toPNG(small).length} bytes PNG; image ${pixels.width}×${pixels.height}`)
console.log(`Heap used: ${(process.memoryUsage().heapUsed/1048576).toFixed(1)} MiB (not peak)`)
console.log('Informational only: results vary by CPU, Node version, JIT warmup and load.')
