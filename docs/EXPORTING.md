# Export SVG, PNG and pixels

The output format doesn't change the encoded content. Choose the format based on where the QR code will be displayed or printed.

## SVG — crisp at any size

```ts
import { qrypt, toSVG } from '@blcklab/qrypt'

const svg = toSVG(qrypt('https://example.com'), {
  scale: 10,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
})
```

SVG is included with the core package. It works well for scalable print assets and web display.

## PNG — portable image bytes

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPNG, toPNGDataURL } from '@blcklab/qrypt/png'

const qr = qrypt('Hello')
const png = toPNG(qr, { scale: 8, margin: 4 }) // Uint8Array
const dataUrl = toPNGDataURL(qr)                 // data:image/png;base64,...
```

Save PNG in Node.js:

```ts
import { writeFile } from 'node:fs/promises'
import { qrypt } from '@blcklab/qrypt'
import { toPNG } from '@blcklab/qrypt/png'

await writeFile('my-code.png', toPNG(qrypt('Hello')))
```

## Raw pixels — integrate with another renderer

```ts
import { qrypt } from '@blcklab/qrypt'
import { toPixels } from '@blcklab/qrypt/render'

const image = toPixels(qrypt('Hello'), {
  scale: 8,
  darkAlpha: 255,
  lightAlpha: 0,
})

console.log(image.width, image.height, image.data.length)
```

`image.data` is a row-major `Uint8ClampedArray` of RGBA channels (four bytes per pixel). This is useful with browser Canvas or custom image libraries; Qrypt itself never accesses Canvas.

## Render options

| Option | Default | Meaning |
| --- | --- | --- |
| `scale` | `8` | Pixels per module, positive integer |
| `margin` | `4` | Quiet-zone width in modules |
| `darkColor` | `#000000` | Foreground, six-digit hex |
| `lightColor` | `#FFFFFF` | Background, six-digit hex |
| `darkAlpha` | `255` | Dark opacity for PNG/pixels |
| `lightAlpha` | `255` | Background opacity for PNG/pixels |

Image width equals `(qr.size + margin * 2) * scale` pixels. Transparent PNG requires the appropriate alpha option and is not necessarily suitable for camera scanning over arbitrary backgrounds.

**Tip:** Keep the light quiet zone and avoid resizing bitmap QR output with blurry interpolation. See [styling and logos](STYLING-AND-LOGOS.md).
