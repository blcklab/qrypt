/** Emit controlled-version, mask-selected raw-byte QR matrices for Python comparison. */
import { qryptBytes } from '../.m18-check/advanced.js'
const checks = []
const sample = Uint8Array.from([0, 42, 255, 128, 1])
for (const version of [1, 2, 7, 9, 10, 26, 27, 40]) {
  for (const level of ['L', 'M', 'Q', 'H']) {
    const symbol = qryptBytes(sample, { version, errorCorrectionLevel: level })
    checks.push({ version, level, mask: symbol.mask, bytes: [...sample], matrix: symbol.matrix().map(row => row.map(Number)) })
  }
}
process.stdout.write(JSON.stringify(checks))
