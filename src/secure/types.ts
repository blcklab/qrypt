/** JSON data only: no functions, BigInt, undefined, circular objects, or custom classes. */
export type SecureJsonValue = null | boolean | number | string | SecureJsonValue[] | { readonly [key: string]: SecureJsonValue }

/** Standard ES256 JWS claims under Qrypt's explicit, strict security profile. */
export interface SecureQRClaims {
  readonly iss: string
  readonly aud: string
  readonly purpose: string
  readonly iat: number
  readonly nbf: number
  readonly exp: number
  readonly jti: string
  readonly data: SecureJsonValue
}

/** Native WebCrypto CryptoKey is accepted structurally; no DOM type dependency. */
export interface SecureKey {
  readonly type: string
  readonly algorithm: { readonly name: string; readonly namedCurve?: string }
  readonly usages: readonly string[]
}

export interface SignQRPayloadOptions {
  readonly issuer: string
  readonly audience: string
  readonly purpose: string
  readonly keyId: string
  readonly privateKey: SecureKey
  readonly data: SecureJsonValue
  /** Positive integer, up to 7 days. Choose short lifetimes for bearer access. */
  readonly expiresInSeconds: number
  /** Unix seconds. Defaults to the local wall clock; inject for tests. */
  readonly now?: number
  /** Optional Unix seconds; defaults to issue time. */
  readonly notBefore?: number
  /** Optional unique ID; otherwise 128 bits from secure OS randomness. */
  readonly tokenId?: string
}

/** A key record supplied by a trusted application-managed key store. Never parsed from a QR. */
export interface SecureTrustedKey {
  readonly issuer: string
  readonly keyId: string
  readonly publicKey: SecureKey
  /** Retired keys can verify older tokens until verifyUntil; revoked keys never verify. */
  readonly status: 'active' | 'retired' | 'revoked'
  /** Optional inclusive earliest allowed token issuance time (Unix seconds). */
  readonly issuedFrom?: number
  /** Exclusive latest permitted token issuance time (Unix seconds). Required for retired keys. */
  readonly issuedUntil?: number
  /** Exclusive verification cutoff (Unix seconds). Required for retired keys. */
  readonly verifyUntil?: number
}

export interface SecureQRKeyQuery {
  /** Configured/trusted issuer; never copied from unverified token claims. */
  readonly issuer: string
  /** Validated but untrusted JOSE key identifier. Local lookups only. */
  readonly keyId: string
}

export interface SecureQRRevocationContext {
  readonly claims: Readonly<SecureQRClaims>
  readonly keyId: string
}

export interface SecureQRRedemptionContext extends SecureQRRevocationContext {
  /** Collision-free per-(issuer,audience,purpose,jti) identifier, suitable as a DB unique key. */
  readonly redemptionKey: string
}

type VerifyQRCommonOptions = {
  /** A trusted issuer, never inferred from an unverified token. */
  readonly issuer: string
  readonly audience: string
  readonly purpose: string
  readonly now?: number
  /** Small nonnegative integer allowance for clock drift, maximum 300 seconds. */
  readonly clockToleranceSeconds?: number
  /** Optional maximum token age (seconds), independent of exp. */
  readonly maxAgeSeconds?: number
  /** Called only after signature, claims, trusted-key status, and time checks. True rejects. */
  readonly isRevoked?: (context: Readonly<SecureQRRevocationContext>) => boolean | Promise<boolean>
  /** MUST perform a durable atomic consume-if-unused operation; true = consumed. */
  readonly redeem?: (claims: Readonly<SecureQRClaims>, context: Readonly<SecureQRRedemptionContext>) => boolean | Promise<boolean>
}

/** Use one trusted-key source, never both. Legacy key callback remains supported. */
export type VerifyQRPayloadOptions = VerifyQRCommonOptions & (
  | {
    /** Legacy trusted allowlist callback; binding to issuer is caller's responsibility. */
    readonly resolvePublicKey: (keyId: string) => SecureKey | null | Promise<SecureKey | null>
    readonly resolveTrustedKey?: never
  }
  | {
    /** Preferred: supplies explicit issuer-bound, lifecycle-aware verification keys. */
    readonly resolveTrustedKey: (query: Readonly<SecureQRKeyQuery>) => SecureTrustedKey | null | Promise<SecureTrustedKey | null>
    readonly resolvePublicKey?: never
  }
)

export type SecureQRVerification =
  | { readonly valid: true; readonly claims: Readonly<SecureQRClaims>; readonly keyId: string }
  | { readonly valid: false; readonly reason: 'malformed' | 'invalid-header' | 'unknown-key' | 'invalid-signature' | 'invalid-claims' | 'wrong-issuer' | 'wrong-audience' | 'wrong-purpose' | 'not-yet-valid' | 'expired' | 'too-old' | 'replayed' | 'untrusted-key' | 'revoked-key' | 'inactive-key' | 'revoked' }
