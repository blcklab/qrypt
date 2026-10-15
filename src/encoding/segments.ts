import { BitBuffer } from './bits.js'
import { toUTF8Bytes, utf8Width } from './utf8.js'

export type DataMode = 'numeric' | 'alphanumeric' | 'byte'

export interface DataSegment {
  readonly mode: DataMode
  readonly text: string
  /** Character count in numeric/alphanumeric mode, UTF-8 byte count in byte mode. */
  readonly count: number
}

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
const INDICATORS: Record<DataMode, number> = { numeric: 1, alphanumeric: 2, byte: 4 }

export function countBits(mode: DataMode, version: number): number {
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2
  const widths = mode === 'numeric' ? [10, 12, 14] : mode === 'alphanumeric' ? [9, 11, 13] : [8, 16, 16]
  return widths[group]!
}

export function payloadBits(mode: DataMode, count: number): number {
  if (mode === 'numeric') return Math.floor(count / 3) * 10 + [0, 4, 7][count % 3]!
  if (mode === 'alphanumeric') return Math.floor(count / 2) * 11 + (count % 2) * 6
  return count * 8
}

/** One deque per start-position residue: O(n) DP over a version group. */
class CandidateQueue {
  private readonly indices: number[] = []
  private readonly weights: number[] = []
  private readonly segments: number[] = []
  private head = 0

  clear(): void {
    this.indices.length = 0
    this.weights.length = 0
    this.segments.length = 0
    this.head = 0
  }

  add(index: number, weight: number, segmentCount: number): void {
    // Older equally good candidates are preferred (fewer mode changes).
    while (this.indices.length > this.head) {
      const last = this.indices.length - 1
      const lastWeight = this.weights[last]!
      const lastSegments = this.segments[last]!
      if (lastWeight < weight || (lastWeight === weight && lastSegments <= segmentCount)) break
      this.indices.pop()
      this.weights.pop()
      this.segments.pop()
    }
    if (this.indices.length === this.head) this.clear()
    this.indices.push(index)
    this.weights.push(weight)
    this.segments.push(segmentCount)
  }

  best(minIndex: number): number | undefined {
    while (this.head < this.indices.length && this.indices[this.head]! < minIndex) this.head++
    if (this.head === this.indices.length) {
      this.clear()
      return undefined
    }
    return this.indices[this.head]
  }
}

export interface OptimizedSegments {
  readonly segments: readonly DataSegment[]
  readonly bitLength: number
  readonly utf8ECI: boolean
}

/**
 * Optimal numeric/alphanumeric/byte segmentation with version-specific headers.
 * Each DP step considers all valid preceding segment starts in amortized O(1),
 * using modular payload-bit costs and monotonic queues. Tie-breaks are stable.
 */
