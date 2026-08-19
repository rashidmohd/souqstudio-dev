'use client'

import { Button } from '@/components/ui/button'
import { LogoField } from '@/components/brand/LogoField'
import { useBrandStore } from '@/stores/brand-store'

/**
 * Step 1 — upload a logo. E4-01.
 *
 * The upload itself lives in `LogoField`, which E4-05's brand kit screen shares.
 * What is left here is the wizard's own navigation: the primary action moves
 * from the upload button to Continue once a logo exists, so that the step
 * always has exactly one primary and it is always the one that moves forward.
 */
export function LogoStep({ onContinue }: { onContinue: () => void }) {
  const { logoUrl } = useBrandStore()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Upload your logo</h2>
        <p className="font-ui text-body text-secondary">
          We will lift it off its background and pull your brand colours from it.
        </p>
      </div>

      <LogoField variant={logoUrl ? 'secondary' : 'primary'}>
        <Button type="button" variant={logoUrl ? 'primary' : 'ghost'} size="lg" onClick={onContinue}>
          {logoUrl ? 'Continue' : 'Skip for now'}
        </Button>
      </LogoField>
    </div>
  )
}
