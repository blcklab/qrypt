import { describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { qrypt } from '../src/index.js'
import { signQRPayload, verifyQRPayload } from '../src/secure.js'

describe('M12 ES256 signed QR protocol', () => {
  it('signs and verifies through WebCrypto without importing crypto into the core', async () => {
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const token = await signQRPayload({
      issuer: 'https://issuer.example', audience: 'attendance', purpose: 'checkin',
      keyId: 'key-2026', privateKey: keys.privateKey, expiresInSeconds: 60,
      data: { attendee: 'Alice' }, now: 1000,
    })
    const result = await verifyQRPayload(token, {
      issuer: 'https://issuer.example', audience: 'attendance', purpose: 'checkin',
      resolvePublicKey: () => keys.publicKey, now: 1001,
    })
    expect(result.valid).toBe(true)
    expect(qrypt(token).size).toBeGreaterThan(0)
  })
})
