import { Skeleton } from '@/components/ui/skeleton'

export default function TeamLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Team</h1>
        <p className="font-ui text-body text-secondary">
          Who can sign in, and which shops each of them can use.
        </p>
      </div>

      <Skeleton shape="row" count={4} />
    </div>
  )
}
