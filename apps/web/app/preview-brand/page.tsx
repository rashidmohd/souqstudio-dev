/** TEMPORARY — delete with the '/preview-brand' entry in middleware PUBLIC_PATHS. */
'use client'

import * as React from 'react'
import { BrandKitScreen } from '@/components/brand/BrandKitScreen'
import { SEED_BLOCKS } from '@souqstudio/engine'

export default function PreviewPage() {
  const [dir, setDir] = React.useState<'ltr' | 'rtl'>('ltr')

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dir') === 'rtl') setDir('rtl')
  }, [])

  React.useEffect(() => {
    document.documentElement.dir = dir
  }, [dir])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <button
        type="button"
        onClick={() => setDir(dir === 'ltr' ? 'rtl' : 'ltr')}
        className="self-start rounded-pill bg-action-primary px-4 py-2 font-ui text-body-sm text-inverse"
      >
        dir: {dir}
      </button>

      <BrandKitScreen
        shopId="shop_preview"
        shopName="Al Nakheel Market"
        logoUrl={null}
        brandKit={{
          primaryColor: '#1B4DB1',
          secondaryColor: '#0E2A5C',
          accentColor: '#C9A227',
          suggestedColors: ['#1B4DB1', '#0E2A5C', '#C9A227', '#8A1F2B'],
        }}
        brandOverride="inherit"
        source={{ logo: 'org', colors: 'org', typography: 'org', progress: 'shop' }}
        canEdit
        isOwner
        blocks={SEED_BLOCKS.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          arrangements: b.arrangements,
        }))}
      />
    </div>
  )
}
