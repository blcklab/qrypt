# Qrypt

**QR codes, without the extra weight.**

Qrypt is a TypeScript QR code toolkit for web and Node.js applications. Create QR codes, style them, export SVG or PNG, decode an image, or work with signed QR payloads—all without runtime npm dependencies or framework lock-in.

> **Release status:** Qrypt `0.1.0` is an initial preview release. For unreleased development changes, you can use a verified local build or a `file:` dependency.

## Installation

Install from npm once the release is available:

```bash
npm install @blcklab/qrypt
```

Until then, you can install a locally built package:

```bash
# From the Qrypt source checkout
npm install
npm run build

# From your application (adapt the path)
npm install ../qrypt
```

Local installation requires Qrypt's `dist/` build. If you are vendoring the source rather than the built package, configure your own build tool to compile its TypeScript.

## Quick start

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const qr = qrypt('https://example.com')
const svg = toSVG(qr)

// svg is an SVG string: save it, or display it in your application.
console.log(qr.version, qr.size)
```

No DOM, Canvas, browser camera, or network connection is required to **generate** a QR code.

## Make it your own

```ts
import { qrypt } from '@blcklab/qrypt'
import { toStyledSVG } from '@blcklab/qrypt/styled'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'H' })
const svg = toStyledSVG(qr, {
  scale: 10,
  margin: 4,
  moduleShape: 'rounded',
  finderStyle: 'rounded',
  darkColor: '#111827',
  lightColor: '#FFFFFF',
})
```

For photographs or logos, see the [branding guide](docs/STYLING-AND-LOGOS.md). Keep the quiet zone, use dark modules on a light background, and test the final design with real cameras.

## What can Qrypt do?

| Need | Import | Start here |
| --- | --- | --- |
| Generate QR codes and SVG | `@blcklab/qrypt` | [Generate QR codes](docs/GENERATING.md) |
| Export PNG / data URLs | `@blcklab/qrypt/png` | [Export images](docs/EXPORTING.md) |
| Get raw RGBA pixels | `@blcklab/qrypt/render` | [Export images](docs/EXPORTING.md) |
| Create Wi-Fi, contact, email and event payloads | `@blcklab/qrypt/payloads` | [Common payloads](docs/PAYLOADS.md) |
| Style QR modules and colors | `@blcklab/qrypt/styled` | [Styling and logos](docs/STYLING-AND-LOGOS.md) |
| Add an RGBA logo | `@blcklab/qrypt/logo` | [Styling and logos](docs/STYLING-AND-LOGOS.md) |
| Decode a matrix or raw image pixels | `@blcklab/qrypt/decode` | [Decode QR codes](docs/DECODING.md) |
| Work with binary, Kanji, GS1 or structured append | `@blcklab/qrypt/advanced` | [Advanced formats](docs/ADVANCED.md) |
| Sign and verify an ES256 QR token | `@blcklab/qrypt/secure` | [Signed QR codes](docs/SECURE-QR.md) |

Qrypt supports standard **QR Code Model 2**, Versions **1–40**, error-correction levels **L/M/Q/H**, automatic string segmentation, and Reed–Solomon error correction. It supports modern ESM, CommonJS, and TypeScript declarations.

## Documentation

Start with the [getting started guide](docs/GETTING-STARTED.md). For a complete reference, see the [API reference](docs/API.md), or browse the [documentation index](docs/README.md).

## Important limitations

- The image decoder accepts **raw RGBA, RGB, or grayscale pixels**, not a JPEG/PNG file directly. Decode the file with browser Canvas or another image decoder first.
- Camera access and photo-file parsing are deliberately supplied by your application, not the library.
- Complex styling, dense symbols, cropped QR codes, glare, and severe blur can make scanning less reliable.
- Signed QR tokens establish authenticity, **not confidentiality or proof of a person's identity**. For one-time use, your application needs a durable, atomic redemption store.
- Standard QR Code Model 2 holds up to **2,953 data bytes** at level L in byte mode; higher error correction and format overhead reduce capacity.

See [troubleshooting](docs/TROUBLESHOOTING.md) and [security guidance](docs/SECURE-QR.md).

## Maintainer information

Testing and publishing workflows for maintainers live in `.workflow/`. Local development notes can be kept in the Git-ignored `.internal/` directory. Neither is needed to use Qrypt. Publishing remains manually approved.

## License

MIT. See [LICENSE](LICENSE).
