'use client'

import * as React from 'react'
import * as Primitive from '@radix-ui/react-context-menu'
import { cn } from '@/lib/utils'

/**
 * Context menu. Governed by references/component-inventory.md, which owns this
 * signature.
 *
 * **An accelerator, never the only route to anything it offers.** The design
 * skill is explicit: *"Every hover-revealed affordance needs a persistent
 * equivalent, because the editor ships on tablet where hover does not exist."*
 * Radix does open this on long-press, so it is not pointer-only — but long-press
 * is undiscoverable and on iOS it competes with the selection callout, so every
 * item here must also exist as a button somewhere an owner can see. The
 * artboard's menu mirrors `OfferActions` for exactly that reason.
 *
 * **The first `@radix-ui/*` package in the tree, and that was a decision.**
 * `Dialog` is the native `<dialog>` and `Select` is a native `<select>`, both
 * having refused their Radix versions with the reasoning written at the call
 * site: the platform already does modal containment and the platform picker
 * better than a reimplementation will. There is no platform primitive for a
 * context menu — `contextmenu` is an event, not a widget — so the reasoning does
 * not transfer, and the alternative was hand-rolling roving focus, typeahead,
 * collision-aware positioning and RTL side-flipping.
 *
 * **What shadcn ships for this does not resolve here.** Its block carries
 * `shadow-md`, `rounded-sm`, `text-sm`, `z-50` and `animate-in zoom-in-95`;
 * this system replaces Tailwind's scales rather than extending them, so most of
 * those are valid strings that generate no CSS — and nothing but
 * `check:classes` can see it. Every class below is a token.
 */

export const ContextMenu = Primitive.Root
export const ContextMenuTrigger = Primitive.Trigger

/**
 * The surface.
 *
 * **A hairline and surface tone, no elevation** — there are no shadows in this
 * system and `boxShadow` in the Tailwind config is `{ none }`, so a menu
 * separates from the page the way a card does.
 *
 * `dir` is not set here. Radix takes it from the nearest `DirectionProvider` or
 * from the document, which is what the app already scopes — setting it per menu
 * would be a second answer to a question the layout has answered.
 */
export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.Content
      ref={ref}
      // 4px from the pointer: close enough to read as attached to what was
      // clicked, far enough that the first item is not already under the cursor.
      collisionPadding={8}
      className={cn(
        'z-50 min-w-control overflow-hidden rounded-card border-hairline border-border-subtle',
        'bg-surface p-1 font-ui text-body-sm text-primary',
        className
      )}
      {...props}
    />
  </Primitive.Portal>
))
ContextMenuContent.displayName = 'ContextMenuContent'

/**
 * One action.
 *
 * **Full control height, not a dense row.** 32px, 44px on coarse pointers, from
 * the token — the same floor every other target in the product clears, and the
 * one a context menu is most often built under. `tone` is `default` or
 * `danger`; there is no `variant` here because a menu item has one visual
 * treatment and the tone is about what the action *does*.
 */
export const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item> & { tone?: 'default' | 'danger' }
>(({ className, tone = 'default', ...props }, ref) => (
  <Primitive.Item
    ref={ref}
    className={cn(
      'flex min-h-control cursor-default select-none items-center gap-2 rounded-control px-3',
      'outline-none transition-colors duration-fast ease-sq',
      // Radix marks the item under the pointer or the keyboard cursor with
      // `data-highlighted`, which is one state rather than hover and focus
      // separately — so the menu reads the same whichever is driving it.
      tone === 'danger'
        ? 'text-action-danger data-[highlighted]:bg-critical-bg'
        : 'text-primary data-[highlighted]:bg-stone-100',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled',
      className
    )}
    {...props}
  />
))
ContextMenuItem.displayName = 'ContextMenuItem'

/** A rule between groups of actions. Hairline, like every other divider. */
export const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof Primitive.Separator>,
  React.ComponentPropsWithoutRef<typeof Primitive.Separator>
>(({ className, ...props }, ref) => (
  <Primitive.Separator
    ref={ref}
    className={cn('my-1 h-px bg-border-subtle', className)}
    {...props}
  />
))
ContextMenuSeparator.displayName = 'ContextMenuSeparator'

/**
 * What the menu is acting on, named at the top.
 *
 * **Not decoration.** A context menu opened over an artboard has no other way
 * to say which of twelve cards it is about, and "Remove from book" with no
 * subject is how the wrong card gets removed.
 */
export const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof Primitive.Label>,
  React.ComponentPropsWithoutRef<typeof Primitive.Label>
>(({ className, ...props }, ref) => (
  <Primitive.Label
    ref={ref}
    className={cn('truncate px-3 py-1 font-ui text-label font-medium text-muted', className)}
    {...props}
  />
))
ContextMenuLabel.displayName = 'ContextMenuLabel'
