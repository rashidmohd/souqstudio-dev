'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/states'

/**
 * A product's photos: see them, replace one, re-run the cutout, review a matte.
 * E13-02.
 *
 * **The cutout is the thing being managed, not the photo.** E5 §3 makes
 * background removal an ingest stage because the grammar that separates a real
 * offer book from a slide deck is a cutout floating on a tinted panel. So the
 * original is shown as provenance and the cutout is what carries the state.
 */

export type ProductImage = {
  id: string
  kind: 'ORIGINAL' | 'CUTOUT' | 'THUMB'
  reviewState: 'PENDING' | 'APPROVED' | 'REJECTED'
  url: string
  width: number
  height: number
  quality: number | null
  derivedFrom: string | null
  createdAt: string
}

const ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_BYTES = 10 * 1024 * 1024

export function ProductImages({
  productId,
  images,
  canUpload,
  uploadOffReason,
  mayEdit,
}: {
  productId: string
  images: ProductImage[]
  canUpload: boolean
  uploadOffReason: string | null
  mayEdit: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  /**
   * The intrinsic size, read in the browser before the upload.
   *
   * `image_assets.width` and `height` are not nullable, and they are not
   * decoration: the layout engine scales cards to optical weight, so a picture
   * whose dimensions are wrong renders at the wrong size relative to its
   * neighbours. The server cannot read them without the bytes, and the bytes
   * never reach it.
   */
  function measure(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new window.Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('That file is not an image this browser can read.'))
      }
      img.src = url
    })
  }

  async function upload(file: File) {
    setBusy('upload')
    setError(null)
    setNote(null)

    try {
      if (file.size > MAX_BYTES) {
        setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`)
        return
      }

      const size = await measure(file)

      // 1. Ask for a signed PUT.
      const signed = await fetch(
        `/api/v1/admin/catalog/products/${productId}/images/upload-url`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
        }
      )
      const signedResult = (await signed.json()) as ApiResult<{ url: string; key: string }>
      if (signedResult.error !== null) {
        setError(signedResult.error.message)
        return
      }

      // 2. Put the bytes straight at R2. They never pass through the panel.
      const put = await fetch(signedResult.data.url, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      })
      if (!put.ok) {
        setError(
          `R2 refused the upload (${put.status}). The signed URL may have expired, or the bucket's CORS policy does not allow this origin.`
        )
        return
      }

      // 3. Record it, and queue the cutout.
      const registered = await fetch(`/api/v1/admin/catalog/products/${productId}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: signedResult.data.key, ...size, removeBackground: true }),
      })
      const result = (await registered.json()) as ApiResult<{
        queued: boolean
        queueError: string | null
      }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }

      setNote(
        result.data.queued
          ? 'Uploaded. Background removal is queued; reload in a moment to see the cutout.'
          : `Uploaded, but background removal was not queued: ${result.data.queueError ?? 'unknown reason'}. Use "Remove background" once the worker is reachable.`
      )
      router.refresh()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The upload did not finish.')
    } finally {
      setBusy(null)
      if (fileInput.current !== null) fileInput.current.value = ''
    }
  }

  async function recut(imageId: string) {
    setBusy(imageId)
    setError(null)
    setNote(null)
    try {
      const response = await fetch(`/api/v1/admin/catalog/images/${imageId}/recut`, {
        method: 'POST',
      })
      const result = (await response.json()) as ApiResult<{ next: string }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      setNote(result.data.next)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function review(imageId: string, action: 'approve' | 'reject') {
    setBusy(imageId)
    setError(null)
    setNote(null)
    try {
      const response = await fetch(`/api/v1/admin/catalog/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = (await response.json()) as ApiResult<unknown>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-subhead text-primary">Images</h2>
          <p className="text-body-sm text-secondary">
            Cards draw the cutout and fall back to the original with a quality flag.
          </p>
        </div>

        {mayEdit && canUpload ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file !== undefined) void upload(file)
              }}
            />
            <Button
              type="button"
              variant="primary"
              loading={busy === 'upload'}
              onClick={() => fileInput.current?.click()}
            >
              {images.length === 0 ? 'Add an image' : 'Add another'}
            </Button>
          </>
        ) : null}
      </div>

      {error === null ? null : <ErrorState title="That did not work" body={error} />}

      {note === null ? null : (
        <p className="rounded-block bg-sand p-3 text-body text-charcoal">{note}</p>
      )}

      {mayEdit && !canUpload && uploadOffReason !== null ? (
        <p className="rounded-block bg-sand p-3 text-body-sm text-secondary">{uploadOffReason}</p>
      ) : null}

      {images.length === 0 ? (
        <p className="text-body-sm text-muted">
          No image. Cards fall back to a placeholder, which is what a shop sees.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li
              key={image.id}
              className="flex flex-col gap-2 rounded-card border border-border-subtle p-3"
            >
              {/*
                A checkerboard behind the picture, because a cutout on white is
                indistinguishable from an uncut photo on white — which is the
                one thing this screen exists to let somebody judge.
              */}
              <div
                className="flex items-center justify-center rounded-chip bg-stone-100 p-2"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%), linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 8px 8px',
                }}
              >
                <Image
                  src={image.url}
                  alt={`${image.kind} at ${image.width} by ${image.height}`}
                  width={image.width}
                  height={image.height}
                  className="h-auto max-h-preview-cap w-auto max-w-full object-contain"
                  unoptimized
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <StatusPill tone={image.kind === 'CUTOUT' ? 'positive' : 'neutral'}>
                  {image.kind}
                </StatusPill>
                {image.reviewState === 'PENDING' ? (
                  <StatusPill tone="caution">Needs review</StatusPill>
                ) : image.reviewState === 'REJECTED' ? (
                  <StatusPill tone="critical">Rejected</StatusPill>
                ) : null}
              </div>

              <dl className="flex flex-col gap-px text-body-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Size</dt>
                  <dd>
                    <Figure size="data-sm">
                      {image.width}×{image.height}
                    </Figure>
                  </dd>
                </div>
                {image.quality === null ? null : (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Matte quality</dt>
                    <dd>
                      <Figure size="data-sm">{image.quality.toFixed(2)}</Figure>
                    </dd>
                  </div>
                )}
              </dl>

              {mayEdit ? (
                <div className="flex flex-wrap gap-2">
                  {image.kind === 'ORIGINAL' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={busy === image.id}
                      onClick={() => void recut(image.id)}
                    >
                      Remove background
                    </Button>
                  ) : null}

                  {image.reviewState === 'PENDING' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={busy === image.id}
                        onClick={() => void review(image.id, 'approve')}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        loading={busy === image.id}
                        onClick={() => void review(image.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}

                  {image.reviewState === 'REJECTED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={busy === image.id}
                      onClick={() => void review(image.id, 'approve')}
                    >
                      Approve after all
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
