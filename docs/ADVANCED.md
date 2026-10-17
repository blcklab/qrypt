# Advanced QR formats

Most applications should use [`qrypt(text)`](GENERATING.md). Use the advanced entry when you need exact binary bytes or a specialized QR mode.

## Lossless binary

```ts
import { qryptBytes } from '@blcklab/qrypt/advanced'

const bytes = new Uint8Array([0, 1, 2, 255])
const qr = qryptBytes(bytes)
```

Binary input is not changed through text encoding or normalization. Capacity still depends on QR version and error correction.

## QR Kanji mode

```ts
import { qryptKanji } from '@blcklab/qrypt/advanced'

// Already-encoded Shift-JIS bytes for a supported QR Kanji character.
const qr = qryptKanji(new Uint8Array([0x8a, 0xbf]))
```

Qrypt does **not** convert Unicode to Shift-JIS. Supply valid paired bytes from your application's converter; unsupported byte pairs are rejected.

## GS1 QR

```ts
import { qryptGS1 } from '@blcklab/qrypt/advanced'

const qr = qryptGS1('0109501101530003')
```

The caller must format GS1 application identifiers correctly. Qrypt adds the FNC1-first-position QR encoding but does **not** validate GS1 AI rules. Use ASCII group separator (`\x1d`) for variable-length fields when required.

## Structured append (2–16 symbols)

```ts
import { qryptStructuredAppend } from '@blcklab/qrypt/advanced'
import { decodeMatrix, assembleStructuredAppend } from '@blcklab/qrypt/decode'

const parts = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
const symbols = qryptStructuredAppend(parts)
const decodedParts = symbols.map(symbol => decodeMatrix(symbol.matrix()))
const combined = assembleStructuredAppend(decodedParts)
```

Structured append splits data into multiple QR symbols. Most generic phone-camera apps **do not reliably assemble** multiple parts. Its XOR parity is only a basic consistency check, **not cryptographic authentication**.

See [signed QR codes](SECURE-QR.md) when you need authenticity rather than just a larger payload.
