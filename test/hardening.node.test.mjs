import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { qrypt } from '../.m19-check/index.js'
import { qryptBytes } from '../.m19-check/advanced.js'
import { decodeMatrix, decodePixels } from '../.m19-check/decode.js'
import { toPixels } from '../.m19-check/render.js'
import { toPNG } from '../.m19-check/png.js'
import { signQRPayload, verifyQRPayload } from '../.m19-check/secure.js'

// Deterministic non-cryptographic PRNG used exclusively to reproduce test fixtures.
function seeded(seed = 0x4b1c1ab) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }
}
const random = seeded()
const levels = ['L', 'M', 'Q', 'H']

function randomString(length) {
  const chars = ['A', 'B', '1', '7', ' ', 'a', 'z', '-', 'π', '中', '🧪']
  return Array.from({length}, () => chars[random() % chars.length]).join('')
}

test('deterministic Unicode QR round trips across correction levels and version groups', () => {
  for (let i = 0; i < 96; i++) {
    const payload = randomString(random() % 38)
    const qr = qrypt(payload, {errorCorrectionLevel: levels[i % 4]})
    const recovered = decodeMatrix(qr.matrix())
    assert.equal(recovered.text, payload, `case ${i}: ${JSON.stringify(payload)}`)
    assert.equal(recovered.errorCorrectionLevel, levels[i % 4])
    assert.equal(recovered.size, qr.size)
    assert.equal(recovered.mask, qr.mask)
  }
  for (const version of [1, 9, 10, 26, 27, 40]) {
    const qr = qrypt('M19', {version, errorCorrectionLevel:'H'})
    assert.equal(decodeMatrix(qr.matrix()).text, 'M19')
  }
})

test('deterministic arbitrary binary payloads survive encode/decode without text loss', () => {
  for (let i = 0; i < 96; i++) {
    const bytes = Uint8Array.from({ length: random() % 90 }, () => random() & 255)
    const qr = qryptBytes(bytes, {errorCorrectionLevel: levels[i % 4]})
    assert.deepEqual(decodeMatrix(qr.matrix()).bytes, bytes, `binary case ${i}`)
  }
})

test('pixel decoding and PNG headers remain consistent for typical symbols', () => {
  for (const payload of ['M19 VALIDATION', 'HELLO 🧪', 'https://example.com/secure?event=1']) {
    const qr = qrypt(payload, {errorCorrectionLevel:'Q'})
    assert.equal(decodePixels(toPixels(qr, {scale: 6}))?.text, payload)
    assert.deepEqual([...toPNG(qr, {scale: 2}).subarray(0,8)], [137,80,78,71,13,10,26,10])
  }
})

test('hostile image shapes and limits reject before work is allocated', () => {
  const blank = new Uint8Array(21*21)
  assert.equal(decodePixels({width:21,height:21,format:'gray',data:blank}), null)
  assert.throws(() => decodePixels({width:4096,height:4096,format:'gray',data:blank}), /dimensions/)
  assert.throws(() => decodePixels({width:32,height:32,format:'unknown',data:blank}), /format/)
  assert.throws(() => decodePixels({width:32,height:32,format:'gray',data:blank}), /length/)
  assert.throws(() => decodePixels({width:21,height:21,format:'gray',data:blank}, {maxCandidates:1000}), /candidate/)
  assert.throws(() => decodePixels({width:21,height:21,format:'gray',data:blank}, {maxFinders:1000}), /candidate/)
})

test('signed QR tampering, time limits and audience policy fail closed', async () => {
  const keyPair = await webcrypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify'])
  const issuer = 'https://qrypt.example', audience='attendance', purpose='entry'
  const token = await signQRPayload({ issuer, audience, purpose, keyId:'test-v1', privateKey:keyPair.privateKey,
    expiresInSeconds:60, now:1000, data:{ ticket:'T-1' } })
  const base = {issuer,audience,purpose,now:1001,resolveTrustedKey:()=>({issuer,keyId:'test-v1',publicKey:keyPair.publicKey,status:'active'})}
  assert.equal((await verifyQRPayload(token, base)).valid, true)
  assert.equal((await verifyQRPayload(token,{...base,audience:'other'})).reason,'wrong-audience')
  assert.equal((await verifyQRPayload(token,{...base,now:1060})).reason,'expired')
  assert.equal((await verifyQRPayload(token,{...base,now:999})).reason,'not-yet-valid')
  // Mutate the compact JWS signature without altering its base64url shape.
  const segments = token.split('.')
  for (let i=0; i<16; i++) {
    const signature = segments[2]
    const position = i % signature.length
    const replacement = signature[position] === 'A' ? 'B' : 'A'
    const altered = `${segments[0]}.${segments[1]}.${signature.slice(0, position)}${replacement}${signature.slice(position+1)}`
    const result = await verifyQRPayload(altered, base)
    assert.equal(result.valid,false)
    assert.ok(['malformed','invalid-signature'].includes(result.reason), `mutation ${i}: ${result.reason}`)
  }
  assert.equal((await verifyQRPayload(token,{...base,resolveTrustedKey:()=>({issuer,keyId:'test-v1',publicKey:keyPair.publicKey,status:'revoked'})})).reason,'revoked-key')
})

test('atomic replay callback permits one winner under concurrent verification', async () => {
  const pair = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify'])
  const issuer='https://qrypt.example'
  const token=await signQRPayload({issuer,audience:'checkin',purpose:'entry',keyId:'k',privateKey:pair.privateKey,expiresInSeconds:60,now:5000,data:'TICKET'})
  // Simulates the critical atomic uniqueness guarantee provided by a backend store.
  const redeemed=new Set()
  const options={issuer,audience:'checkin',purpose:'entry',now:5001,resolveTrustedKey:()=>({issuer,keyId:'k',status:'active',publicKey:pair.publicKey}),
    redeem:async (_claims,{redemptionKey})=>{
      if (redeemed.has(redemptionKey)) return false
      redeemed.add(redemptionKey)
      return true
    }}
  const results=await Promise.all(Array.from({length:8},()=>verifyQRPayload(token,options)))
  assert.equal(results.filter(x=>x.valid).length,1)
  assert.equal(results.filter(x=>x.reason==='replayed').length,7)
})

test('WebCrypto OperationError rejects malformed ECDSA input without masking other runtime faults', async () => {
  const pair = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify'])
  const issuer='https://qrypt.example'
  const token=await signQRPayload({issuer,audience:'test',purpose:'checkin',keyId:'k1',privateKey:pair.privateKey,expiresInSeconds:60,now:3000,data:'abc'})
  const options={issuer,audience:'test',purpose:'checkin',now:3001,resolvePublicKey:()=>pair.publicKey}
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto')
  try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle: {verify: async () => {const e=new Error('Bad ECDSA signature');e.name='OperationError';throw e}},
    }})
    assert.equal((await verifyQRPayload(token,options)).reason,'invalid-signature')
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle: {verify: async () => {throw new Error('Hardware key store unavailable')}},
    }})
    await assert.rejects(verifyQRPayload(token, options), /Hardware key store unavailable/)
  } finally {
    if (descriptor) Object.defineProperty(globalThis,'crypto',descriptor)
    else delete globalThis.crypto
  }
})
