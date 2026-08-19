import { Skeleton } from '@/components/ui/skeleton'

/**
 * The brand kit page fans out to four reads — the effective brand, which is two
 * queries of its own, plus grids and templates. Above the ladder's one-second
 * rung on a first load, so it gets skeletons.
 *
 * The header is rendered for real rather than skeletoned: it is static, and
 * blanking text the server already knows makes the page feel slower than it is.
 * It must stay identical to `page.tsx`'s, or the heading shifts when the data
 * arrives.
 */
export default function BrandKitLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Brand kit</h1>
        <p className="font-ui text-body text-secondary">
          What every new offer book starts from. Anything you have already
          published stays exactly as it is.
        </p>
      </div>

      {/* The summary card, then the logo, colours and layout sections. */}
      <Skeleton shape="card" />
      <Skeleton shape="row" count={3} />
    </div>
  )
}
