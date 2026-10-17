# API reference

All APIs are framework-independent. Import only the entrypoints you use.

## Package entrypoints

| Import path | Main exports |
| --- | --- |
| `@blcklab/qrypt` | `qrypt`, `toSVG` |
| `@blcklab/qrypt/png` | `toPNG`, `toPNGDataURL` |
| `@blcklab/qrypt/render` | `toPixels` |
| `@blcklab/qrypt/styled` | `toStyledSVG`, `toStyledPNG`, `toStyledPixels` |
| `@blcklab/qrypt/logo` | `toLogoSVG`, `toLogoPNG`, `toLogoPixels` |
| `@blcklab/qrypt/payloads` | `wifi`, `vcard`, `email`, `sms`, `telephone`, `geo`, `calendarEvent` |
| `@blcklab/qrypt/decode` | `decodeMatrix`, `decodePixels`, `assembleStructuredAppend` |
| `@blcklab/qrypt/advanced` | `qryptBytes`, `qryptKanji`, `qryptGS1`, `qryptStructuredAppend` |
| `@blcklab/qrypt/secure` | `signQRPayload`, `verifyQRPayload`, `secureRedemptionKey` |

## `qrypt(input, options?)`

`input: string` → `QryptResult`.

| Option | Type | Default |
| --- | --- | --- |
| `errorCorrectionLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` |
| `version` | `1–40 \| 'auto'` | `'auto'` |

`QryptResult` provides read-only `version`, `size`, `mask`, `errorCorrectionLevel`, and `matrix(): boolean[][]`.

## Rendering

`toSVG(qr, options?)` → `string`.

`toPNG(qr, options?)`, `toStyledPNG(qr, options?)`, `toLogoPNG(qr, logo, options?)` → `Uint8Array`.

`toPNGDataURL(qr, options?)` → `string`.

`toPixels(qr, options?)`, `toStyledPixels(qr, options?)`, `toLogoPixels(qr, logo, options?)` → `{ width, height, data }`, where `data` is RGBA `Uint8ClampedArray`.

Basic render options: `scale` (integer, default 8), `margin` (integer, default 4), `darkColor` and `lightColor` (six-digit hex). PNG and raw pixels also accept `darkAlpha` and `lightAlpha` (integers 0–255).

Styled options also accept `moduleShape`, `finderStyle`, and `gradient: { from, to, direction? }`. Logo options accept `logoSize` and `logoPadding` in modules and a `{ width, height, data }` RGBA logo image. See [styling and logos](STYLING-AND-LOGOS.md).

## Decoding

`decodeMatrix(matrix)` returns decoded text, metadata, segments, corrected error count, and optional binary bytes. Invalid QR matrices cause an error.

`decodePixels({ width, height, data, format? })` returns the same decoded content plus image location or `null` if no QR is found. `format` may be `'rgba'` (default), `'rgb'`, or `'gray'`. Malformed input throws. See [decoding](DECODING.md).

## Security

`signQRPayload(options)` → `Promise<string>` with ES256 JWS compact token.

`verifyQRPayload(token, options)` → `Promise<{ valid: true, claims, keyId } | { valid: false, reason }>`.

Trusted verification requires an application-supplied `issuer`, `audience`, `purpose`, and **one** trusted key resolver (`resolveTrustedKey` preferred, or legacy `resolvePublicKey`). Optional revocation and one-time `redeem` callbacks integrate with the caller's trusted storage. See [signed QR codes](SECURE-QR.md).

## Common errors

- `TypeError`: wrong input type or unknown option.
- `RangeError`: out-of-range values, insufficient QR capacity, unsupported image dimensions, or impossible logo placement.
- Errors decoding malformed or unsupported QR data.

Qrypt doesn't silently lower your requested error correction or replace a fixed QR version. See [troubleshooting](TROUBLESHOOTING.md).
