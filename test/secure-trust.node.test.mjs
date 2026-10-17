import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { signQRPayload, verifyQRPayload, secureRedemptionKey } from '../.m13-check/secure.js'

const issuer = 'https://issuer.example'
const audience = 'attendance'
const purpose = 'checkin'
const generate = () => webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const signing = (privateKey, keyId = 'v1', extra = {}) => ({
  issuer, audience, purpose, keyId, privateKey, data: { attendee: 'a' },
  expiresInSeconds: 600, now: 1000, tokenId: 'attendance-001', ...extra,
})
const trusted = (publicKey, keyId = 'v1', extra = {}) => ({
  issuer, keyId, publicKey, status: 'active', ...extra,
})
const verify = (resolveTrustedKey, extra = {}) => ({
  issuer, audience, purpose, now: 1001, resolveTrustedKey, ...extra,
})

test('trusted resolver binds issuer and kid; never takes issuer from unsigned token data', async () => {
  const pair = await generate()
  const token = await signQRPayload(signing(pair.privateKey))
  let query
  const good = verify(({ issuer: i, keyId }) => { query = { issuer: i, keyId }; return trusted(pair.publicKey) })
  assert.equal((await verifyQRPayload(token, good)).valid, true)
  assert.deepEqual(query, { issuer, keyId: 'v1' })
  assert.equal((await verifyQRPayload(token, verify(() => trusted(pair.publicKey, 'v1', { issuer: 'https://other.example' })))).reason, 'untrusted-key')
  assert.equal((await verifyQRPayload(token, verify(() => trusted(pair.publicKey, 'v2')))).reason, 'untrusted-key')
  assert.equal((await verifyQRPayload(token, verify(() => null))).reason, 'unknown-key')
  assert.equal((await verifyQRPayload(token, verify(() => trusted(pair.publicKey), { audience: 'wrong' }))).reason, 'wrong-audience')
})

test('key rotation accepts old valid tokens only before key verification sunset', async () => {
  const old = await generate()
  const next = await generate()
  const oldToken = await signQRPayload(signing(old.privateKey))
  const newToken = await signQRPayload(signing(next.privateKey, 'v2'))
  const recordFor = ({ keyId }) => keyId === 'v1'
    ? trusted(old.publicKey, 'v1', { status: 'retired', issuedFrom: 900, issuedUntil: 1010, verifyUntil: 1200 })
    : keyId === 'v2' ? trusted(next.publicKey, 'v2', { issuedFrom: 1000 }) : null
  assert.equal((await verifyQRPayload(oldToken, verify(recordFor, { now: 1100 }))).valid, true)
  assert.equal((await verifyQRPayload(newToken, verify(recordFor, { now: 1100 }))).valid, true)
  assert.equal((await verifyQRPayload(oldToken, verify(recordFor, { now: 1200 }))).reason, 'inactive-key')
  assert.equal((await verifyQRPayload(oldToken, verify(() => trusted(old.publicKey, 'v1', { issuedFrom: 1001 })))).reason, 'inactive-key')
  assert.equal((await verifyQRPayload(oldToken, verify(() => trusted(old.publicKey, 'v1', { issuedUntil: 1000 })))).reason, 'inactive-key')
  assert.equal((await verifyQRPayload(oldToken, verify(() => trusted(old.publicKey, 'v1', { status: 'revoked' })))).reason, 'revoked-key')
})

test('revocation is checked only for verified valid claims and blocks redemption', async () => {
  const pair = await generate()
  const token = await signQRPayload(signing(pair.privateKey))
  const other = await generate()
  let checks = 0, redemptions = 0
  const opts = verify(() => trusted(pair.publicKey), {
    isRevoked: ({ claims, keyId }) => { checks++; assert.equal(keyId, 'v1'); assert.equal(claims.jti, 'attendance-001'); return true },
    redeem: () => { redemptions++; return true },
  })
  assert.equal((await verifyQRPayload(token, opts)).reason, 'revoked')
  assert.equal(checks, 1)
  assert.equal(redemptions, 0)
  assert.equal((await verifyQRPayload(token, { ...opts, audience: 'bad' })).reason, 'wrong-audience')
  assert.equal(checks, 1)
  assert.equal((await verifyQRPayload(token, { ...opts, resolveTrustedKey: () => trusted(other.publicKey) })).reason, 'invalid-signature')
  assert.equal(checks, 1)
  await assert.rejects(verifyQRPayload(token, { ...opts, isRevoked: () => { throw new Error('store outage') } }), /store outage/)
})

test('atomic redemption callback allows exactly one successful concurrent verification', async () => {
  const pair = await generate()
  const token = await signQRPayload(signing(pair.privateKey))
  const seen = new Set()
  const opts = verify(() => trusted(pair.publicKey), {
    // Application must implement an atomic durable insert/compare-and-swap.
    redeem: async (claims, context) => {
      assert.equal(context.keyId, 'v1')
      assert.equal(context.redemptionKey, secureRedemptionKey(claims))
      if (seen.has(context.redemptionKey)) return false
      seen.add(context.redemptionKey) // atomic in this single-thread demonstration only
      await Promise.resolve()
      return true
    },
  })
  const results = await Promise.all(Array.from({ length: 32 }, () => verifyQRPayload(token, opts)))
  assert.equal(results.filter(r => r.valid).length, 1)
  assert.equal(results.filter(r => !r.valid && r.reason === 'replayed').length, 31)
})

test('redemption key is collision free across issuer, audience, purpose and jti', () => {
  const base = { iss: issuer, aud: 'att:one', purpose, jti: 'id' }
  const keys = [base, { ...base, aud: 'att', purpose: 'one' }, { ...base, jti: 'other' }, { ...base, iss: 'https://other.example' }]
  assert.equal(new Set(keys.map(secureRedemptionKey)).size, 4)
})

test('malconfigured lifecycle records and resolver selection are rejected without fallback', async () => {
  const pair = await generate()
  const token = await signQRPayload(signing(pair.privateKey))
  const expectFail = async (record, pattern) => assert.rejects(
    verifyQRPayload(token, verify(() => record)), pattern,
  )
  await expectFail(trusted(pair.publicKey, 'v1', { status: 'retired' }), /Retired keys require/)
  await expectFail(trusted(pair.publicKey, 'v1', { status: 'unknown' }), /status/)
  await expectFail(trusted(pair.publicKey, 'v1', { issuedFrom: 1010, issuedUntil: 1000 }), /precede/)
  await expectFail(trusted(pair.publicKey, 'v1', { anotherField: 'unsafe' }), /Unknown/)
  await assert.rejects(verifyQRPayload(token, { ...verify(() => trusted(pair.publicKey)), resolvePublicKey: () => pair.publicKey }), /exactly one/)
  await assert.rejects(verifyQRPayload(token, { issuer, audience, purpose, now: 1001 }), /exactly one/)
})

test('legacy resolvePublicKey callback remains compatible', async () => {
  const pair = await generate()
  const token = await signQRPayload(signing(pair.privateKey))
  const result = await verifyQRPayload(token, {
    issuer, audience, purpose, now: 1001,
    resolvePublicKey: kid => kid === 'v1' ? pair.publicKey : null,
    redeem: claims => claims.jti === 'attendance-001',
  })
  assert.equal(result.valid, true)
})
