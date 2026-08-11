import bcrypt from 'bcryptjs'

/**
 * Password hashing. E1-02 specifies bcrypt at 12 rounds.
 *
 * bcryptjs rather than native bcrypt: same algorithm, no node-gyp build step to
 * fail on Vercel or Railway. It is slower per hash, which for a KDF is the point.
 */
const ROUNDS = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * A bcrypt hash of a value nothing will ever match, used to burn the same time
 * as a real comparison when the email does not exist.
 *
 * Without this, "no such user" returns in microseconds while a real user costs
 * ~250ms, and that difference alone tells an attacker which addresses are
 * registered. Call it in the not-found branch and discard the result.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1oJEwqR0F0lGkGr0h0M4iX0LZ9jTf2S'

export async function burnPasswordTiming(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH)
}
