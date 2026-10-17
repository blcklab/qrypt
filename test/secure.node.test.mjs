import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto, createPublicKey, verify as nodeVerify } from 'node:crypto'
import { qrypt } from '../.m12-check/index.js'
import { signQRPayload, verifyQRPayload } from '../.m12-check/secure.js'

const base = {
  issuer: 'https://issuer.example', audience: 'blcklab-attendance', purpose: 'checkin',
  keyId: '2026-10', expiresInSeconds: 120, now: 1000,
  data: { person: 'A', roles: ['attendee'], emoji: '💡' },
}

const verifyOptions = (key, overrides = {}) => ({
  issuer: base.issuer, audience: base.audience, purpose: base.purpose,
  resolvePublicKey: (kid) => kid === base.keyId ? key : null,
  now: 1001, ...overrides,
})

const generate = () => webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])

test('ES256 compact JWS signs, verifies, and fits a normal QR symbol', async () => {
  const keys = await generate()
  const token = await signQRPayload({ ...base, privateKey: keys.privateKey })
  const [header, payload, signature] = token.split('.')
  assert.equal(token.split('.').length, 3)
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', typ: 'qrypt+jwt', kid: base.keyId })
  assert.equal(Buffer.from(signature, 'base64url').length, 64)
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')).data, base.data)
  const verified = await verifyQRPayload(token, verifyOptions(keys.publicKey))
  assert.equal(verified.valid, true)
  assert.equal(verified.claims.data.emoji, '💡')
  assert.equal(verified.claims.jti.length, 32)
  assert.ok(qrypt(token, { errorCorrectionLevel: 'Q' }).version >= 1)
  const second = await signQRPayload({ ...base, privateKey: keys.privateKey })
  assert.notEqual(verified.claims.jti, JSON.parse(Buffer.from(second.split('.')[1], 'base64url')).jti)
})

test('externally verifies raw 64-byte signature using Node crypto (P1363)', async () => {
  const keys = await generate()
  const token = await signQRPayload({ ...base, privateKey: keys.privateKey })
  const parts = token.split('.')
  const publicJwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey)
  const nodeKey = createPublicKey({ key: publicJwk, format: 'jwk' })
  assert.equal(nodeVerify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: nodeKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')), true)
})

test('tampering, hostile JOSE headers, malformed base64, and invalid signatures are rejected', async () => {
  const keys = await generate()
  const token = await signQRPayload({ ...base, privateKey: keys.privateKey })
  const [header, payload, sig] = token.split('.')
  const edit = (what) => Buffer.from(JSON.stringify(what)).toString('base64url')
  for (const candidate of [
    `${header}.${edit({ ...JSON.parse(Buffer.from(payload, 'base64url')), aud: 'other' })}.${sig}`,
    `${edit({ alg: 'none', typ: 'qrypt+jwt', kid: base.keyId })}.${payload}.${sig}`,
    `${edit({ alg: 'HS256', typ: 'qrypt+jwt', kid: base.keyId })}.${payload}.${sig}`,
    `${edit({ alg: 'ES256', typ: 'qrypt+jwt', kid: base.keyId, jku: 'https://evil.example/key' })}.${payload}.${sig}`,
    `${header}.${payload}.${sig.slice(0,-1)}!`,
    `${header}.${payload}.${'A'.repeat(86)}`,
    token + '.extra',
  ]) {
    assert.equal((await verifyQRPayload(candidate, verifyOptions(keys.publicKey))).valid, false)
  }
  const badKey = await generate()
  assert.equal((await verifyQRPayload(token, verifyOptions(badKey.publicKey))).reason, 'invalid-signature')
  assert.equal((await verifyQRPayload(token, verifyOptions(null))).reason, 'unknown-key')
})

test('enforces issuer, audience, purpose, nbf, expiry, maxAge and clock leeway', async () => {
  const keys = await generate()
  const token = await signQRPayload({ ...base, privateKey: keys.privateKey, notBefore: 1020 })
  const check = async (options) => (await verifyQRPayload(token, verifyOptions(keys.publicKey, options))).reason
  assert.equal(await check({ now: 1001 }), 'not-yet-valid')
  assert.equal(await check({ now: 1010, clockToleranceSeconds: 10 }), undefined)
  assert.equal(await check({ now: 1120 }), 'expired')
  assert.equal(await check({ now: 1120, clockToleranceSeconds: 1 }), undefined)
  assert.equal(await check({ now: 1030, issuer: 'evil.example' }), 'wrong-issuer')
  assert.equal(await check({ now: 1030, audience: 'wrong' }), 'wrong-audience')
  assert.equal(await check({ now: 1030, purpose: 'entry' }), 'wrong-purpose')
  assert.equal(await check({ now: 1060, maxAgeSeconds: 30 }), 'too-old')
})

test('replay callback is only called on valid credentials and can reject second redemption', async () => {
  const keys = await generate()
  const token = await signQRPayload({ ...base, privateKey: keys.privateKey, tokenId: 'unique123' })
  const consumed = new Set()
  let calls = 0
  const redeem = async (claims) => { calls++; const compound = claims.iss + ':' + claims.jti; if (consumed.has(compound)) return false; consumed.add(compound); return true }
  const opts = verifyOptions(keys.publicKey, { redeem })
  assert.equal((await verifyQRPayload(token, opts)).valid, true)
  assert.equal((await verifyQRPayload(token, opts)).reason, 'replayed')
  assert.equal(calls, 2)
  assert.equal((await verifyQRPayload(token, { ...opts, audience: 'other' })).reason, 'wrong-audience')
  assert.equal(calls, 2)
})

test('rejects weak/invalid inputs, enormous data, bad keys and unknown options', async () => {
  const keys = await generate()
  const opts = { ...base, privateKey: keys.privateKey }
  await assert.rejects(signQRPayload({ ...opts, expiresInSeconds: 0 }), /expiresInSeconds/)
  await assert.rejects(signQRPayload({ ...opts, issuer: 'X\nY' }), /controls/)
  await assert.rejects(signQRPayload({ ...opts, purpose: 'read me' }), /purpose/)
  await assert.rejects(signQRPayload({ ...opts, data: { 'constructor': 123 } }), /Unsafe/) // JS literal constructor is an ordinary own property
  await assert.rejects(signQRPayload({ ...opts, data: new Date() }), /plain JSON/)
  await assert.rejects(signQRPayload({ ...opts, data: 'x'.repeat(10000) }), /capacity/)
  await assert.rejects(signQRPayload({ ...opts, privateKey: keys.publicKey }), /sign key/)
  await assert.rejects(signQRPayload({ ...opts, newOption: 1 }), /Unknown/)
  await assert.rejects(verifyQRPayload('x', { ...verifyOptions(keys.publicKey), clockToleranceSeconds: 10000 }), /clockToleranceSeconds/)
})
