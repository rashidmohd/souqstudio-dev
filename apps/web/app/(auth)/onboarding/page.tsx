import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { requireVerifiedSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand, isBrandSetupComplete } from '@/lib/brand-kit'
import { BrandSetupWizard } from '@/components/brand/BrandSetupWizard'

export const metadata: Metadata = { title: 'Set up your brand · SouqStudio' }

/**
 * E1-04 — guided brand setup, run once on first login.
 *
 * `requireVerifiedSession()` is what makes "verify before onboarding" a rule
 * rather than a suggestion: typing this URL while unverified lands on
 * /verify-email, not here.
 *
 * Grids and templates are read here and passed down. They are published rows,
 * identical for every shop, so fetching them on the server keeps the wizard
 * from opening with two spinners on the steps that matter most.
 */
export default async function OnboardingPage() {
  const session = await requireVerifiedSession()

  const shop = await getActiveShop(session)
  if (!shop) redirect('/')

  // The kit the wizard edits is the effective one — which, for a shop that has
  // never overridden anything, is the organization's. That is what makes a
  // second branch inherit the brand instead of starting blank.
  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  // Already done. Coming back here would offer to redo choices the editor is
  // already using; the brand kit screen in E4-05 is where edits belong.
  if (isBrandSetupComplete(brand.brandKit)) redirect('/')

  const [grids, templates] = await Promise.all([
    prisma.grid.findMany({
      where: { status: 'published' },
      select: { id: true, name: true, config: true, minProducts: true },
      orderBy: { name: 'asc' },
    }),
    prisma.template.findMany({
      where: { status: 'published' },
      select: { id: true, name: true, description: true, config: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="w-full max-w-4xl">
      <BrandSetupWizard
        shopName={shop.name}
        logoUrl={brand.logoUrl}
        brandKit={brand.brandKit}
        grids={grids.map((grid) => ({
          id: grid.id,
          name: grid.name,
          config: grid.config as unknown as GridConfig,
          minProducts: grid.minProducts,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          config: template.config as unknown as TemplateConfig,
        }))}
      />
    </div>
  )
}
