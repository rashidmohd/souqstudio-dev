import { Wordmark } from '@/components/brand/Wordmark'

/**
 * Layout family 4 — onboarding and brand setup. See the design skill,
 * references/layout-map.md.
 *
 * Centred single column, no navigation, one decision per screen.
 *
 * The product is fully self-serve, so this flow is the entire sales team. Any
 * nav visible here is an exit someone takes before reaching value: no rail, no
 * header links, no "skip to dashboard". The wordmark is deliberately not a link
 * home for the same reason.
 *
 * The wordmark is the monochrome cut in charcoal, so it reads as one object with
 * the primary button rather than putting the only blue on the screen beside a
 * charcoal CTA. Blue still appears here — focus rings and the links — which is
 * the 5% the design system allocates it.
 *
 * **The measure belongs to the page, not to this layout.** It used to pin
 * everything to `max-w-md`, which is right for a login form and far too narrow
 * for E1-04's brand setup, where a live preview sits beside the choices. Each
 * page now sets its own width — `max-w-md` for the single-column forms — so the
 * family stays "no nav, one decision per screen" without also meaning one fixed
 * column width.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 py-8">
      <div className="flex w-full flex-col items-center gap-8">
        <Wordmark className="text-primary" />
        {children}
      </div>
    </div>
  )
}
