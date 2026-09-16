import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/shared/page-container'

export default function TeamLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Team</h1>
        <p className="font-ui text-body text-secondary">
          Who can sign in, and which shops each of them can use.
        </p>
      </div>

      <Skeleton shape="row" count={4} />
    </PageContainer>
  )
}
