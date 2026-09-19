'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The block designer, as a window over the offer book editor.
 *
 * **The alternative was navigating away and finding the way back**, with a
 * `returnTo` on `/card-designer/[blockId]` — which means validating a
 * redirect target on every load, losing the book's scroll and selection, and
 * asking an owner to trust that "back" lands where they started. A window keeps
 * the book mounted underneath and replaces "go back" with "save and close",
 * which is a contract rather than a hope.
 *
 * **It is a native `<dialog>`, and that is load-bearing rather than
 * convenient.** Three things follow from it and none of them would from a
 * positioned div:
 *
 * - The page behind goes inert, so the artboard underneath cannot be clicked
 *   through to.
 * - Focus is contained, without a hand-rolled trap.
 * - `document.querySelector('dialog[open]')` becomes true — which is the check
 *   `useRemoveKey` and `UndoRedo` make before acting on a keystroke. Backspace
 *   deleting an element must not also delete the offer behind it, and Cmd+Z
 *   must pop one undo stack rather than both. Those guards are the reason this
 *   is safe to open over a live editor at all.
 *
 * **Not `components/ui/dialog.tsx`.** That component's own documentation says
 * "a dialog wide enough to need a third size is a screen", and this is a
 * screen: it carries no title, no description and no action row, because
 * `DesignerShell` brings a full header of its own. Giving `Dialog` a `full`
 * size would mean suppressing every part of it, which is a second component
 * wearing the first one's name.
 *
 * **The designer is loaded on open, not with the editor.** It pulls the
 * artboard, the tool rail, the properties pane and the element palette, and
 * most sessions in the book editor never open it.
 */

const DesignerShell = dynamic(
  () => import('@/components/card-designer/DesignerShell').then((m) => m.DesignerShell),
  {
    // No SSR: the designer hydrates a Zustand store from its props and the
    // server has nothing to render it against here — this window's block
    // arrives from a fetch, not from a server component.
    ssr: false,
    loading: () => <Loading />,
  }
)

/** What `GET /api/v1/blocks/:id` returns, narrowed to what the designer takes. */
type LoadedBlock = {
  id: string
  name: string
  description: string | null
  status: string
  repeats: boolean
  arrangements: Arrangement[]
  /** Null means seeded — SouqStudio's, and read-only to every shop. */
  organizationId: string | null
}

type Props = {
  /** The block to edit. Null closes the window. */
  blockId: string | null
  onClose: () => void
  /**
   * Whether this member may change a block at all — owner or manager, the same
   * bar `POST /api/v1/blocks` and the designer route both apply.
   *
   * **A viewer opens it read-only rather than being refused.** Seeing how a
   * card is built is useful, and the controls already say who may change it.
   */
  canDesign: boolean
  kit: BrandKit
  shopName: string
  assetBaseUrl: string
}

