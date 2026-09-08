'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LibraryBig, Lock, Pencil, Trash2 } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { BlockPreview } from '@/components/blocks/BlockPreview'
import { BlockImportDialog } from '@/components/blocks/BlockImportDialog'

/**
 * The block library. E7 — `docs/composition-model.md` §3.6.
 *
 * Two collections, one schema: the blocks SouqStudio seeds, and the ones this
 * organization authored. **Only the second is on this page**, and that is the
 * change the library outgrowing four blocks forced.
 *
 * Both used to be printed here, the shop's own above ours. At four seeded blocks
 * that read as one screen with two halves; at sixty-seven it read as a catalog
 * with the shop's own work stranded at the top of it. The collections are not
 * peers — one is the shop's, editable, and the reason to open the screen; the
 * other is a shelf you take something off. So the shelf became a picker behind
 * "Add from library", with a filter, which is also what lets an owner who came
 * for a footer see footers rather than scroll past sixty-two other things.
 *
 * **Duplicate is still how a block starts, not a blank artboard.** Importing is
 * duplicating with the trip through the designer removed: the copy is the shop's
 * from the moment it lands, and §3.6's rule — an empty canvas produces something
 * worse than the default — is untouched.
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
  const router = useRouter()
  const [importing, setImporting] = React.useState(false)

  const mine = blocks.filter((block) => block.organizationId !== null)
  const seeded = blocks.filter((block) => block.organizationId === null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-subhead text-primary">Your blocks</h2>
          <p className="font-ui text-body-sm text-muted">
            Available in every book this organization makes.
          </p>
        </div>

        {/* One primary per region: when there is nothing here yet the empty
            state carries the action, so this button would be the second one
            saying the same thing. */}
        {canEdit && mine.length > 0 ? (
          <Button type="button" variant="primary" onClick={() => setImporting(true)}>
            <LibraryBig className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Add from library
          </Button>
        ) : null}
      </div>

      {mine.length === 0 ? (
        <EmptyState
          kind="empty"
          title="No blocks of your own yet"
          body={`Start from one of the ${seeded.length} we ship — an offer card, a header, a footer, a seasonal band. Add the ones you want and change them from there.`}
          action={{
            label: 'Add from library',
            ...(canEdit
              ? { onClick: () => setImporting(true) }
              : {
                  disabled: true,
                  disabledReason: 'Only an owner or a manager can add blocks.',
                }),
          }}
        />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {mine.map((block) => (
            <BlockCard key={block.id} block={block} kit={kit} canEdit={canEdit} />
          ))}
        </ul>
      )}

      <BlockImportDialog
        open={importing}
        onOpenChange={setImporting}
        blocks={seeded}
        kit={kit}
        onImported={() => router.refresh()}
      />
    </div>
  )
}

const PREVIEW_WIDTH = 420

function previewSize(block: LibraryBlock): { width: number; height: number } {
  const arrangement = block.arrangements[0]
  // A repeating card is shown in the shape a booklet cell actually is, always —
  // it carries four arrangements and the tall one is the one it was designed in.
  if (block.repeats || arrangement === undefined) return { width: PREVIEW_WIDTH, height: 540 }

  const middle = Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)
  const aspect = Math.min(6, Math.max(0.5, middle))
  return { width: PREVIEW_WIDTH, height: Math.round(PREVIEW_WIDTH / aspect) }
}

/**
 * One of the shop's own blocks.
 *
 * **Only ever theirs now.** It used to render a seeded block too, with
 * "Duplicate" where "Open" is — that branch moved into `BlockImportDialog`,
 * where picking several at once is the point. A card that had to ask which
 * collection it belonged to before it knew what its buttons were is a card doing
 * two jobs.
 */
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
  const [busy, setBusy] = React.useState<'delete' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

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
            is not what the owner will get. A block placed once is drawn at the
            shape its own aspect range says it was designed for — one flat height
            for all of them made a cover, a page panel and a footer strip look
            like the same object. */}
        <BlockPreview arrangements={block.arrangements} kit={kit} {...previewSize(block)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-label font-medium text-primary">{block.name}</span>
        {block.locked ? (
          <span className="flex items-center gap-1 rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
            <Lock className="size-3" strokeWidth={1.75} aria-hidden="true" />
            {block.planTier}
          </span>
        ) : null}
        {block.status !== 'published' ? (
          <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
            {block.status}
          </span>
        ) : null}
      </div>

      {block.description ? (
        <p className="font-ui text-body-sm text-muted">{block.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {/* `Button` has no `asChild`, so a navigation stays a Link with the
            control's own shell rather than a button that pushes a route — the
            middle-click and the status bar are worth keeping. */}
        <Link
          href={`/card-designer/${block.id}`}
          className="inline-flex h-control items-center gap-2 rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
        >
          <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Open
        </Link>

        {canEdit ? (
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
