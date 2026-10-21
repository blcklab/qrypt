# Getting started

Qrypt turns text into a scannable QR code and can return SVG, PNG bytes, or image pixels. It works in JavaScript and TypeScript without a UI framework.

## 1. Install Qrypt

Install the published package:

```bash
npm install @blcklab/qrypt
```

For unreleased local changes, build the checked-out Qrypt source (`npm install && npm run build`) and install it in your application with `npm install ../qrypt` (adjust the local path).

## 2. Create a QR code

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com')
const svg = toSVG(qr, { scale: 8, margin: 4 })

console.log(qr.version) // chosen QR version
console.log(qr.size)    // module width and height
```

`svg` is a complete SVG document. The `qrypt()` result contains the QR pattern and metadata. The quiet zone belongs to rendering, not the `matrix()` result.

## 3. Save your QR code

In Node.js:

```ts
import { writeFile } from 'node:fs/promises'
import { qrypt, toSVG } from '@blcklab/qrypt'

await writeFile('my-code.svg', toSVG(qrypt('Hello from Qrypt')), 'utf8')
```

For a browser, you can put the SVG string in a Blob, generate an object URL, and use that URL as an `<img>` source. Avoid injecting untrusted SVG markup into your page.

## 4. Choose error correction

```ts
const qr = qrypt('Hello!', { errorCorrectionLevel: 'H' })
```

`M` is the default. `Q` and `H` provide greater damage tolerance but have less data capacity. `H` is the starting point for a QR code with a logo. Error correction cannot guarantee successful scans after covering modules.

## Where to go next

- [Export a PNG](EXPORTING.md)
- [Add color and a logo](STYLING-AND-LOGOS.md)
- [Make a contact or Wi-Fi QR](PAYLOADS.md)
- [Decode a QR code](DECODING.md)
- [Browse all guides](README.md)
