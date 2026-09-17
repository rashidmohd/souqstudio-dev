'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { NAV_ROW_LABEL, NAV_ROW_LEADING, navRowClass } from '@/components/shared/nav-item'
import { cn } from '@/lib/utils'

/**
 * What finished while you were somewhere else. E8.
 *
 * **It exists because paid work could go missing.** Character and logo
 * generation return several options and charge for the set; the artefact only
 * exists once somebody picks one. Every flow held its `jobId` in React state, so
 * closing the tab mid-generation spent the credits, left the images in R2 and
 * left nothing in the product able to find them. This is the route back.
 *
 * **Not a notification hub, and it should not grow into one by accident.** E12
 * is the notifications epic and is unstarted. This is one query over `ai_jobs`
 * answering "what did I start that still needs me" — no read state, no delivery,
 * nothing to say that is not a generation. When E12 lands, this becomes one of
 * its sources rather than its shape.
 *
 * **A rail row, not a bell floating beside one.** It reads as one of the rail's
 * destinations — same height, same 28px glyph column, same label — and is built
 * from `nav-item`'s exported shape so it cannot drift from the rows above it.
 * What it is *not* is a `<Link>`: there is no screen to send anyone to, so it is
 * a disclosure button that opens the panel, and the rail's rule against linking
 * to a route that does not exist is kept.
 *
 * Its label is `Ready to collect`, which is what the row is and what the panel
 * already called itself. Not `Notifications` — that word belongs to E12, and
 * putting it in the rail now would promise a hub that does not exist.
 *
 * **The row is absent when nothing is waiting**, which is why it can sit inside
 * the shop zone: for the overwhelming majority of sessions the rail is exactly
 * as it was.
 *
 * **Polled, and slowly.** Thirty seconds: a generation takes tens of seconds and
 * the owner watching one is already being polled at 2.5s by the flow itself.
 * This is for the person who left, so it only has to be right by the time they
 * look at the rail.
 */

const POLL_MS = 30_000

/** The panel's minimum clearance from the top and bottom of the viewport, in px. */
const GUTTER = 8

type Job = {
  id: string
  type: string
  creditsCost: number
  completedAt: string | null
}

/** Where an owner goes to collect each kind, and what to call it. */
const CLAIM: Readonly<Record<string, { label: string; href: (id: string) => string }>> = {
  character_gen: {
    label: 'Characters are ready to choose from',
    href: (id) => `/brand/character?job=${id}`,
  },
  logo_gen: { label: 'Logo marks are ready to choose from', href: () => '/brand' },
  pose_gen: { label: 'Poses are ready to choose from', href: () => '/brand' },
  prompt_gen: { label: 'Poses are ready to choose from', href: () => '/brand' },
  cover_gen: { label: 'Covers are ready to choose from', href: () => '/brand' },
}

/** What the row is called. The panel's own heading, so the two agree. */
const LABEL = 'Ready to collect'

