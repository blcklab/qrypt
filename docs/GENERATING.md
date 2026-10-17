# Generate QR codes

Use `qrypt()` for text, links, numbers, and Unicode strings.

```ts
import { qrypt } from '@blcklab/qrypt'

const qr = qrypt('Hello, 世界 🌎', {
  errorCorrectionLevel: 'M',
  version: 'auto',
})
```

## Choosing a version

Qrypt selects the smallest compatible version unless you specify one from 1 to 40:

```ts
const qr = qrypt('CHECK-IN', { version: 5, errorCorrectionLevel: 'Q' })
```

A version determines the number of modules: `21 × 21` for Version 1, up to `177 × 177` for Version 40. If the content is too long for your chosen version and correction level, Qrypt throws a `RangeError`; it does not silently resize an explicitly selected version.

## Error correction levels

| Level | Error correction | Suggested use |
| --- | --- | --- |
| `L` | Lower | Maximum capacity in clean conditions |
| `M` | Medium (default) | Most ordinary QR codes |
| `Q` | Quartile | Some physical damage / styling |
| `H` | High | Logo QR designs, with real-device testing |

Higher levels reduce data capacity. The familiar *7%, 15%, 25%, 30%* figures are approximate QR codeword correction proportions, **not** a guarantee that a similarly sized visual obstruction can be corrected.

## Inspect the module matrix

```ts
const modules = qr.matrix()
const topLeftIsDark = modules[0]?.[0]

console.log(qr.version, qr.size, qr.mask, qr.errorCorrectionLevel)
```

`modules[y][x]` is a boolean indicating whether a module is dark. The returned matrix is a fresh copy you can inspect without modifying the Qrypt symbol.

## Size and capacity

The maximum standard byte-mode capacity is **2,953 bytes** in Version 40-L. This is not a promise for UTF-8 strings (where characters can use several bytes) or signed tokens. Qrypt handles numeric and alphanumeric sequences more compactly than arbitrary bytes when possible.

For binary data that must remain byte-for-byte identical, use [advanced formats](ADVANCED.md). For URLs and contact data, see [payload builders](PAYLOADS.md).
