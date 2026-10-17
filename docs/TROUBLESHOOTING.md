# Troubleshooting

## The QR code isn't scanning

1. Use dark modules on a light background and a four-module quiet zone (`margin: 4`).
2. Increase output resolution (`scale`) or printed size so modules aren't tiny.
3. Use a plain square QR before applying gradients, dots or a logo.
4. Test the *final* displayed or printed image rather than only its source SVG.
5. Improve lighting and focus; avoid glare, cropping and heavy blur.

No library can guarantee every QR scanner will accept every design.

## The content is too large

Shorten the text or encode a short HTTPS link. If you explicitly selected a version, consider using `version: 'auto'`. Lowering error correction may fit more data, but makes the symbol less damage-tolerant. Standard QR Code Model 2 tops out at 2,953 byte-mode bytes under Version 40-L.

## The logo cannot be placed

Use `errorCorrectionLevel: 'Q'` or `'H'`, shrink the logo, remove an explicit `logoSize`, or increase the QR version where appropriate. Qrypt avoids protected patterns and may reject a layout rather than damage the symbol.

## `decodePixels()` returns `null`

Make sure you're passing **decoded raw pixels**, not JPEG/PNG file bytes. Check exact width, height, channel count and `format`. Try a clearer photograph with the entire QR and its borders visible. One image may contain several QR codes; Qrypt detects one, not a collection.

## Contact, Wi-Fi, or event QR doesn't open the expected app

Different camera apps handle payload formats differently. Inspect the encoded string with a generic QR scanner first. Keep fields concise and verify with your target devices.

## Signature verification fails

Confirm your application uses the correct trusted issuer, audience, purpose, key ID and public key. Check expiration and clock skew, and whether a key has been retired or revoked. Verify that any replay/redemption database hook is operating atomically. A signed token can be copied; signature validation alone does not prove device or person identity.

## Import errors

Import from the named subpath, for example `@blcklab/qrypt/png`, not an internal file under `dist/`. Before public npm release, build Qrypt locally and install it with a `file:` dependency. The source package is currently unpublished.

See [the API reference](API.md) or [documentation index](README.md).
