import bcrypt from 'bcryptjs'

/**
 * Password hashing for staff accounts. Same algorithm and cost as the shop
 * owner side — see apps/web/lib/password.ts for why bcryptjs rather than
 * native bcrypt.
 *
 * There is no `hashPassword` here. Nothing in this app sets a password: staff
 * accounts are created from a shell with
 * `pnpm --filter @souqstudio/db admin:create`, so the only operation the panel
 * needs is verification.
 */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * A bcrypt hash of a value nothing will ever match, used to burn the same time
 * as a real comparison when the email does not exist.
 *
 * Without this, "no such admin" returns in microseconds while a real one costs
 * ~250ms, and that difference alone tells whoever is probing which addresses
 * belong to staff. Call it in the not-found branch and discard the result.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1oJEwqR0F0lGkGr0h0M4iX0LZ9jTf2S'

export async function burnPasswordTiming(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH)
}
