'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  MAX_BIO,
  MAX_STORE_PHOTOS,
  MAX_TRADES,
  MIN_BIO,
  SHOP_TRADES,
  TRADE_COPY,
  isShopProfileComplete,
  type ShopTrade,
} from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { CheckCards } from '@/components/ui/check-cards'
import { Textarea } from '@/components/ui/textarea'

/**
 * What this shop sells, in its own words. E8-01.
 *
 * **It exists because a generated character needs it.** A character for a
 * butcher is not a character for an electronics shop — different uniform,
 * different props, different register — and until this screen existed the only
 * thing the product knew about a shop was its name and a logo. The character
 * flow is gated on it, and says so rather than producing four generic people and
 * charging for them.
 *
 * **The trade is a list and the description is free text, and that split is
 * deliberate.** The trade is interpolated into a model prompt as an instruction,
 * so it is a closed enum — an unbounded string there is an injection surface and
 * a vocabulary nothing can be tested against. The description is quoted as data.
 *
 * Photographs of the shop are optional. They are a *scene* reference, for an
 * owner who wants their character standing in their own shop, and requiring them
 * would gate the feature on a shop being photogenic.
 */

const ACCEPT = 'image/png,image/jpeg,image/webp'

type Props = {
  shopId: string
  trades: string[]
  bio: string | null
  storePhotoKeys: string[]
  /** Public URLs for the stored keys, resolved on the server. */
  storePhotoUrls: string[]
  canEdit: boolean
}

export function ShopProfileField({
  shopId,
  trades,
  bio,
  storePhotoKeys,
  storePhotoUrls,
  canEdit,
}: Props) {
  const router = useRouter()
  const [tradeValue, setTradeValue] = React.useState<ShopTrade[]>(trades as ShopTrade[])
  const [bioValue, setBioValue] = React.useState(bio ?? '')
  const [keys, setKeys] = React.useState(storePhotoKeys)
  const [urls, setUrls] = React.useState(storePhotoUrls)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const complete = isShopProfileComplete({
    trades: tradeValue,
    bio: bioValue,
    storePhotoKeys: keys,
  })

  const dirty =
    tradeValue.join(',') !== trades.join(',') || bioValue !== (bio ?? '')

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await patch(shopId, {
        trades: tradeValue,
        bio: bioValue.trim() === '' ? null : bioValue.trim(),
      })
      setSaved(true)
      router.refresh()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function addPhoto(file: File) {
    setUploading(true)
    setError(null)

    try {
      const key = await upload(file)
      const next = [...keys, key].slice(0, MAX_STORE_PHOTOS)
      await patch(shopId, { storePhotoKeys: next })
      setKeys(next)
      setUrls((current) => [...current, URL.createObjectURL(file)].slice(0, MAX_STORE_PHOTOS))
      router.refresh()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That upload did not finish.')
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto(index: number) {
    const next = keys.filter((_, i) => i !== index)
    setError(null)

    try {
      await patch(shopId, { storePhotoKeys: next })
      setKeys(next)
      setUrls((current) => current.filter((_, i) => i !== index))
      router.refresh()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not save. Try again.')
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">What this shop sells</h2>
        <p className="font-ui text-body-sm text-secondary">
          Used to make your characters and covers look like they belong to your shop. A
          butcher and an electronics shop do not want the same picture.
        </p>
      </div>

      {/*
       * `CheckCards` rather than a `Select`, because this is not a field an
       * owner fills in on the way past — it is a choice, made once, that changes
       * what the product draws for them. A dropdown hides the ten options until
       * it is opened and gives none of them a sentence; a `Segmented` bar cannot
       * hold ten. **Several, because shops are several**: a grocery with a
       * bakery counter is the common case here, and forcing it to pick one
       * produced a character holding the wrong thing.
       */}
      <CheckCards
        label="Business segment"
        required
        max={MAX_TRADES}
        hint="What the shop mainly sells. A grocery with a bakery counter is both. It decides what a generated character and cover look like."
        disabled={!canEdit || saving}
        value={tradeValue}
        options={SHOP_TRADES.map((value) => ({
          value,
          label: TRADE_COPY[value].label,
        }))}
        onChange={setTradeValue}
      />

      <Textarea
        label="About the shop"
        required
        hint={`A few sentences in your own words: what you sell, who shops with you, anything that makes the shop itself. At least ${MIN_BIO} characters.`}
        maxLength={MAX_BIO}
        disabled={!canEdit || saving}
        value={bioValue}
        onChange={(event) => setBioValue(event.target.value)}
      />

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="button" variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
          {saved && !dirty ? (
            <span className="font-ui text-body-sm text-secondary" role="status">
              Saved.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <span className="font-ui text-label font-medium text-primary">
          Photos of the shop
        </span>
        <p className="font-ui text-body-sm text-muted">
          Optional. Add them if you want your character shown standing inside your own shop.
          Up to <span data-figure>{MAX_STORE_PHOTOS}</span>.
        </p>

        {urls.length > 0 ? (
          <ul className="grid grid-cols-4 gap-2">
            {urls.map((url, index) => (
              <li key={keys[index] ?? url} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`The shop, ${index + 1}`}
                  className="aspect-square w-full rounded-chip border border-border-subtle object-cover"
                />
                {canEdit ? (
                  <Button type="button" variant="ghost" onClick={() => void removePhoto(index)}>
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {canEdit && keys.length < MAX_STORE_PHOTOS ? (
          <FileDropzone
            label="A photo of the shop"
            accept={ACCEPT}
            onFile={addPhoto}
            hint="PNG, JPG or WebP. The inside of the shop, or the front."
            busy={uploading}
          />
        ) : null}
      </div>

      {error === null ? null : (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      )}

      {complete ? null : (
        <p className="font-ui text-body-sm text-caution-fg">
          Fill both of these in before making a character, we cannot make one that looks
          like your shop without them.
        </p>
      )}
    </section>
  )
}

// ─── The calls ────────────────────────────────────────────────────────────────

async function patch(shopId: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/v1/shops/${shopId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const parsed = (await response.json().catch(() => null)) as {
    error: { message: string } | null
  } | null

  if (parsed?.error) throw new Error(parsed.error.message)
  if (!response.ok) throw new Error('That did not save. Try again.')
}

/** Presigned PUT straight into the bucket — the bytes never pass through a route. */
async function upload(file: File): Promise<string> {
  const response = await fetch('/api/v1/blocks/artwork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
  })

  const parsed = (await response.json().catch(() => null)) as {
    data: { uploadUrl: string; assetId: string } | null
    error: { message: string } | null
  } | null

  if (parsed?.error) throw new Error(parsed.error.message)
  if (!parsed?.data) throw new Error('That upload could not start. Try again.')

  const put = await fetch(parsed.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  })
  if (!put.ok) throw new Error('That upload did not finish. Check your connection.')

  return parsed.data.assetId
}
