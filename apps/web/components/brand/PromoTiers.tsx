'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import { Button } from '@souqstudio/designer/components/ui/button'
import { Input } from '@souqstudio/designer/components/ui/input'
import { Select } from '@souqstudio/designer/components/ui/select'
import { callApi } from '@/lib/api-client'
import {
  EMPHASIS_LABEL,
  TIER_TOKENS,
  TIER_TOKEN_LABEL,
  type TierToken,
} from '@souqstudio/types'

/**
 * The promo tiers this organization prints. E5 §5 and E6-03.
 *
 * **The tier is the one authoring control on the price mark, and it had two
 * values.** *Deal* and *Offer* are seeded at signup and nothing in the product
 * could add a third — so every card in the screenshot that started this work
 * said "Deal", and a shop wanting *Half price* reached for a free-text chip,
 * which puts it in the wrong place on the card at the wrong size.
 *
 * **Here rather than under settings**, because a tier is the shop's offer-book
 * vocabulary in the same way its colours and its type are: it is what their
 * cards *say*, decided once and then used. `/settings` is the business — the
 * invoice, the people, the shops.
 *
 * **The colour is a system token, not the shop's.** A promo badge is the one
 * place `--sq-tpl-*` beats the brand palette: a "Half price" flash that comes
 * out sand on one account and navy on another stops reading as a discount.
 * `lib/promo-tier-tokens.ts` carries the list and the reasoning.
 */

export type Tier = {
  id: string
  labelEn: string
  labelAr: string | null
  tokenRef: string
  emphasis: number
  isDefault: boolean
}

type Props = {
  tiers: Tier[]
  /** False for a viewer or an editor. The list still renders — seeing what the
   *  shop prints is useful — and every control is gone rather than disabled. */
  canEdit: boolean
}

export function PromoTiers({ tiers, canEdit }: Props) {
  const router = useRouter()
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function call(input: string, init: RequestInit, fallback: string) {
    setBusy(true)
    setError(null)
    const result = await callApi(input, { ...init, fallback })
    setBusy(false)
    if (result.error !== null) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col">
        {tiers.map((tier) => (
          <li
            key={tier.id}
            className="flex min-h-row flex-wrap items-center gap-2 border-b-hairline border-border-subtle py-2 last:border-b-0"
          >
            {/*
              The badge as the card draws it, because the whole decision is what
              it looks like. `--sq-tpl-*` in a chrome component is normally a
              lint error and is correct here: this is a preview of offer book
              content, which is the exception the rule names.
            */}
            <span
              className="rounded-pill px-2 py-px font-ui text-eyebrow uppercase text-stone-0"
              style={{ backgroundColor: `var(${tier.tokenRef})` }}
            >
              {tier.labelEn}
            </span>

            <span className="min-w-0 truncate font-ui text-body-sm text-secondary" dir="rtl">
              {tier.labelAr ?? '—'}
            </span>

            <span className="font-ui text-body-sm text-muted">
              {EMPHASIS_LABEL[tier.emphasis] ?? ''}
            </span>

            <span className="ms-auto flex items-center gap-1">
              {tier.isDefault ? (
                <span className="flex items-center gap-1 font-ui text-body-sm text-secondary">
                  <Check className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  New offers start here
                </span>
              ) : canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void call(
                        `/api/v1/promo-tiers/${tier.id}`,
                        {
                          method: 'PATCH',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ isDefault: true }),
                        },
                        'That tier could not be made the default.'
                      )
                    }
                  >
                    Make default
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    iconOnly
                    aria-label={`Remove the ${tier.labelEn} tier`}
                    disabled={busy}
                    onClick={() =>
                      void call(
                        `/api/v1/promo-tiers/${tier.id}`,
                        { method: 'DELETE' },
                        'That tier could not be removed.'
                      )
                    }
                  >
                    <X className="size-4" strokeWidth={2} aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {error === null ? null : (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      )}

      {!canEdit ? null : adding ? (
        <NewTier
          busy={busy}
          onCancel={() => setAdding(false)}
          onCreate={async (body) => {
            const ok = await call(
              '/api/v1/promo-tiers',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              },
              'That tier could not be added.'
            )
            if (ok) setAdding(false)
          }}
        />
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Add a tier
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * A new tier.
 *
 * **Never created as the default.** Promoting one is its own act, on the row,
 * because the default decides what the *next* offer says — quietly moving it
 * because somebody added a tier would change a card nobody edited.
 */
function NewTier({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean
  onCancel: () => void
  onCreate: (body: {
    labelEn: string
    labelAr: string | null
    tokenRef: TierToken
    emphasis: number
  }) => void
}) {
  const [labelEn, setLabelEn] = React.useState('')
  const [labelAr, setLabelAr] = React.useState('')
  // The first of the list rather than a named token: the design lint refuses a
  // `--sq-tpl-*` literal in chrome, correctly — the vocabulary lives in
  // `packages/db` because it is offer book content. `TIER_TOKENS` is `as const`
  // and non-empty, so the index is safe without a fallback, but one is given
  // because a reader should not have to check that to trust the line.
  const [tokenRef, setTokenRef] = React.useState<TierToken>(TIER_TOKENS[0])
  const [emphasis, setEmphasis] = React.useState(2)

  return (
    <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
      <Input
        label="What it says"
        value={labelEn}
        placeholder="Half price"
        onChange={(event) => setLabelEn(event.target.value)}
      />
      {/*
        **Not optional in the way a chip's is.** A tier is printed on every card
        carrying it, so an Arabic edition with an English tab on sixty cards is
        a different failure from one chip in English. It is still not enforced —
        E5 §2's publish blocker is about catalog data — but the hint says what
        it costs.
      */}
      <Input
        label="In Arabic"
        dir="rtl"
        value={labelAr}
        hint="Shown on every card in an Arabic edition."
        onChange={(event) => setLabelAr(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Colour"
          value={tokenRef}
          options={TIER_TOKENS.map((token) => ({
            value: token,
            label: TIER_TOKEN_LABEL[token],
          }))}
          onChange={(event) => setTokenRef(event.target.value as TierToken)}
        />
        <Select
          label="Emphasis"
          value={String(emphasis)}
          hint="Decides badge size, and which offers get the big spaces."
          options={[1, 2, 3].map((value) => ({
            value: String(value),
            label: EMPHASIS_LABEL[value] ?? String(value),
          }))}
          onChange={(event) => setEmphasis(Number(event.target.value))}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          loading={busy}
          disabled={labelEn.trim() === ''}
          onClick={() =>
            onCreate({
              labelEn: labelEn.trim(),
              labelAr: labelAr.trim() === '' ? null : labelAr.trim(),
              tokenRef,
              emphasis,
            })
          }
        >
          Add tier
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