export function UnfinishedWork({ collapsed }: { collapsed: boolean }) {
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()

  const rowRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  /**
   * Where the panel sits, in viewport coordinates, because the panel is
   * `fixed` — see the note on it. It used to be `top-0`, which was right only
   * while the bell was the first thing in the rail; the row is now down in the
   * shop zone, so the panel has to follow it or it opens detached from the
   * thing that opened it.
   */
  const [top, setTop] = React.useState(0)

  React.useEffect(() => {
    let live = true

    async function read() {
      try {
        const response = await fetch('/api/v1/ai/jobs?unclaimed=1')
        const body = (await response.json()) as { data: { jobs: Job[] } | null }
        if (live && body.data) setJobs(body.data.jobs)
      } catch {
        // A rail that cannot reach the API is not a rail that should say so.
        // The row simply does not appear.
      }
    }

    void read()
    // Navigating is how collecting something happens, so the panel closes with
    // the same move that re-reads the list.
    setOpen(false)
    const timer = setInterval(() => void read(), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
    // Re-reads on navigation, which is how collecting something makes it
    // disappear without waiting for the next poll.
  }, [pathname])

  /**
   * **Escape and a click outside.** A disclosure that can only be closed by
   * hitting the same row again is a trap on a tablet, where the panel covers
   * most of the screen and the row is behind it.
   *
   * `pointerdown` rather than `click`: a press that starts outside and drifts
   * onto the panel should still dismiss, and `click` fires on neither.
   */
  React.useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Focus goes back to what opened it, or it lands on <body> and the next
      // Tab starts from the top of the document.
      rowRef.current?.focus()
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rowRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  /**
   * Aligned with the row, then lifted if a long list would run off the bottom.
   * `Math.max` keeps it on screen when the list is taller than the viewport,
   * where the panel's own `overflow-y-auto` takes over.
   */
  const place = React.useCallback(() => {
    const row = rowRef.current
    if (row === null) return

    const rowTop = row.getBoundingClientRect().top
    const height = panelRef.current?.offsetHeight ?? 0
    const highest = Math.max(GUTTER, window.innerHeight - height - GUTTER)
    setTop(Math.min(rowTop, highest))
  }, [])

  /**
   * **Recomputed on the rail's scroll, not just the window's.** The rail is its
   * own scroll container (`sticky h-dvh overflow-y-auto`), so on a short
   * viewport the row moves while the window never scrolls at all — hence the
   * capture-phase listener, which is the only one that hears it.
   *
   * This runs *after* paint, and deliberately: a `useLayoutEffect` would run
   * before it, but this component is rendered on the server too and React warns
   * about that hook whenever it is. The first paint is already in the right
   * place because the click handler measures the row before the panel mounts —
   * all this pass adds is the clamp, which needs a height the panel does not
   * have until it exists.
   */
  React.useEffect(() => {
    if (!open) return

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, jobs.length, place])

  if (jobs.length === 0) return null

  return (
    <>
      {/*
       * A row, not a link — `navRowClass` says why. `w-full` because a button
       * does not fill its column the way an anchor does, and without it the
       * hover tint stops short of where every row above it ends.
       */}
      <button
        ref={rowRef}
        type="button"
        onClick={(event) => {
          // Measured here rather than in an effect, so the panel's first paint
          // is already beside the row instead of at the top of the viewport.
          // The effect above refines it once the panel has a height.
          setTop(event.currentTarget.getBoundingClientRect().top)
          setOpen((was) => !was)
        }}
        aria-expanded={open}
        aria-label={`${LABEL}, ${jobs.length} waiting`}
        title={LABEL}
        className={cn(navRowClass({ active: open, collapsed }), 'w-full')}
      >
        <span className={cn(NAV_ROW_LEADING, 'relative')}>
          <Bell className="size-icon-lg" strokeWidth={1.75} aria-hidden="true" />
          {/*
           * The count, not a dot. Every one of these is something the shop has
           * already paid for, so how many there are is the useful fact. It
           * rides the glyph rather than trailing the label, because the label
           * is not rendered at all below 1024px and a count that vanishes with
           * it would take the only reason to look with it.
           */}
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-pill bg-action-primary px-1 font-ui text-eyebrow text-action-primary-fg"
            data-figure
          >
            {jobs.length}
          </span>
        </span>
        {collapsed ? null : <span className={NAV_ROW_LABEL}>{LABEL}</span>}
      </button>

      {open ? (
        /**
         * **`fixed`, not `absolute`, and `w-pane` was not a width at all.**
         *
         * Two bugs in one element, both visible the first time somebody had
         * something to collect. The rail is `sticky h-dvh overflow-y-auto` —
         * a scroll container — so an absolutely positioned panel is clipped to
         * the rail's own width and the list came out one word per line. And
         * `w-pane` compiles to nothing: the width scale here is replaced rather
         * than extended, the tokens are `w-rail`, `w-pane-start`, `w-pane-end`,
         * and there is no `w-pane`. `check:classes` did not catch it, which is
         * worth knowing about that check.
         *
         * Escaping the rail means leaving its coordinate system, so this is
         * positioned against the viewport and sized by `max-w`. The vertical
         * offset is measured rather than written, because the row it belongs to
         * moves — see `place()`.
         */
        <div
          ref={panelRef}
          style={{ top }}
          className={cn(
            'fixed z-20 m-2 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto',
            'rounded-card border border-border-strong bg-surface p-3',
            // Beside the rail, not inside it. The offset follows whichever width
            // the rail is actually at.
            collapsed ? 'start-rail-collapsed' : 'start-rail-collapsed lg:start-rail'
          )}
        >
          <p className="font-ui text-label font-medium text-primary">{LABEL}</p>
          <p className="font-ui text-body-sm text-muted">
            You have paid for these. They are waiting for you to choose.
          </p>

          <ul className="mt-2 flex flex-col gap-1">
            {jobs.map((job) => {
              const claim = CLAIM[job.type]
              if (claim === undefined) return null

              return (
                <li key={job.id}>
                  <Link
                    href={claim.href(job.id)}
                    onClick={() => setOpen(false)}
                    className="flex flex-col rounded-control px-2 py-2 hover:bg-stone-100"
                  >
                    <span className="font-ui text-label text-primary">{claim.label}</span>
                    <span className="font-ui text-body-sm text-muted">
                      <span data-figure>{job.creditsCost}</span> credits · {when(job.completedAt)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )
}

/** Rough, and rough is right — "2 hours ago" is what somebody needs here. */
function when(iso: string | null): string {
  if (iso === null) return 'just now'

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
