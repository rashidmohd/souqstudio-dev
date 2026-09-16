'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

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
 * **Polled, and slowly.** Thirty seconds: a generation takes tens of seconds and
 * the owner watching one is already being polled at 2.5s by the flow itself.
 * This is for the person who left, so it only has to be right by the time they
 * look at the rail.
 */

const POLL_MS = 30_000

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

export function UnfinishedWork() {
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => {
    let live = true

    async function read() {
      try {
        const response = await fetch('/api/v1/ai/jobs?unclaimed=1')
        const body = (await response.json()) as { data: { jobs: Job[] } | null }
        if (live && body.data) setJobs(body.data.jobs)
      } catch {
        // A rail that cannot reach the API is not a rail that should say so.
        // The bell simply does not appear.
      }
    }

    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
    // Re-reads on navigation, which is how collecting something makes it
    // disappear without waiting for the next poll.
  }, [pathname])

  if (jobs.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={`${jobs.length} generations ready to collect`}
        className="relative inline-flex size-control items-center justify-center rounded-pill text-secondary hover:bg-stone-100 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <Bell className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {/*
         * The count, not a dot. Every one of these is something the shop has
         * already paid for, so how many there are is the useful fact.
         */}
        <span
          aria-hidden="true"
          className="absolute -end-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-pill bg-action-primary px-1 font-ui text-eyebrow text-action-primary-fg"
          data-figure
        >
          {jobs.length}
        </span>
      </button>

      {open ? (
        <div className="absolute end-0 z-10 mt-1 w-pane rounded-card border border-border-strong bg-surface p-3">
          <p className="font-ui text-label font-medium text-primary">Ready to collect</p>
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
    </div>
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
