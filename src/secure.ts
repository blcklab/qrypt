/** Optional ES256 JWS compact security profile. No crypto is imported into QR encoding. */
import { toUTF8Bytes } from './encoding/utf8.js'
import { decodeBase64url, decodeUTF8, encodeBase64url } from './secure/base64url.js'
import { identifier, nonEmptyString, normalizeJSON, onlyFields, plainRecord, positiveSeconds, unixSeconds, validateKey } from './secure/validation.js'
import type { SecureQRClaims, SignQRPayloadOptions, VerifyQRPayloadOptions, SecureQRVerification, SecureTrustedKey } from './secure/types.js'

export type { SecureJsonValue, SecureKey, SecureQRClaims, SignQRPayloadOptions, VerifyQRPayloadOptions, SecureQRVerification, SecureTrustedKey, SecureQRKeyQuery, SecureQRRevocationContext, SecureQRRedemptionContext } from './secure/types.js'

const PROFILE = 'qrypt+jwt'
const MAX_TOKEN_LENGTH = 2953 // upper bound: actual QR capacity also depends on ECC and segmentation
const SIGNATURE_BYTES = 64

interface WebCryptoRuntime {
  readonly subtle: {
    sign(algorithm: { name: string; hash: string }, key: unknown, data: Uint8Array): Promise<ArrayBuffer>
    verify(algorithm: { name: string; hash: string }, key: unknown, signature: Uint8Array, data: Uint8Array): Promise<boolean>
  }
  getRandomValues<T extends Uint8Array>(value: T): T
}

function webCrypto(): WebCryptoRuntime {
  const runtime = (globalThis as typeof globalThis & { crypto?: WebCryptoRuntime }).crypto
  if (!runtime?.subtle || typeof runtime.getRandomValues !== 'function') {
    throw new Error('Secure QR requires WebCrypto in a secure context (or supported Node.js runtime).')
  }
  return runtime
}

function currentTime(now?: number): number {
  const seconds = now ?? Math.floor(Date.now() / 1000)
  unixSeconds(seconds, 'now')
  return seconds
}

function tokenId(crypto: WebCryptoRuntime): string {
  // Hex IDs always begin with a safe ASCII identifier character.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
}

/** Issue a compact JWS using only WebCrypto ES256 (P-256 / SHA-256). */
export async function signQRPayload(options: SignQRPayloadOptions): Promise<string> {
  if (!plainRecord(options)) throw new TypeError('Secure QR signing options must be a plain object.')
  onlyFields(options, ['issuer', 'audience', 'purpose', 'keyId', 'privateKey', 'data', 'expiresInSeconds', 'now', 'notBefore', 'tokenId'], 'signing')
  const { issuer, audience, purpose, keyId, privateKey, expiresInSeconds } = options
  nonEmptyString(issuer, 'issuer')
  nonEmptyString(audience, 'audience')
  identifier(purpose, 'purpose')
  identifier(keyId, 'keyId')
  validateKey(privateKey, 'sign')
  positiveSeconds(expiresInSeconds, 'expiresInSeconds', 604800)
  const iat = currentTime(options.now)
  const nbf = options.notBefore ?? iat
  unixSeconds(nbf, 'notBefore')
  const exp = iat + expiresInSeconds
  unixSeconds(exp, 'exp')
  if (nbf >= exp) throw new RangeError('notBefore must precede expiration.')
  const crypto = webCrypto()
  const jti = options.tokenId ?? tokenId(crypto)
  identifier(jti, 'tokenId')
  const data = normalizeJSON(options.data)
  const header = { alg: 'ES256', typ: PROFILE, kid: keyId }
  const claims: SecureQRClaims = { iss: issuer, aud: audience, purpose, iat, nbf, exp, jti, data }
  const signingInput = `${encodeBase64url(toUTF8Bytes(JSON.stringify(header)))}.${encodeBase64url(toUTF8Bytes(JSON.stringify(claims)))}`
  if (signingInput.length + 1 + 86 > MAX_TOKEN_LENGTH) throw new RangeError('Secure QR token exceeds maximum QR byte capacity.')
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toUTF8Bytes(signingInput)))
  if (raw.length !== SIGNATURE_BYTES) throw new Error('WebCrypto did not produce a 64-byte ES256 signature.')
  const token = `${signingInput}.${encodeBase64url(raw)}`
  if (token.length > MAX_TOKEN_LENGTH) throw new RangeError('Secure QR token exceeds maximum QR byte capacity.')
  return token
}

