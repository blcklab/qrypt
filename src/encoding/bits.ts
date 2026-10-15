/** A compact, MSB-first bit writer. It does not require platform APIs. */
export class BitBuffer {
  private readonly bytes: number[] = []
  private length = 0

  get bitLength(): number {
    return this.length
  }

  write(value: number, width: number): void {
    if (!Number.isInteger(width) || width < 0 || width > 31 ||
        !Number.isInteger(value) || value < 0 || value >= 2 ** width) {
      throw new RangeError('Bit-buffer value does not fit its declared width.')
    }
    for (let bit = width - 1; bit >= 0; bit--) {
      const byteIndex = this.length >>> 3
      if ((this.length & 7) === 0) this.bytes.push(0)
      this.bytes[byteIndex] = this.bytes[byteIndex]! | (((value >>> bit) & 1) << (7 - (this.length & 7)))
      this.length++
    }
  }

  toBytes(): Uint8Array {
    if ((this.length & 7) !== 0) {
      throw new Error('Bit buffer cannot be converted to bytes while unaligned.')
    }
    return Uint8Array.from(this.bytes)
  }
}