export function optimizeSegments(text: string, version: number): OptimizedSegments {
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new RangeError('Invalid QR version.')
  // More than 14,178 UTF-16 code units must contain >7,089 Unicode scalars.
  // Reject before allocating a scalar array for arbitrarily large input.
  if (text.length > 14_178) throw new RangeError('QR payload is too large for any Model 2 version.')
  const chars = Array.from(text)
  const n = chars.length
  if (n > 7089) throw new RangeError('QR payload is too large for any Model 2 version.')
  const prefixBytes = new Uint32Array(n + 1)
  let utf8ECI = false
  for (let i = 0; i < n; i++) {
    const scalar = chars[i]!
    if (scalar.codePointAt(0)! > 127) utf8ECI = true
    prefixBytes[i + 1] = prefixBytes[i]! + utf8Width(scalar)
  }

  const dp = new Float64Array(n + 1)
  const dpSegments = new Uint16Array(n + 1)
  const previous = new Int32Array(n + 1)
  const previousMode: DataMode[] = new Array(n + 1)
  const numericQueues = [new CandidateQueue(), new CandidateQueue(), new CandidateQueue()]
  const alphaQueues = [new CandidateQueue(), new CandidateQueue()]
  const byteQueue = new CandidateQueue()
  const numericWidth = countBits('numeric', version)
  const alphaWidth = countBits('alphanumeric', version)
  const byteWidth = countBits('byte', version)
  const maxNumeric = 2 ** numericWidth - 1
  const maxAlpha = 2 ** alphaWidth - 1
  const maxBytes = 2 ** byteWidth - 1
  let byteMinIndex = 0

  for (let i = 1; i <= n; i++) {
    const j = i - 1
    const character = chars[j]!
    const isNumeric = character.length === 1 && character >= '0' && character <= '9'
    const isAlpha = character.length === 1 && ALPHANUMERIC.includes(character)

    if (!isNumeric) {
      for (const queue of numericQueues) queue.clear()
    } else {
      numericQueues[j % 3]!.add(j, dp[j]! - 10 * Math.floor(j / 3), dpSegments[j]!)
    }

    if (!isAlpha) {
      for (const queue of alphaQueues) queue.clear()
    } else {
      alphaQueues[j % 2]!.add(j, dp[j]! - 11 * Math.floor(j / 2), dpSegments[j]!)
    }

    byteQueue.add(j, dp[j]! - prefixBytes[j]! * 8, dpSegments[j]!)
    while (prefixBytes[i]! - prefixBytes[byteMinIndex]! > maxBytes) byteMinIndex++

    let bestCost = Infinity
    let bestSegments = Infinity
    let bestStart = -1
    let bestMode: DataMode = 'byte'
    const consider = (mode: DataMode, start: number | undefined, headerWidth: number): void => {
      if (start === undefined) return
      const count = mode === 'byte' ? prefixBytes[i]! - prefixBytes[start]! : i - start
      const cost = dp[start]! + 4 + headerWidth + payloadBits(mode, count)
      const segments = dpSegments[start]! + 1
      if (cost < bestCost || (cost === bestCost && segments < bestSegments)) {
        bestCost = cost
        bestSegments = segments
        bestStart = start
        bestMode = mode
      }
    }

    if (isNumeric) {
      for (const queue of numericQueues) consider('numeric', queue.best(i - maxNumeric), numericWidth)
    }
    if (isAlpha) {
      for (const queue of alphaQueues) consider('alphanumeric', queue.best(i - maxAlpha), alphaWidth)
    }
    consider('byte', byteQueue.best(byteMinIndex), byteWidth)

    if (bestStart < 0) throw new Error('No valid encoding transition found.')
    dp[i] = bestCost
    dpSegments[i] = bestSegments
    previous[i] = bestStart
    previousMode[i] = bestMode
  }

  const segments: DataSegment[] = []
  for (let end = n; end > 0;) {
    const start = previous[end]!
    const mode = previousMode[end]!
    segments.push({
      mode,
      text: chars.slice(start, end).join(''),
      count: mode === 'byte' ? prefixBytes[end]! - prefixBytes[start]! : end - start,
    })
    end = start
  }
  segments.reverse()
  return { segments, bitLength: dp[n]! + (utf8ECI ? 12 : 0), utf8ECI }
}

/** Writes the data portion only; includes ECI 00000111 + assignment 26 when needed. */
export function writeSegmentBits(segments: readonly DataSegment[], version: number, utf8ECI: boolean): BitBuffer {
  const buffer = new BitBuffer()
  let wroteECI = false
  for (const segment of segments) {
    if (segment.mode === 'byte' && utf8ECI && !wroteECI) {
      buffer.write(0b0111, 4)
      buffer.write(26, 8)
      wroteECI = true
    }
    const width = countBits(segment.mode, version)
    if (segment.count >= 2 ** width) throw new RangeError('QR segment count exceeds version field width.')
    buffer.write(INDICATORS[segment.mode], 4)
    buffer.write(segment.count, width)
    if (segment.mode === 'byte') {
      const bytes = toUTF8Bytes(segment.text)
      if (bytes.length !== segment.count) throw new Error('Internal UTF-8 segment count mismatch.')
      for (const byte of bytes) buffer.write(byte, 8)
    } else if (segment.mode === 'numeric') {
      for (let i = 0; i < segment.text.length; i += 3) {
        const part = segment.text.slice(i, i + 3)
        buffer.write(Number(part), part.length === 3 ? 10 : part.length === 2 ? 7 : 4)
      }
    } else {
      let i = 0
      for (; i + 1 < segment.text.length; i += 2) {
        const first = ALPHANUMERIC.indexOf(segment.text[i]!)
        const second = ALPHANUMERIC.indexOf(segment.text[i + 1]!)
        if (first < 0 || second < 0) throw new Error('Internal invalid alphanumeric segment.')
        buffer.write(first * 45 + second, 11)
      }
      if (i < segment.text.length) {
        const value = ALPHANUMERIC.indexOf(segment.text[i]!)
        if (value < 0) throw new Error('Internal invalid alphanumeric segment.')
        buffer.write(value, 6)
      }
    }
  }
  if (utf8ECI && !wroteECI) throw new Error('Internal missing UTF-8 byte segment.')
  return buffer
}