function parseClaims(text: string): SecureQRClaims | null {
  let parsed: unknown
  try { parsed = JSON.parse(text) as unknown } catch { return null }
  if (!plainRecord(parsed)) return null
  if (Object.keys(parsed).length !== 8) return null
  const { iss, aud, purpose, iat, nbf, exp, jti, data } = parsed
  try {
    nonEmptyString(iss, 'iss')
    nonEmptyString(aud, 'aud')
    identifier(purpose, 'purpose')
    unixSeconds(iat, 'iat')
    unixSeconds(nbf, 'nbf')
    unixSeconds(exp, 'exp')
    identifier(jti, 'jti')
    const safeData = normalizeJSON(data)
    if (exp <= iat || nbf >= exp || exp - iat > 604800) return null
    const claims: SecureQRClaims = { iss, aud, purpose, iat, nbf, exp, jti, data: safeData }
    // A deliberate strict profile: canonical member order, no duplicate properties.
    if (JSON.stringify(claims) !== text) return null
    return claims
  } catch { return null }
}

/** A collision-free compound identifier. Only use for uniqueness; the token contents are not secret. */
export function secureRedemptionKey(claims: Pick<SecureQRClaims, 'iss' | 'aud' | 'purpose' | 'jti'>): string {
  nonEmptyString(claims.iss, 'iss')
  nonEmptyString(claims.aud, 'aud')
  identifier(claims.purpose, 'purpose')
  identifier(claims.jti, 'jti')
  return JSON.stringify([claims.iss, claims.aud, claims.purpose, claims.jti])
}

/** Reject malformed trusted-store records rather than interpreting unexpected key policies. */
function validateTrustedRecord(value: SecureTrustedKey, issuer: string, keyId: string): 'ok' | 'untrusted-key' | 'revoked-key' {
  if (!plainRecord(value)) throw new TypeError('Trusted key store returned an invalid key record.')
  onlyFields(value, ['issuer', 'keyId', 'publicKey', 'status', 'issuedFrom', 'issuedUntil', 'verifyUntil'], 'trusted key')
  nonEmptyString(value.issuer, 'trusted issuer')
  identifier(value.keyId, 'trusted keyId')
  if (!['active', 'retired', 'revoked'].includes(value.status)) throw new TypeError('Trusted key status must be active, retired, or revoked.')
  if (value.issuedFrom !== undefined) unixSeconds(value.issuedFrom, 'issuedFrom')
  if (value.issuedUntil !== undefined) unixSeconds(value.issuedUntil, 'issuedUntil')
  if (value.verifyUntil !== undefined) unixSeconds(value.verifyUntil, 'verifyUntil')
  if (value.issuedFrom !== undefined && value.issuedUntil !== undefined && value.issuedFrom >= value.issuedUntil) {
    throw new RangeError('issuedFrom must precede issuedUntil.')
  }
  if (value.status === 'retired' && (value.issuedUntil === undefined || value.verifyUntil === undefined)) {
    throw new TypeError('Retired keys require issuedUntil and verifyUntil.')
  }
  // Explicitly bind the key to the configured issuer and to the JOSE kid.
  if (value.issuer !== issuer || value.keyId !== keyId) return 'untrusted-key'
  if (value.status === 'revoked') return 'revoked-key'
  validateKey(value.publicKey, 'verify')
  return 'ok'
}

