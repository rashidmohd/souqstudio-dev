'use client'

import * as React from 'react'
import Image from 'next/image'
import { Upload, Loader2, Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrandStore } from '@/stores/brand-store'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Step 1 — upload a logo. E4-01.
 *
 * The upload goes browser → R2 directly against a presigned URL, so a 10MB file
 * is not squeezed through a serverless function with a 4.5MB body cap.
 *
 * Background removal runs behind the owner rather than in front of them. They
 * see the logo the moment it lands and can carry on; if the cutout arrives it
 * swaps in, and if the service is down they keep what they uploaded. Nobody
 * waits on a Python service to pick their brand colours.
 */
export function LogoStep({ onContinue }: { onContinue: () => void }) {
  const { logoUrl, kit, setLogo, setLogoStatus } = useBrandStore()
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const status = kit.logoStatus ?? 'none'

  // Poll only while a cutout is actually in flight. `logoStatus` is written by
  // the worker onto the same brand kit this reads, so one endpoint answers it.
  React.useEffect(() => {
    if (status !== 'processing') return

    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/brand')
        const result = await res.json()
        const next = result.data?.brandKit?.logoStatus
        if (!cancelled && next && next !== 'processing') {
          setLogoStatus(next)
          // The cutout replaces the file at the same key, so the URL is
          // unchanged and the browser would show its cached copy. The
          // cache-buster is what makes the swap visible.
          if (result.data?.logoUrl) {
            useBrandStore.setState({ logoUrl: `${result.data.logoUrl}?v=${Date.now()}` })
          }
        }
      } catch {
        // A failed poll is not worth surfacing — the next one may work, and the
        // owner is not blocked either way.
      }
    }, 2000)

    // Stop after a minute. Rembg is either down or the queue is not draining,
    // and a spinner that never resolves is worse than a logo that is simply
    // the one they uploaded.
    const giveUp = setTimeout(() => setLogoStatus('original'), 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(giveUp)
    }
  }, [status, setLogoStatus])

  async function upload(file: File) {
    setError(null)

    if (file.size > MAX_BYTES) {
      setError('That file is over 10MB. Try a smaller export.')
      return
    }

    setUploading(true)
    try {
      const authorise = await fetch('/api/v1/brand/logo/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
      })
      const authorised = await authorise.json()
      if (authorised.error) {
        setError(authorised.error.message)
        return
      }

      const put = await fetch(authorised.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) {
        setError('The upload did not complete. Check your connection and try again.')
        return
      }

      const complete = await fetch('/api/v1/brand/logo', { method: 'POST' })
      const result = await complete.json()
      if (result.error) {
        setError(result.error.message)
        return
      }

      setLogo({
        logoUrl: `${result.data.logoUrl}?v=${Date.now()}`,
        suggestedColors: result.data.suggestedColors,
        logoStatus: result.data.logoStatus,
      })
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Upload your logo</h2>
        <p className="font-ui text-body text-secondary">
          We will lift it off its background and pull your brand colours from it.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      {logoUrl ? (
        <div className="flex flex-col gap-3">
          {/* On white and on dark, per E4-01 — a logo with a white fringe or a
              dark-on-dark mark only shows up when you see both. */}
          <div className="grid grid-cols-2 gap-3">
            <LogoPlate label="On white" background="bg-stone-0" src={logoUrl} />
            <LogoPlate label="On dark" background="bg-stone-900" src={logoUrl} />
          </div>

          <p className="flex items-center gap-2 font-ui text-body-sm text-secondary">
            {status === 'processing' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Removing the background — you can carry on.
              </>
            ) : status === 'ready' ? (
              <>
                <Check className="size-4 text-positive-fg" aria-hidden="true" />
                Background removed.
              </>
            ) : (
              <>
                <TriangleAlert className="size-4 text-caution-fg" aria-hidden="true" />
                We could not remove the background just now, so your logo is
                exactly as you uploaded it. You can redo this later from your
                brand kit.
              </>
            )}
          </p>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          // Reset so choosing the same file twice still fires a change.
          event.target.value = ''
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={logoUrl ? 'secondary' : 'primary'}
          size="lg"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden="true" />
          {logoUrl ? 'Choose a different logo' : 'Choose a logo'}
        </Button>

        <Button type="button" variant={logoUrl ? 'primary' : 'ghost'} size="lg" onClick={onContinue}>
          {logoUrl ? 'Continue' : 'Skip for now'}
        </Button>
      </div>

      {!logoUrl ? (
        <p className="font-ui text-body-sm text-muted">
          PNG, JPG, WebP or SVG, up to 10MB. You can add one later if you do not
          have it to hand.
        </p>
      ) : null}
    </div>
  )
}

function LogoPlate({
  label,
  background,
  src,
}: {
  label: string
  background: string
  src: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex h-24 items-center justify-center rounded-control border-hairline border-border-subtle ${background}`}
      >
        <Image
          src={src}
          alt="Your logo"
          width={160}
          height={80}
          // Already normalized and stored by us; the optimizer would re-fetch a
          // remote URL for no gain.
          unoptimized
          className="max-h-16 w-auto object-contain"
        />
      </div>
      <span className="font-ui text-body-sm text-muted">{label}</span>
    </div>
  )
}
