'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

/**
 * E4-05 — reset this shop to its organization's brand.
 *
 * **The one genuinely irreversible action on this screen, so the one that gets
 * a dialog.** The design system prefers undo over confirm, and undo lives in a
 * toast that has no mounting mechanism in this codebase yet (E2-pending §3);
 * but this would not be undoable even with one, because the shop's own logo and
 * colours are gone once written over.
 *
 * Distinct from switching back to `inherit` on shop settings, which leaves the
 * shop's kit dormant and reversible. The description has to carry that
 * difference — an owner who thinks this is the reversible one will not read the
 * endpoint to find out.
 */
export function ResetBrandDialog({ shopName }: { shopName: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reset() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/brand/reset', { method: 'POST' })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setOpen(false)
      // The server props carry the kit, the override and every facet source, so
      // a refresh is what re-seeds the store with the organization's brand.
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        Reset to organization defaults
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Reset ${shopName}’s brand kit`}
        description="This shop goes back to using your organization’s logo, colours and layout. Its own logo and colours are deleted and cannot be brought back. Offer books you have already published are not affected."
        primaryAction={{
          label: 'Reset brand kit',
          onClick: () => void reset(),
          destructive: true,
          loading: submitting,
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setOpen(false) }}
      >
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  )
}
