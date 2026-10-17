# Changelog

This page describes Qrypt from a user's perspective. Detailed milestone logs and release audits are local maintainer records and are not included in the npm package.

## Unreleased — 0.1.0 preview

The first Qrypt release candidate includes:

- Standard QR Code Model 2 generation (Versions 1–40, error correction L/M/Q/H) with mixed text encoding and SVG output.
- Optional PNG, RGBA pixel, styled, gradient and logo rendering.
- Common QR payload builders for Wi-Fi, contact cards, email, SMS, phone, geo and calendar events.
- QR decoding from a module matrix or raw image pixels, including Reed–Solomon repair.
- Advanced binary, Kanji, GS1 and structured-append encoding.
- ES256 signed QR payloads with trusted verification, key rotation, revocation hooks and optional replay protection integration.
- ESM/CommonJS and TypeScript declaration exports with zero runtime npm dependencies.

**Status:** Not yet published. QR image decoding remains sensitive to severe blur, clipped markers, and very small modules. Real-device scan acceptance and security review remain important before production-critical deployments.

[Getting started](docs/GETTING-STARTED.md) · [Full documentation](docs/README.md)
