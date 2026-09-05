'use client'

import * as React from 'react'
import {
  Apple,
  Bath,
  Cookie,
  CupSoda,
  Croissant,
  Milk,
  Monitor,
  ShoppingBasket,
  Snowflake,
  SprayCan,
  type LucideIcon,
} from 'lucide-react'
import type { CatalogCategoryTile } from '@souqstudio/types'
import { Figure } from '@/components/ui/figure'
import { IconChip } from '@/components/ui/icon-chip'
import type { CatalogLanguage } from '@/lib/catalog-display'

/**
 * The category tiles — E5-02, and the catalog's empty search state.
 *
 * **This is the `empty` state, not `zero-results`.** An owner who has not typed
 * anything has not failed to find something; they have not asked yet. That is
 * why the screen shows a way in rather than an `EmptyState`, and it is the same
 * distinction that struck `empty-catalog-search` off the illustration manifest.
 *
 * Icons are matched to the ten seeded categories by name. A category the seed
 * does not carry — one an admin adds in E5-08 — falls back to the basket rather
 * than rendering an empty square, because `catalog_categories.iconUrl` is
 * nullable and nothing populates it yet.
 */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Grocery: ShoppingBasket,
  Beverages: CupSoda,
  Snacks: Cookie,
  Dairy: Milk,
  Bakery: Croissant,
  Cleaning: SprayCan,
  'Personal Care': Bath,
  Electronics: Monitor,
  'Fresh Produce': Apple,
  'Frozen Foods': Snowflake,
}

export function CategoryTiles({
  categories,
  lang,
  onSelect,
}: {
  categories: CatalogCategoryTile[]
  lang: CatalogLanguage
  onSelect: (category: CatalogCategoryTile) => void
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {categories.map((category) => {
        // The Arabic label falls back to the English one. A category with no
        // `nameAr` must show a name, not a gap — E5-02 says so explicitly.
        const label = lang === 'ar' ? (category.nameAr ?? category.name) : category.name
        const Icon = CATEGORY_ICON[category.name] ?? ShoppingBasket

        return (
          <li key={category.id}>
            <button
              type="button"
              onClick={() => onSelect(category)}
              className="flex h-full w-full flex-col items-start gap-2 rounded-card border-hairline border-border-subtle bg-surface p-4 text-start transition-colors duration-fast ease-sq hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              <IconChip icon={Icon} tint="sand-tint" />
              <span className="font-ui text-body font-medium text-primary">{label}</span>
              <Figure
                value={category.productCount}
                size="data-sm"
                className="text-secondary"
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
