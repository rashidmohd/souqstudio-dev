'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Lock, Pencil, Trash2 } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { BlockPreview } from '@/components/blocks/BlockPreview'

/**
 * The block library. E7 — `docs/composition-model.md` §3.6.
 *
 * Two collections, one schema: the blocks SouqStudio seeds, and the ones this
 * organization authored. **Saved blocks are the compounding asset** — design a
 * seasonal header once and every shop in the chain uses it — which is why the
 * shop's own come first rather than after a list they cannot change.
 *
 * **Duplicate is the primary action on a seeded block, not edit.** Every account
 * composes with the same four; editing one in place would change everybody's
 * library or fork it silently, and the copy is a starting point that already
 * works. That is also why there is no "new blank block" anywhere on this screen:
 * a blank artboard produces something worse than the default, and the owner
 * blames the product.
 */

export type LibraryBlock = {
  id: string
  name: string
  description: string | null
  repeats: boolean
  arrangements: Arrangement[]
  organizationId: string | null
  status: string
  locked: boolean
  planTier: string
}

type Props = {
  blocks: LibraryBlock[]
  kit: BrandKit
  canEdit: boolean
}

export function BlockLibrary({ blocks, kit, canEdit }: Props) {
  const mine = blocks.filter((block) => block.organizationId !== null)
  const seeded = blocks.filter((block) => block.organizationId === null)

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Your blocks"
        note={
          mine.length === 0
            ? 'None yet. Duplicate one below and change it — that is how a block of your own starts.'
            : 'Available in every book this organization makes.'
        }
        blocks={mine}
        kit={kit}
        canEdit={canEdit}
      />

      <Section
        title="Comes with every account"
        note="Read-only, and kept up to date by us. Duplicate one to make it yours."
        blocks={seeded}
        kit={kit}
        canEdit={canEdit}
      />
    </div>
  )
}

function Section({
  title,
  note,
  blocks,
  kit,
  canEdit,
}: {
  title: string
  note: string
  blocks: LibraryBlock[]
  kit: BrandKit
  canEdit: boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-subhead text-primary">{title}</h2>
        <p className="font-ui text-body-sm text-muted">{note}</p>
      </div>

      {blocks.length === 0 ? null : (
        <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {blocks.map((block) => (
            <BlockCard key={block.id} block={block} kit={kit} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </section>
  )
}

function BlockCard({
  block,
  kit,
  canEdit,
}: {
  block: LibraryBlock
  kit: BrandKit
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<'duplicate' | 'delete' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const mine = block.organizationId !== null

  async function duplicate() {
    setBusy('duplicate')
    setError(null)
    const response = await fetch('/api/v1/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId: block.id, name: block.name }),
    })
    const body = (await response.json()) as {
      data: { id: string } | null
      error: { message: string } | null
    }
    setBusy(null)
    if (body.data) router.push(`/card-designer/${body.data.id}`)
    else setError(body.error?.message ?? 'That could not be duplicated.')
  }

  async function remove() {
    setBusy('delete')
    setError(null)
    const response = await fetch(`/api/v1/blocks/${block.id}`, { method: 'DELETE' })
    const body = (await response.json()) as {
      data: { archivedInstead: boolean } | null
      error: { message: string } | null
    }
    setBusy(null)
    if (body.data === null) {
      setError(body.error?.message ?? 'That could not be removed.')
      return
    }
    // A block a book still draws is archived rather than deleted, and saying so
    // matters: the owner asked for it to be gone and it is still in a book.
    if (body.data.archivedInstead) {
      setError('A book still uses this block, so it was retired rather than deleted.')
    }
    router.refresh()
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0">
        {/* Natural aspect per block: a hero band letterboxed into a card's shape
            is not what the owner will get. */}
        <BlockPreview
          arrangements={block.arrangements}
          kit={kit}
          width={420}
          height={block.repeats ? 540 : 170}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-label font-medium text-primary">{block.name}</span>
        {block.locked ? (
          <span className="flex items-center gap-1 rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
            <Lock className="size-3" strokeWidth={1.75} aria-hidden="true" />
            {block.planTier}
          </span>
        ) : null}
        {mine && block.status !== 'published' ? (
          <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
            {block.status}
          </span>
        ) : null}
      </div>

      {block.description ? (
        <p className="font-ui text-body-sm text-muted">{block.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {mine ? (
          // `Button` has no `asChild`, so a navigation stays a Link with the
          // control's own shell rather than a button that pushes a route — the
          // middle-click and the status bar are worth keeping.
          <Link
            href={`/card-designer/${block.id}`}
            className="inline-flex h-control items-center gap-2 rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
          >
            <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Open
          </Link>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={!canEdit || block.locked}
            loading={busy === 'duplicate'}
            onClick={duplicate}
          >
            <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Duplicate
          </Button>
        )}

        {mine && canEdit ? (
          <Button type="button" variant="ghost" loading={busy === 'delete'} onClick={remove}>
            <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      {error ? <p className="font-ui text-body-sm text-critical-fg">{error}</p> : null}
    </li>
  )
}
