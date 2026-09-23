'use client'

import * as React from 'react'
import type { FontCatalog } from '../../lib/font-catalog'

/**
 * Carries the font registry to the components that resolve a brand kit.
 *
 * **Because every one of those components is a client component.** The artboard,
 * the block preview, the book page, the typography panel and the logo dialog all
 * call `resolveScale()` synchronously while rendering, and the catalog is now a
 * database table. A context is what lets the resolvers stay pure: the layout
 * reads the table once per request on the server and puts the answer here.
 *
 * **The empty array is a real state, not a missing provider.** A fresh
 * environment has mirrored nothing, and the resolvers fall back to a chrome face
 * on an empty catalog. So a component rendered outside a provider — a test, a
 * storybook, the public viewer — behaves the same as one inside an empty
 * registry, which is the honest default and does not throw.
 */
const FontCatalogContext = React.createContext<FontCatalog>([])

export function FontCatalogProvider({
  catalog,
  children,
}: {
  catalog: FontCatalog
  children: React.ReactNode
}) {
  // The array is rebuilt on every server render and would otherwise give every
  // consumer a new reference each time; the contents only change when somebody
  // mirrors a family.
  const value = React.useMemo(() => catalog, [catalog])
  return <FontCatalogContext.Provider value={value}>{children}</FontCatalogContext.Provider>
}

export function useFontCatalog(): FontCatalog {
  return React.useContext(FontCatalogContext)
}
