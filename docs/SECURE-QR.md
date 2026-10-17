# Signed QR codes

A signed QR code lets your application confirm that an authorized issuer created the payload and that the contents haven't changed since signing. Qrypt uses compact JWS with **ES256 (ECDSA P-256 + SHA-256)**.

**Signing is not encryption.** Anyone who scans a QR code can read the encoded token and its claims. Do not embed passwords, private personal records, or other secrets in the QR.

## Sign a token

The issuer controls a private key. In production, signing must be performed in a trusted backend or secure key service—not in a public browser bundle.

```ts
import { signQRPayload } from '@blcklab/qrypt/secure'
import { qrypt } from '@blcklab/qrypt'

// privateKey is a trusted, non-extractable P-256 signing CryptoKey.
const token = await signQRPayload({
  issuer: 'https://issuer.example',
  audience: 'event-2026',
  purpose: 'checkin',
  keyId: 'key-2026-01',
  privateKey,
  data: { ticket: 'TICKET-123' },
  expiresInSeconds: 300,
})
const qr = qrypt(token, { errorCorrectionLevel: 'M' })
```

Choose a short expiration for bearer-style passes. Signed tokens require more QR space than an ordinary URL.

## Verify a token

Verification is performed against values your application **already trusts**. Never trust a claimed issuer, public key, URL, or permission solely because it appears inside the QR.

```ts
import { verifyQRPayload } from '@blcklab/qrypt/secure'

// trustedPublicKey must come from your application's trusted key registry.
const result = await verifyQRPayload(token, {
  issuer: 'https://issuer.example',
  audience: 'event-2026',
  purpose: 'checkin',
  resolveTrustedKey: ({ issuer, keyId }) => {
    if (issuer !== 'https://issuer.example' || keyId !== 'key-2026-01') return null
    return { issuer, keyId, publicKey: trustedPublicKey, status: 'active' }
  },
})

if (result.valid) {
  console.log(result.claims.data)
} else {
  console.log(result.reason)
}
```

You may register keys as `active`, `retired` (with issuance/verification windows), or `revoked`. Make sure the issuer and key ID are bound to the correct trusted public key.

## One-time tickets or attendance

A signed QR can be photographed, copied, or scanned by someone else. The signature alone cannot stop reuse or prove who is holding the QR.

For one-use redemption, use `verifyQRPayload` with its `redeem` callback and a **durable, atomic database operation** (for example, a unique redemption key in a transaction). Qrypt supplies a `secureRedemptionKey()` helper; it does **not** supply a database, key manager, identity proof, or access-control policy. A simple in-memory Set is insufficient across servers or restarts.

## Production safety checklist

- Keep private signing keys on a trusted server; restrict key access and support rotation.
- Pin the allowed `issuer`, `audience`, and `purpose` per application.
- Reject unknown/revoked keys and expired/not-yet-valid tokens.
- Use a trusted revocation source and atomic replay protection for one-time passes.
- Do not treat unverified token contents as instructions to fetch URLs or authorize actions.
- Review the flow for copied bearer QR codes, device clock skew, and disclosure of token contents.

This is an authentication building block, **not a complete identity or attendance system**.

See [API reference](API.md) and [troubleshooting](TROUBLESHOOTING.md).
