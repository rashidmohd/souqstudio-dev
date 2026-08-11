import { describe, it, expect } from 'vitest'
import { sealSecret, openSecret } from '@/lib/two-factor-secret'

describe('two-factor secret seam', () => {
  it('round-trips a secret', () => {
    expect(openSecret(sealSecret('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP')
  })

  it('stamps a version, so a later migration can tell the forms apart', () => {
    // This is the whole reason the module exists. Without the tag, encrypting
    // later means rewriting every row in one transaction, because nothing can
    // distinguish an encrypted value from a plaintext one.
    expect(sealSecret('JBSWY3DPEHPK3PXP')).toBe('v0:JBSWY3DPEHPK3PXP')
  })

  it('refuses an untagged value rather than guessing it is plaintext', () => {
    expect(() => openSecret('JBSWY3DPEHPK3PXP')).toThrow(/version tag/)
  })

  it('refuses a version it does not know', () => {
    // A v1 value reaching a build that only understands v0 must fail loudly.
    // Treating it as plaintext would hand ciphertext to otplib and surface as
    // "your authenticator app is wrong", which is the least debuggable outcome.
    expect(() => openSecret('v1:9f8e7d')).toThrow(/Unknown two-factor secret version/)
  })

  it('leaves a secret containing the separator intact', () => {
    // Only the first separator is the delimiter. Base32 has no colons today,
    // but splitting on all of them would be a trap waiting for v1's payload.
    expect(openSecret('v0:abc:def')).toBe('abc:def')
  })
})