export function BlockEditorWindow({
  blockId,
  onClose,
  canDesign,
  kit,
  shopName,
  assetBaseUrl,
}: Props) {
  const router = useRouter()
  const ref = React.useRef<HTMLDialogElement>(null)
  const [block, setBlock] = React.useState<LoadedBlock | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const open = blockId !== null

  React.useEffect(() => {
    const element = ref.current
    if (element === null) return
    // showModal() throws if it is already open, hence both checks.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  /*
   * The block is fetched rather than passed, because the editor does not hold
   * block *documents* — `cellBlocks` carries arrangements for the picker's
   * previews, but not the description or the organization the design belongs
   * to, and the copy the owner is about to edit may have been made a second
   * ago by `POST /api/v1/blocks`. Reading it here means the window always opens
   * on what the server currently has.
   */
  React.useEffect(() => {
    if (blockId === null) {
      setBlock(null)
      setError(null)
      return
    }

    let live = true
    setBlock(null)
    setError(null)

    void (async () => {
      try {
        const response = await fetch(`/api/v1/blocks/${blockId}`)
        const body = (await response.json()) as {
          data: LoadedBlock | null
          error: { message: string } | null
        }
        if (!live) return
        if (body.data === null) {
          setError(body.error?.message ?? 'That design could not be opened.')
          return
        }
        setBlock(body.data)
      } catch {
        if (live) setError('That design could not be opened. Check your connection.')
      }
    })()

    // A window closed while its block was in flight must not have the reply
    // land in it — the next open would show the previous design for a frame.
    return () => {
      live = false
    }
  }, [blockId])

  /**
   * Closing, and the refresh is the whole point of routing it through here.
   *
   * The book underneath draws the block that was just edited, and it was
   * rendered on the server before the edit existed. Without this the owner
   * saves a card, the window closes, and the page behind still shows the design
   * they just changed.
   */
  function close() {
    router.refresh()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-label="Block designer"
      /*
       * **Escape deselects; it does not close.** The designer already binds
       * Escape to clearing the selection — `useDesignerKeys` — and the native
       * dialog would close on the same keystroke, so an owner pressing it to
       * drop a selection would instead lose the window and any edit still
       * inside the two-second autosave debounce. Closing is the button, which
       * flushes first.
       */
      onCancel={(event) => event.preventDefault()}
      className={cn(
        // Full viewport, no radius, no border: this is a screen rather than a
        // card, and the designer paints its own surround edge to edge.
        'h-screen max-h-none w-screen max-w-none border-0 bg-canvas-surround p-0',
        'm-0 text-primary open:block'
      )}
    >
      {error !== null ? (
        <Failed message={error} onClose={close} />
      ) : block === null ? (
        <Loading />
      ) : (
        <DesignerShell
          onClose={close}
          blockId={block.id}
          name={block.name}
          description={block.description}
          status={block.status}
          repeats={block.repeats}
          // Identical to the designer route's rule, and it has to stay
          // identical: a seeded block is read-only to every shop, and a viewer
          // may look at any of them. The editor forks a seeded card before
          // opening this, so in practice a read-only window here means a
          // member who may not design rather than a block nobody may.
          editable={canDesign && block.organizationId !== null}
          arrangements={block.arrangements}
          kit={kit}
          shopName={shopName}
          assetBaseUrl={assetBaseUrl}
        />
      )}
    </dialog>
  )
}

/**
 * The window before the designer is in it.
 *
 * Shaped like what is coming — a header bar and three panes — rather than a
 * centred spinner, because the designer is a large chunk and a blank dark
 * screen for half a second reads as a failure.
 *
 * No live region of its own: `Skeleton` already carries `role="status"` and an
 * "Loading" label, and a second one here would announce the same wait
 * twice.
 */
function Loading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas-surround">
      <div className="flex items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        {/*
          Widths come from the pane tokens the designer's own panes use, never
          from Tailwind's stock numeric scale. That scale is *replaced* here, so
          an off-system width is a valid string that compiles to no CSS —
          `check:classes` catches it and typecheck cannot. (It greps the source,
          so naming an offending class even in a comment trips it.)
        */}
        <div className="w-field-select">
          <Skeleton shape="text" />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Skeleton shape="chip" />
          <Skeleton shape="chip" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="hidden w-pane-start lg:block">
          <Skeleton shape="card" />
        </div>
        <div className="flex-1">
          <Skeleton shape="card" />
        </div>
        <div className="hidden w-pane-end lg:block">
          <Skeleton shape="card" />
        </div>
      </div>
    </div>
  )
}

/**
 * The block did not load.
 *
 * On the designer's own route this case is a `notFound()`. In a window there is
 * no page to replace, so it says what happened and gives back the one control
 * that matters — the way out. The book behind is untouched.
 */
function Failed({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas-surround p-6">
      {/* `text-inverse`, because the surround is the one dark surface in the
          product and `text-primary` on it is unreadable. */}
      <p className="text-center font-ui text-body text-inverse">{message}</p>
      <Button type="button" variant="primary" onClick={onClose}>
        Close
      </Button>
    </div>
  )
}
