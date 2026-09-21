/**
 * A manual credit grant — for testing generation against a real account.
 *
 *   pnpm --filter @souqstudio/db credits:grant -- <email> <credits>
 *
 * **There is no admin screen for this, and this is not one.** The admin panel
 * has no credits tool, and the only two paths that add credits in the product
 * are a paid Stripe invoice and a paid top-up. This exists so that somebody
 * testing image generation does not have to put a card through Stripe to get
 * the five credits a cover costs.
 *
 * **Written as a real `credit_topups` row rather than a bare increment.**
 * `grantTopupCredits` is the same function the Stripe webhook calls: it moves
 * the row to `succeeded` and increments `topupRemaining` in one transaction
 * with the org context set, so RLS applies and the ledger still explains where
 * the credits came from. A bare `UPDATE` on the balance would leave an account
 * whose history does not add up, which is the kind of thing that is only ever
 * discovered while investigating something else.
 *
 * `amount: 0` and no Stripe ids, because nothing was paid and the row should
 * say so.
 *
 * **Both arguments are required and nothing is defaulted.** It writes to
 * whatever `DATABASE_URL` points at, which in this repo is the shared Railway
 * database rather than a local one.
 */
import { prisma } from '../src/client'
import { getCreditSnapshot, grantTopupCredits } from '../src/credits'

/*
 * **The leading `--` is dropped, because pnpm does not always eat it.** Some
 * versions consume the separator and hand the script its arguments; this one
 * forwards it verbatim, so the script saw `--` as the email and printed its own
 * usage line at somebody who had typed the command correctly. Filtering it here
 * costs nothing and works whichever way the runner behaves.
 */
const [emailArg, amountArg] = process.argv.slice(2).filter((arg) => arg !== '--')
const CREDITS = Number(amountArg)

if (emailArg === undefined || !Number.isInteger(CREDITS) || CREDITS <= 0 || CREDITS > 5000) {
  console.error('usage: pnpm --filter @souqstudio/db credits:grant -- <email> <credits 1–5000>')
  process.exit(1)
}

const EMAIL: string = emailArg

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
    select: { email: true, organizationId: true },
  })

  if (user === null) {
    console.error(`No user with the email ${EMAIL} on this database.`)
    process.exit(1)
  }

  // Read separately rather than through the relation: printing which
  // organization was matched is the check that this granted to the right one.
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true },
  })

  const before = await getCreditSnapshot(user.organizationId)

  const topup = await prisma.creditTopup.create({
    data: {
      organizationId: user.organizationId,
      credits: CREDITS,
      amount: 0,
      currency: 'usd',
      status: 'pending',
    },
    select: { id: true },
  })

  const granted = await grantTopupCredits({
    organizationId: user.organizationId,
    topupId: topup.id,
  })

  const after = await getCreditSnapshot(user.organizationId)

  console.log('account: ', user.email, '·', organization?.name ?? 'no organization')
  console.log('granted: ', granted.granted, 'credits · topup', topup.id)
  console.log(
    'before:  ',
    `${before.total} (monthly ${before.monthlyRemaining} + topup ${before.topupRemaining})`
  )
  console.log(
    'after:   ',
    `${after.total} (monthly ${after.monthlyRemaining} + topup ${after.topupRemaining})`
  )

  await prisma.$disconnect()
}

void main()