/** Verify a Qrypt-profile JWS against trusted issuer/audience/purpose and application policies. */
export async function verifyQRPayload(token: string, options: VerifyQRPayloadOptions): Promise<SecureQRVerification> {
  if (!plainRecord(options)) throw new TypeError('Secure QR verification options must be a plain object.')
  onlyFields(options, ['issuer', 'audience', 'purpose', 'resolvePublicKey', 'resolveTrustedKey', 'now', 'clockToleranceSeconds', 'maxAgeSeconds', 'isRevoked', 'redeem'], 'verification')
  nonEmptyString(options.issuer, 'issuer')
  nonEmptyString(options.audience, 'audience')
  identifier(options.purpose, 'purpose')
  const usingLegacy = typeof options.resolvePublicKey === 'function'
  const usingTrusted = typeof options.resolveTrustedKey === 'function'
  if (usingLegacy === usingTrusted || ('resolvePublicKey' in options && 'resolveTrustedKey' in options)) {
    throw new TypeError('Supply exactly one of resolvePublicKey or resolveTrustedKey.')
  }
  const now = currentTime(options.now)
  const leeway = options.clockToleranceSeconds ?? 0
  if (!Number.isSafeInteger(leeway) || leeway < 0 || leeway > 300) throw new RangeError('clockToleranceSeconds must be 0–300.')
  const maxAge = options.maxAgeSeconds
  if (maxAge !== undefined) positiveSeconds(maxAge, 'maxAgeSeconds', 604800)
  if (options.redeem !== undefined && typeof options.redeem !== 'function') throw new TypeError('redeem must be a function.')
  if (options.isRevoked !== undefined && typeof options.isRevoked !== 'function') throw new TypeError('isRevoked must be a function.')
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || token.length === 0) return { valid: false, reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed' }
  const [encodedHeader, encodedClaims, encodedSignature] = parts
  if (!encodedHeader || !encodedClaims || !encodedSignature) return { valid: false, reason: 'malformed' }
  let headerText: string
  let claimsText: string
  let signature: Uint8Array
  try {
    headerText = decodeUTF8(decodeBase64url(encodedHeader, 512))
    claimsText = decodeUTF8(decodeBase64url(encodedClaims, 2048))
    signature = decodeBase64url(encodedSignature, SIGNATURE_BYTES)
  } catch { return { valid: false, reason: 'malformed' } }
  if (signature.length !== SIGNATURE_BYTES) return { valid: false, reason: 'malformed' }
  let header: unknown
  try { header = JSON.parse(headerText) as unknown } catch { return { valid: false, reason: 'invalid-header' } }
  if (!plainRecord(header) || typeof header.kid !== 'string') return { valid: false, reason: 'invalid-header' }
  try { identifier(header.kid, 'kid') } catch { return { valid: false, reason: 'invalid-header' } }
  if (JSON.stringify({ alg: 'ES256', typ: PROFILE, kid: header.kid }) !== headerText) {
    return { valid: false, reason: 'invalid-header' }
  }
  let key
  let trustedRecord: SecureTrustedKey | null = null
  if (usingTrusted && options.resolveTrustedKey) {
    // The only issuer supplied to this callback is the configured, trusted issuer.
    trustedRecord = await options.resolveTrustedKey({ issuer: options.issuer, keyId: header.kid })
    if (trustedRecord === null) return { valid: false, reason: 'unknown-key' }
    const status = validateTrustedRecord(trustedRecord, options.issuer, header.kid)
    if (status !== 'ok') return { valid: false, reason: status }
    key = trustedRecord.publicKey
  } else if (options.resolvePublicKey) {
    key = await options.resolvePublicKey(header.kid)
    if (key === null) return { valid: false, reason: 'unknown-key' }
    // Legacy caller must bind the key to the trusted issuer in its allowlist.
    validateKey(key, 'verify')
  } else {
    throw new TypeError('No trusted verification key resolver provided.')
  }
  const signedBytes = toUTF8Bytes(`${encodedHeader}.${encodedClaims}`)
  let validSignature: boolean
  try {
    validSignature = await webCrypto().subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signedBytes)
  } catch (error) {
    // Some WebCrypto implementations throw OperationError for invalid ECDSA
    // signature encodings; others return false. Both must reject the token.
    // Unexpected runtime/key errors remain visible as integration failures.
    if (error instanceof Error && error.name === 'OperationError') {
      return { valid: false, reason: 'invalid-signature' }
    }
    throw error
  }
  if (!validSignature) return { valid: false, reason: 'invalid-signature' }
  const claims = parseClaims(claimsText)
  if (!claims) return { valid: false, reason: 'invalid-claims' }
  if (claims.iss !== options.issuer) return { valid: false, reason: 'wrong-issuer' }
  if (claims.aud !== options.audience) return { valid: false, reason: 'wrong-audience' }
  if (claims.purpose !== options.purpose) return { valid: false, reason: 'wrong-purpose' }
  if (now + leeway < claims.nbf || now + leeway < claims.iat) return { valid: false, reason: 'not-yet-valid' }
  if (now - leeway >= claims.exp) return { valid: false, reason: 'expired' }
  if (maxAge !== undefined && now - claims.iat - leeway > maxAge) return { valid: false, reason: 'too-old' }
  if (trustedRecord) {
    // Issue-time and verification-time restrictions are distinct, especially on retirement.
    if ((trustedRecord.issuedFrom !== undefined && claims.iat < trustedRecord.issuedFrom) ||
        (trustedRecord.issuedUntil !== undefined && claims.iat >= trustedRecord.issuedUntil) ||
        (trustedRecord.verifyUntil !== undefined && now >= trustedRecord.verifyUntil)) {
      return { valid: false, reason: 'inactive-key' }
    }
  }
  const context = { claims, keyId: header.kid }
  if (options.isRevoked && await options.isRevoked(context)) return { valid: false, reason: 'revoked' }
  if (options.redeem && !(await options.redeem(claims, { ...context, redemptionKey: secureRedemptionKey(claims) }))) {
    return { valid: false, reason: 'replayed' }
  }
  return { valid: true, claims, keyId: header.kid }
}
