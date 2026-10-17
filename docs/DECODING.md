# Decode QR codes

Qrypt can read QR module matrices and raw pixel buffers. It does **not** access the camera or parse JPEG/PNG files for you.

## Decode a QR matrix

```ts
import { qrypt } from '@blcklab/qrypt'
import { decodeMatrix } from '@blcklab/qrypt/decode'

const matrix = qrypt('Hello from Qrypt').matrix()
const decoded = decodeMatrix(matrix)

console.log(decoded.text)
console.log(decoded.correctedErrors)
```

A matrix is a square `boolean[][]` **without** the white quiet zone.

## Decode an image buffer

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPixels } from '@blcklab/qrypt/render'
import { decodePixels } from '@blcklab/qrypt/decode'

const image = toPixels(qrypt('Scan me'), { scale: 10 })
const result = decodePixels(image)

console.log(result?.text ?? 'No QR code found')
```

Supported input formats are `rgba` (default), `rgb` and `gray`. The pixel buffer must have exact dimensions and byte count. Qrypt searches for one QR symbol; when no symbol is detected it returns `null`. Invalid input can throw errors.

## Using a photo in a browser

Decode a user-selected file into `ImageData` with browser Canvas, then pass `{ width, height, data }` to `decodePixels()`. Qrypt itself does not request camera permissions and does not fetch URLs. Avoid processing untrusted, unbounded images; Qrypt intentionally enforces a pixel budget.

```ts
// After your application has obtained ImageData from Canvas:
const result = decodePixels({ width: imageData.width, height: imageData.height, data: imageData.data })
```

## Read binary data

`decodeMatrix()` and `decodePixels()` return text and segment metadata; a decoded QR that consists entirely of byte segments can also include `bytes` (a `Uint8Array`). Use raw bytes when fidelity matters.

## Known scanning limitations

This is not a general-purpose camera SDK. QR codes with cropped finder patterns, very small modules, extreme perspective distortion or heavy blur may not be detected. Try a larger QR, cleaner focus, a wider quiet zone, and more uniform lighting.

For specialized structured-append decoding, see [advanced formats](ADVANCED.md). For practical suggestions, see [troubleshooting](TROUBLESHOOTING.md).
