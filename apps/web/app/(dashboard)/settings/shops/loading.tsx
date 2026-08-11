import { Skeleton } from '@/components/ui/skeleton'

/**
 * The first `loading.tsx` in the app.
 *
 * The shop list is three indexed reads plus a count, so this will usually flash
 * past — but it is a first load of a route that fans out, and the design
 * skill's ladder puts skeletons over a second on first load. The header is
 * rendered for real rather than skeletoned: it is static, and blanking text the
 * server already knows makes the page feel slower than it is.
 */
export default function ShopsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Shops</h1>
        <p className="font-ui text-body text-secondary">
          Every branch you run. Each one makes its own offer books.
        </p>
      </div>

      <Skeleton shape="row" count={3} />
    </div>
  )
}
