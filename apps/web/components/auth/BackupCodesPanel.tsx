'use client'

import * as React from 'react'
import { Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The one moment backup codes are visible. E1-03.
 *
 * The plaintext exists in exactly one place — the response that created them —
 * and this component holds it in React state until the screen goes away. The
 * download is assembled here from that state: a Blob and an object URL, no
 * second request, no file on a server, nothing in a URL that could land in
 * history or a proxy log. There is no endpoint that can return these again, by
 * design.
 *
 * The confirm checkbox is not ceremony. Someone who closes this screen without
 * saving the codes has a second factor with no recovery path, and the next time
 * they change phone that becomes their owner's problem.
 */
type Props = {
  codes: string[]
  accountEmail: string
  onDone: () => void
  doneLabel?: string
}

export function BackupCodesPanel({ codes, accountEmail, onDone, doneLabel = 'Done' }: Props) {
  const [saved, setSaved] = React.useState(false)
  const [downloaded, setDownloaded] = React.useState(false)

  function download() {
    const body = [
      'SouqStudio backup codes',
      `Account: ${accountEmail}`,
      '',
      'Each code works once. Keep them somewhere you can reach without your phone.',
      '',
      ...codes,
      '',
    ].join('\n')

    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'souqstudio-backup-codes.txt'
    anchor.click()
    // Released immediately — the browser has already taken what it needs, and
    // leaving it alive keeps the codes reachable from the page.
    URL.revokeObjectURL(url)
    setDownloaded(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Save your backup codes</h2>
        <p className="font-ui text-body text-secondary">
          Each code works once. They are the only way in if you lose your phone,
          and this is the only time they are shown.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-card bg-sunken p-4">
        {codes.map((code) => (
          <li key={code} className="font-figure text-data text-primary" data-figure>
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={download}>
          {downloaded ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {downloaded ? 'Downloaded' : 'Download codes'}
        </Button>
      </div>

      <label className="flex items-start gap-2 font-ui text-body-sm text-secondary">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-1 size-4 rounded-chip border border-border-strong"
        />
        <span>I have saved these codes somewhere I can reach without my phone.</span>
      </label>

      {/* Disabled with the reason directly above it, not in a tooltip. */}
      <Button type="button" variant="primary" size="lg" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  )
}
