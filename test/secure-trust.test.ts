import { describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { signQRPayload, verifyQRPayload, secureRedemptionKey } from '../src/secure.js'

describe('M13 trusted key lifecycle and replay contracts', () => {
  it('enforces issuer binding and key revocation, preserving legacy verifier', async () => {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const token = await signQRPayload({
      issuer: 'https://issuer.example', audience: 'attendance', purpose: 'checkin',
      keyId: 'v1', privateKey: pair.privateKey, data: { entry: 1 },
      expiresInSeconds: 60, now: 1000,
    })
    const options = { issuer: 'https://issuer.example', audience: 'attendance', purpose: 'checkin', now: 1001 }
    expect((await verifyQRPayload(token, { ...options, resolvePublicKey: () => pair.publicKey })).valid).toBe(true)
    expect((await verifyQRPayload(token, { ...options, resolveTrustedKey: () => ({
      issuer: 'https://other.example', keyId: 'v1', publicKey: pair.publicKey, status: 'active',
    }) })).reason).toBe('untrusted-key')
    expect((await verifyQRPayload(token, { ...options, resolveTrustedKey: () => ({
      issuer: options.issuer, keyId: 'v1', publicKey: pair.publicKey, status: 'revoked',
    }) })).reason).toBe('revoked-key')
  })
  it('creates collision-free redemption identifiers', () => {
    const values = [
      { iss: 'a', aud: 'b:c', purpose: 'x', jti: 'token' },
      { iss: 'a', aud: 'b', purpose: 'c', jti: 'token' },
    ]
    expect(secureRedemptionKey(values[0]!)).not.toBe(secureRedemptionKey(values[1]!))
  })
})
