import Link from 'next/link'
import { prisma } from '@souqstudio/db'
import { requireAdminRole } from '@/lib/admin-auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/states'

/**
 * Cover art direction. E13, AI prompt management.
 *
 * **These rows are the only model instructions in the product that live in the
 * database.** The character, brand-direction, logo and magic-block prompts are
 * all code — `apps/worker/src/lib/*-prompt.ts` — and changing one is a deploy.
 * The cover prompts moved out of code in September for a stated reason: a
 * prompt is tuned by looking at what the model sent back, and content that
 * needs a release to change is content nobody tunes. Until this screen existed
 * they were tunable in principle and editable only with SQL.
 *
 * Grouped the way the owner's picker groups them, so what a reviewer sees here
 * is the shape of what a shop sees there.
 */
export const dynamic = 'force-dynamic'

const GROUP_LABELS: Readonly<Record<string, string>> = {
  everyday: 'Everyday',
  season: 'Season',
  occasion: 'Occasion',
}

export default async function PromptsPage() {
  await requireAdminRole('catalog_manager')

  const prompts = await prisma.coverPrompt.findMany({
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    select: {
      id: true,
      slug: true,
      label: true,
      hint: true,
      scene: true,
      person: true,
      group: true,
      sortOrder: true,
      isActive: true,
      updatedAt: true,
    },
  })

  const groups = [...new Set(prompts.map((prompt) => prompt.group))]
  const active = prompts.filter((prompt) => prompt.isActive).length

  return (
    <>
      <PageHeader
        title="AI prompts"
        description="The art direction a shop's cover is generated from."
        action={
          <ButtonLink href="/prompts/new" variant="primary">
            Add prompt
          </ButtonLink>
        }
      />

      <div className="rounded-block bg-sand p-3">
        <p className="text-body text-charcoal">
          Every scene is a photograph of a shop: a place, a person doing something, and a
          light. None of them says what the person wears, because the uniform comes from
          the character reference for that shop.
        </p>
        <p className="text-body-sm text-secondary">
          Edits here survive a deploy. The seed only inserts a slug it has never seen, so
          it never writes over tuning.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusPill tone="positive">{active} offered</StatusPill>
        <StatusPill tone="quiet">{prompts.length - active} retired</StatusPill>
      </div>

      {prompts.length === 0 ? (
        <EmptyState
          title="No prompts yet"
          body="Run pnpm db:seed to load the nineteen shipped scenes, or write the first one here."
          action={
            <Link href="/prompts/new" className="text-body text-link underline">
              Add prompt
            </Link>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group} className="flex flex-col gap-3">
            <h2 className="text-heading text-primary">{GROUP_LABELS[group] ?? group}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {prompts
                .filter((prompt) => prompt.group === group)
                .map((prompt) => (
                  <Card key={prompt.id} className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={`/prompts/${prompt.id}`}
                          className="truncate text-subhead text-link underline-offset-2 hover:underline"
                        >
                          {prompt.label}
                        </Link>
                        {prompt.hint === null ? null : (
                          <span className="truncate text-body-sm text-secondary">
                            {prompt.hint}
                          </span>
                        )}
                      </div>
                      {prompt.isActive ? (
                        <StatusPill tone="positive">Offered</StatusPill>
                      ) : (
                        <StatusPill tone="quiet">Retired</StatusPill>
                      )}
                    </div>

                    {/*
                      The scene is shown clamped rather than hidden behind the
                      row. Two prompts are told apart by their scene and not by
                      their label, and a list that makes you open each one to
                      compare them is a list nobody compares anything in.
                    */}
                    <p className="line-clamp-3 text-body-sm text-secondary">{prompt.scene}</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="neutral">
                        {prompt.person === 'staff'
                          ? 'Staff'
                          : prompt.person === 'customer'
                            ? 'A customer'
                            : 'Nobody'}
                      </StatusPill>
                      <span className="text-label text-muted">
                        <Figure size="data-sm">{prompt.slug}</Figure>
                      </span>
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
