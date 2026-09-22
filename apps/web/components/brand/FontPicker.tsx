'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { isRecommended } from '@/lib/font-editorial'
import type { OfferableFont } from '@/lib/font-catalog-server'

/**
 * Choosing a typeface from the whole offerable library.
 *
 * **A list rather than a `Select`, because choosing type is comparing it.** A
 * native select shows one name at a time and closes the moment you move, so an
 * owner deciding between four faces had to open it four times and remember what
 * the last one looked like. Here the arrow keys walk the list and the specimen
 * beside it redraws on every step, which is the whole interaction: hold down
 * the arrow and watch the shop's headline change.
 *
 * **Moving the selection commits it**, rather than requiring Enter. Nothing is
 * saved until the dialog is saved, so there is no cost to the draft changing as
 * you browse, and an "active but not chosen" state would mean the specimen
 * either lags behind the highlight or disagrees with it.
 *
 * **Rows are drawn in the interface face, not their own.** Fifty-seven families
 * previewed at once is fifty-seven downloads from Google for a list most people
 * scroll past; the specimen panel loads the one face that is actually selected.
 * `lib/use-specimen-font.ts` is what does that.
 */
export function FontPicker({
  value,
  fonts,
  onChange,
}: {
  value: string
  fonts: readonly OfferableFont[]
  onChange: (family: string) => void
}) {
  const [query, setQuery] = React.useState('')
  const listId = React.useId()
  const listRef = React.useRef<HTMLUListElement>(null)

  /**
   * The ones we wrote notes for first, then everything else, alphabetically.
   *
   * A family already chosen is always present even if it is not offered any
   * more, so opening the dialog can never silently change what is set.
   */
  const ordered = React.useMemo(() => {
    const known = new Set(fonts.map((font) => font.family))
    const rows: OfferableFont[] = [
      ...fonts,
      ...(value !== '' && !known.has(value)
        ? [{ family: value, category: '', subsets: [], mirrored: true }]
        : []),
    ]
    return rows.sort((a, b) => {
      const ar = isRecommended(a.family)
      const br = isRecommended(b.family)
      if (ar !== br) return ar ? -1 : 1
      return a.family.localeCompare(b.family)
    })
  }, [fonts, value])

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return ordered
    // Name and category both, so "serif" finds the serifs.
    return ordered.filter(
      (font) =>
        font.family.toLowerCase().includes(q) || font.category.toLowerCase().includes(q)
    )
  }, [ordered, query])

  const index = shown.findIndex((font) => font.family === value)

  // Keep the selected row visible when the arrows walk past the fold, and when
  // a search narrows the list under it.
  React.useEffect(() => {
    if (index < 0) return
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [index, query])

  const move = (delta: number) => {
    if (shown.length === 0) return
    // From an unlisted family, the first arrow lands on the first row rather
    // than jumping to the end.
    const from = index < 0 ? (delta > 0 ? -1 : 0) : index
    const next = Math.min(shown.length - 1, Math.max(0, from + delta))
    const font = shown[next]
    if (font) onChange(font.family)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }
    const delta = keys[event.key]
    if (delta !== undefined) {
      // The list scrolls, not the dialog behind it.
      event.preventDefault()
      move(delta)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const font = event.key === 'Home' ? shown[0] : shown[shown.length - 1]
      if (font) onChange(font.family)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/*
        The `Input` primitive, not a hand-styled field with a leading icon.
        The first attempt was the latter and it shipped a real defect: the
        placeholder ran underneath the magnifier, because `ps-9` does not exist.
        This config *replaces* the spacing scale rather than extending it, so the
        only steps are 1/2/3/4/6/8/12, and anything else silently emits nothing.
        The catalog's own search box is a plain labelled `Input` with no icon;
        matching it is both correct and less code.
      */}
      <Input
        label="Typeface"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search typefaces"
        aria-controls={listId}
      />

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Typeface"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="max-h-list-cap overflow-y-auto rounded-control border-hairline border-border-subtle bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        {shown.length === 0 ? (
          <li className="px-3 py-2 font-ui text-body-sm text-secondary">
            Nothing matches {query}.
          </li>
        ) : (
          shown.map((font, i) => {
            const selected = font.family === value
            return (
              <li key={font.family} data-index={i}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange(font.family)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-start font-ui text-body ${
                    selected
                      ? 'bg-sunken text-primary border-s-2 border-action-primary'
                      : 'text-secondary border-s-2 border-transparent'
                  }`}
                >
                  <span className="min-w-0 truncate">{font.family}</span>
                  <span className="shrink-0 font-ui text-eyebrow text-muted">
                    {isRecommended(font.family)
                      ? 'Recommended'
                      : font.mirrored
                        ? font.category.replace('-', ' ')
                        : 'New'}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>

      <span className="font-ui text-body-sm text-secondary">
        {shown.length} of {ordered.length}. Use the arrow keys to compare.
      </span>
    </div>
  )
}
