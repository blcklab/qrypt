# Styling and logos

Customize your QR code without changing the underlying data. Always confirm the final design scans on your target devices.

## Colors and rounded modules

```ts
import { qrypt } from '@blcklab/qrypt'
import { toStyledSVG, toStyledPNG } from '@blcklab/qrypt/styled'

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'H' })
const appearance = {
  scale: 10,
  margin: 4,
  moduleShape: 'rounded' as const,
  finderStyle: 'rounded' as const,
  darkColor: '#111827',
  lightColor: '#FFFFFF',
}

const svg = toStyledSVG(qr, appearance)
const png = toStyledPNG(qr, appearance)
```

Supported data module shapes: `square`, `rounded`, `dot`. Finder styles: `square`, `rounded`. Function modules remain protected by the renderer's design.

## Two-color gradients

```ts
const svg = toStyledSVG(qr, {
  margin: 4,
  moduleShape: 'rounded',
  gradient: { from: '#111827', to: '#334155', direction: 'vertical' },
  lightColor: '#FFFFFF',
})
```

Use `gradient` **instead of** `darkColor`, not both. Qrypt enforces a minimum foreground/background contrast of 4.5:1 for styled output, but contrast alone cannot guarantee scan reliability.

## Put a logo inside a QR code

Qrypt accepts a *decoded image*, not a PNG filename or network URL. Supply its raw RGBA pixels from your own image decoder.

```ts
import { qrypt } from '@blcklab/qrypt'
import { toLogoSVG, toLogoPNG } from '@blcklab/qrypt/logo'

// A tiny example image. For a real logo, decode its RGBA pixels first.
const logo = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([0, 0, 0, 255]),
}

const qr = qrypt('https://example.com', { errorCorrectionLevel: 'H' })
const svg = toLogoSVG(qr, logo, { scale: 12, margin: 4 })
const png = toLogoPNG(qr, logo, { scale: 12, margin: 4 })
```

Logo placement is intentionally conservative: Qrypt avoids covered finder, alignment and other protected QR function modules, may choose a smaller region, and throws if it can't safely place the image. Logo rendering requires level `Q` or `H`; keep logos small and test scans.

## Recommended scanning practices

- Use dark foreground modules and a light, opaque background.
- Preserve a quiet zone of at least four modules when practical.
- Prefer `rounded` over very small `dot` modules when scanning matters most.
- Test both digital and printed versions on different phone cameras, including dim lighting.
- Do not assume a logo is safe simply because it fits in the center. QR alignment patterns also matter.

See [export formats](EXPORTING.md) and [troubleshooting](TROUBLESHOOTING.md).
