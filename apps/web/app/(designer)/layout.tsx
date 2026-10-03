import type { ReactNode } from 'react'
import { Toaster } from '@souqstudio/designer/components/ui/toast'
import { FontCatalogProvider } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { getActiveShop } from '@/lib/active-shop'
import { loadFontsForKit } from '@/lib/font-catalog-server'
import { requireCompliantSession } from '@/lib/session'

/**
 * The block designer's own shell: the whole window, and no rail. Layout
 * family 3 — see the design skill → references/layout-map.md.
 *
 * **Out of `(dashboard)` because a nested layout cannot remove the rail.** Next
 * nests layouts rather than replacing them, so the only way to give the
 * designer the full window is a route group of its own. Owners reported the
 * rail and its links beside the canvas as a way to leave a design by mistake;
 * the designer's header carries the one way out, and it asks before it goes.
 *
 * **What it keeps from the app shell is everything except the rail**: the same
 * session gate, the shop's brand-kit faces (the canvas draws in them), and the
 * one toast live region.
 */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireCompliantSession()
  const activeShop = await getActiveShop(session)

  // Same reasoning as the dashboard layout: only the four faces this shop's kit
  // draws in, served from R2. `docs/fonts-from-google.md` §6 A2.
  const { catalog: fontCatalog, css: fontFaceRules } = await loadFontsForKit(
    activeShop?.brandKit
  )

  return (
    <FontCatalogProvider catalog={fontCatalog}>
      {fontFaceRules !== '' && <style dangerouslySetInnerHTML={{ __html: fontFaceRules }} />}
      <main className="min-h-screen bg-canvas-surround">{children}</main>
      <Toaster />
    </FontCatalogProvider>
  )
}
