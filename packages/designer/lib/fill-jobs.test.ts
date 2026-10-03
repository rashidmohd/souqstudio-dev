import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFill, startFill, useFillJobs } from './fill-jobs'

/**
 * A fill outlives the dialog that starts it. What matters is that every
 * outcome reaches the store, and that a superseded run cannot land over the
 * one that replaced it.
 */

const LINES = [{ id: 'a', textEn: 'Fresh today', textAr: 'طازج اليوم' }]

function reply(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ data, error: null })))
}

function refuse(message: string) {
  return Promise.resolve(
    new Response(JSON.stringify({ data: null, error: { code: 'x', message } }))
  )
}

const input = { fillUrl: '/fill', blockId: 'b1', blockName: 'Weekend card', payload: {} }

beforeEach(() => {
  vi.useFakeTimers()
  useFillJobs.setState({ jobs: {}, reviewing: null, showing: null, opener: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('startFill', () => {
  it('is working at once and ready when the job completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/fill'
          ? reply({ jobId: 'j1' })
          : reply({ status: 'complete', errorMessage: null, result: { lines: LINES } })
      )
    )

    const done = startFill(input)
    expect(useFillJobs.getState().jobs.b1?.state).toBe('working')

    await vi.advanceTimersByTimeAsync(2000)
    await done

    const job = useFillJobs.getState().jobs.b1
    expect(job?.state).toBe('ready')
    expect(job?.state === 'ready' ? job.lines : null).toEqual(LINES)
  })

  it('records a refusal to start as a failure the owner can read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => refuse('You do not have enough credits.')))

    await startFill(input)

    const job = useFillJobs.getState().jobs.b1
    expect(job?.state === 'failed' ? job.error : null).toBe('You do not have enough credits.')
  })

  it('does not let a superseded run overwrite the one that replaced it', async () => {
    let polls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/fill') return reply({ jobId: `j${polls}` })
        polls += 1
        // The first run's job fails; the second is still going.
        return reply(
          polls === 1
            ? { status: 'failed', errorMessage: null, result: null }
            : { status: 'processing', errorMessage: null, result: null }
        )
      })
    )

    const first = startFill(input)
    void startFill(input)
    await vi.advanceTimersByTimeAsync(2000)
    await first

    expect(useFillJobs.getState().jobs.b1?.state).toBe('working')
  })

  it('is forgotten once cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(() => refuse('No.')))
    await startFill(input)

    clearFill('b1')

    expect(useFillJobs.getState().jobs.b1).toBeUndefined()
  })
})
