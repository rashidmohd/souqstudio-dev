/**
 * Create or update a SouqStudio staff account. E13-01.
 *
 *   pnpm --filter @souqstudio/db admin:create -- <email> <role> [name]
 *
 * **This exists because there is no other way in.** `apps/admin` reads
 * `admin_users` and nothing writes to it: there is no sign-up, no invite, and
 * deliberately no bootstrap route that creates the first admin when the table is
 * empty. Such a route is a door that stays unlocked for as long as nobody
 * notices it, on the one app that can reach every organization on the platform.
 * A shell command against `DATABASE_URL` is the credential instead.
 *
 * **Not in `seed.ts`.** The seed runs on every deploy and must be idempotent and
 * safe; this writes a password. `pnpm db:seed` is something you run without
 * thinking, and creating staff credentials is not.
 *
 * The password is generated here rather than typed, and printed once. Nothing
 * stores it and nothing can print it again, so a lost one is a re-run with the
 * same email, which rotates it.
 */
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/client'

/** The three roles E13 specifies. Anything else is a typo, not a new role. */
const ROLES = ['super_admin', 'catalog_manager', 'support_agent'] as const
type AdminRole = (typeof ROLES)[number]

/** Same cost as the shop owner side. See apps/web/lib/password.ts. */
const ROUNDS = 12

// pnpm forwards the separator verbatim on some versions. See grant-credits.ts.
const args = process.argv.slice(2).filter((arg) => arg !== '--')
const [emailArg, roleArg, ...nameParts] = args

function usage(problem: string): never {
  console.error(`\n${problem}\n`)
  console.error('  pnpm --filter @souqstudio/db admin:create -- <email> <role> [name]')
  console.error(`  roles: ${ROLES.join(' | ')}\n`)
  process.exit(1)
}

if (emailArg === undefined) usage('Say which email address.')
if (roleArg === undefined) usage('Say which role.')
if (!ROLES.includes(roleArg as AdminRole)) usage(`"${roleArg}" is not a role.`)

const email = emailArg.trim().toLowerCase()
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) usage(`"${emailArg}" is not an email address.`)

const role = roleArg as AdminRole
const name = nameParts.join(' ').trim() || null

/**
 * 24 bytes of base64url. Long enough that the password is not the weak link and
 * short enough to read off a screen once.
 */
function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

async function main() {
  const password = generatePassword()
  const passwordHash = await bcrypt.hash(password, ROUNDS)

  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, role: true },
  })

  /*
   * An existing row is updated rather than refused, because the two reasons to
   * re-run this are both legitimate: a forgotten password, and a role change.
   * `isActive` is reset to true on purpose — re-running against a switched-off
   * admin is how they come back.
   */
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, role, passwordHash, ...(name === null ? {} : { name }) },
    update: { role, passwordHash, isActive: true, ...(name === null ? {} : { name }) },
    select: { id: true, email: true, role: true, name: true },
  })

  /*
   * Every existing session for this admin is ended. A password rotation that
   * leaves the old sessions alive has rotated nothing, and a role change that
   * does not take effect until the next login is a role change nobody can trust.
   */
  const ended = await prisma.adminSession.updateMany({
    where: { adminUserId: admin.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  console.log('')
  console.log(existing === null ? '  Admin created.' : '  Admin updated.')
  console.log('')
  console.log(`  email     ${admin.email}`)
  console.log(`  role      ${admin.role}`)
  console.log(`  name      ${admin.name ?? '(none)'}`)
  console.log(`  password  ${password}`)
  console.log('')
  console.log('  This password is not stored and cannot be printed again.')
  if (ended.count > 0) {
    console.log(`  Ended ${ended.count} existing session(s).`)
  }
  console.log('')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
