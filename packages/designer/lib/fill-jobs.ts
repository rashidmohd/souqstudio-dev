'use client'

import { create } from 'zustand'
import type { FillLine } from '@souqstudio/engine'

/**
 * Generative fill jobs, held outside the dialog that starts them.
 *
 * **The wait used to live in the dialog, and closing it lost paid work.** The
 * poll was a closure inside `GenerativeFillDialog`, so an owner who closed the
 * dialog to keep designing, or closed the designer window altogether, left the
 * job running on the worker with nothing listening. The worker charges on
 * completion, so the credits went and the text never arrived. Held here, at
 * module level, the job outlives both the dialog and the window: the designer
 * reads it back when it opens on that block, and the dashboard's `FillWatch`
 * says so when it lands while no designer is open on it.
 *
 * **In-session only.** The `ai_jobs` row does not record which block a fill was
 * for, so a job started in a tab that has since closed cannot be routed back to
 * its block. That is the bell's job (`UnfinishedWork`), and it needs the block
 * id on the row before it can take it on.
 *
 * One fill per block at a time, keyed by block id.
 */

type Base = {
  blockId: string
  /** For the sentence that reports it, which may be read on another screen. */
  blockName: string
  /**
   * Which start this entry belongs to. A second start on the same block
   * replaces the entry, and the first run's poll must not land over it.
   */
  run: number
  /** Whether the owner has been told how it ended, by a toast or the designer. */
  told?: boolean
}

export type FillJob =
  | (Base & { state: 'working' })
  | (Base & { state: 'ready'; lines: FillLine[] })
  | (Base & { state: 'failed'; error: string })

type FillJobsState = {
  jobs: Record<string, FillJob>
  /**
   * A block whose finished fill the owner asked to review from outside the
   * designer, through a toast. The designer opens its fill dialog when it
   * mounts on that block, then clears this.
   */
  reviewing: string | null
  /**
   * The block a designer is open on right now, in a window or on its route.
   * A finished fill for it is reported by the designer's own notice bar; any
   * other waits, because a toast behind a full-screen designer is never seen.
   */
  showing: string | null
  /**
   * How to open a block in place, registered by the book editor, which can
   * open the designer as a window over the book. Null elsewhere, where
   * reviewing a fill means going to the designer's route.
   */
  opener: ((blockId: string) => void) | null
}

export const useFillJobs = create<FillJobsState>(() => ({
  jobs: {},
  reviewing: null,
  showing: null,
  opener: null,
}))

let runs = 0

/**
 * Start a fill and follow it to the end, whoever is still watching.
 *
 * Resolves when the job settles; nothing needs to await it. Every outcome is
 * written to the store, because the caller may be gone by then.
 */
export async function startFill(input: {
  fillUrl: string
  blockId: string
  blockName: string
  payload: unknown
}): Promise<void> {
  runs += 1
  const run = runs
  const base = { blockId: input.blockId, blockName: input.blockName, run }
  put({ ...base, state: 'working' })

  try {
    const started = await read<{ jobId: string }>(
      fetch(input.fillUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.payload),
      })
    )
    const lines = await poll(started.jobId)
    settle(run, { ...base, state: 'ready', lines })
  } catch (problem) {
    settle(run, {
      ...base,
      state: 'failed',
      error: problem instanceof Error ? problem.message : 'That did not finish. Try again.',
    })
  }
}

/** Forget a block's fill: applied, or its failure already reported. */
export function clearFill(blockId: string) {
  useFillJobs.setState((state) => {
    const { [blockId]: _gone, ...rest } = state.jobs
    return { jobs: rest }
  })
}

/** Record that the owner has heard how this run ended. */
export function markTold(blockId: string, run: number) {
  const job = useFillJobs.getState().jobs[blockId]
  if (job?.run !== run || job.told === true) return
  put({ ...job, told: true })
}

function put(job: FillJob) {
  useFillJobs.setState((state) => ({ jobs: { ...state.jobs, [job.blockId]: job } }))
}

/** Write an outcome only if its run is still the block's current one. */
function settle(run: number, job: FillJob) {
  if (useFillJobs.getState().jobs[job.blockId]?.run !== run) return
  put(job)
}

/**
 * Wait for the worker, polling the one AI job route every feature shares.
 * Two seconds, three minutes: the same shape as magic block.
 */
async function poll(jobId: string): Promise<FillLine[]> {
  const deadline = Date.now() + 3 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Try again in a minute.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: { lines?: FillLine[] } | null
    }>(fetch(`/api/v1/ai/jobs/${jobId}`))

    if (job.status === 'failed') {
      throw new Error(
        job.errorMessage === 'declined'
          ? 'The model would not write this. Try a different brief. You were not charged.'
          : 'That did not finish. You were not charged. Try again.'
      )
    }

    if (job.status !== 'complete') continue

    const lines = job.result?.lines ?? []
    if (lines.length === 0) throw new Error('That came back empty. Try again.')
    return lines
  }
}

/**
 * `{ data, error }`, every route. The `message` is written for a shop owner,
 * so it is shown rather than replaced.
 */
export async function read<T>(request: Promise<Response>): Promise<T> {
  const response = await request
  const body = (await response.json().catch(() => null)) as {
    data: T | null
    error: { code: string; message: string } | null
  } | null

  if (body?.error) throw new Error(body.error.message)
  if (body?.data === null || body?.data === undefined) {
    throw new Error('Something went wrong. Try again in a moment.')
  }
  return body.data
}
