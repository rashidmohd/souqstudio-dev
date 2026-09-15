'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, LayoutTemplate, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { moveOffer, removeOffer } from '@/lib/editor-actions'
import { useEditorStore } from '@/stores/editor-store'

/**
 * The artboard's context menu.
 *
 * **Every item here also exists as a button in the properties panel or the page
 * panel, and that is the rule rather than a coincidence.** The design skill
 * requires a persistent equivalent for anything the editor offers, because it
 * ships on tablet; a menu is where an owner who knows the product goes faster,
 * never where a feature lives. If an item is ever added here that is nowhere
 * else, this component has become the wrong thing.
 *
 * **It acts on the selection, and the click that opened it set the selection.**
 * The cell hit targets listen on `pointerdown`, which the right button fires,
 * and the card hit targets got an `onContextMenu` for the same job — so by the
 * time this renders, the properties panel is already describing the subject.
 * That matters more than it sounds: a menu that carried its own notion of what
 * was clicked would be a second answer to "which card", and the two would
 * disagree the first time a click was swallowed.
 *
 * **One root per page, not one per cell.** Twelve cells a page over nine pages
 * is a hundred state machines for a surface that can only ever have one menu
 * open.
 */
type Props = {
  bookId: string
  /**
   * What to name when no offer is selected — an empty cell, or one holding a
   * brand block. Null when the cell layer is not up at all.
   */
  cellLabel?: string | null
  /**
   * Opens the cell design picker. Absent unless the Page tool is up, which is
   * the only time a cell's design is a thing an owner can change.
   */
  onPickBlock?: (() => void) | undefined
  children: React.ReactNode
}

export function ArtboardMenu({ bookId, cellLabel = null, onPickBlock, children }: Props) {
  const router = useRouter()
  const order = useEditorStore((state) => state.order)
  const select = useEditorStore((state) => state.select)
  const offer = useEditorStore((state) =>
    state.selectedOfferId === null ? undefined : state.offers[state.selectedOfferId]
  )

  const index = offer === undefined ? -1 : order.indexOf(offer.id)
  const refresh = () => router.refresh()

  return (
    <ContextMenu>
      {/* `asChild` onto a plain wrapper rather than onto the artboard itself:
          `BookPage` renders an `<svg>` and forwards no ref, and Slot needs one.
          The svg is `width="100%"`, so a full-width div around it changes no
          layout. */}
      <ContextMenuTrigger asChild>
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>

      <ContextMenuContent aria-label="Card actions">
        {offer === undefined ? (
          <>
            <ContextMenuLabel>{cellLabel ?? 'Nothing selected'}</ContextMenuLabel>
            {onPickBlock === undefined ? (
              // Never an empty menu: a menu that opens with nothing in it reads
              // as broken, where one that says why reads as an answer.
              <ContextMenuItem disabled>Select a card first</ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={onPickBlock}>
                <LayoutTemplate className="size-4" aria-hidden="true" strokeWidth={1.75} />
                Change this cell&rsquo;s design
              </ContextMenuItem>
            )}
          </>
        ) : (
          <>
            <ContextMenuLabel>{offer.name}</ContextMenuLabel>

            <ContextMenuItem
              disabled={index <= 0}
              onSelect={() => void moveOffer({ bookId, offerId: offer.id, by: -1, refresh })}
            >
              <ChevronUp className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Move earlier
            </ContextMenuItem>
            <ContextMenuItem
              disabled={index === -1 || index === order.length - 1}
              onSelect={() => void moveOffer({ bookId, offerId: offer.id, by: 1, refresh })}
            >
              <ChevronDown className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Move later
            </ContextMenuItem>

            {onPickBlock === undefined ? null : (
              <ContextMenuItem onSelect={onPickBlock}>
                <LayoutTemplate className="size-4" aria-hidden="true" strokeWidth={1.75} />
                Change this cell&rsquo;s design
              </ContextMenuItem>
            )}

            <ContextMenuSeparator />

            <ContextMenuItem
              tone="danger"
              onSelect={() => {
                select(null)
                void removeOffer({ bookId, offerId: offer.id, name: offer.name, refresh })
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Remove from book
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
