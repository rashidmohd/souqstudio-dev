import { requireAdminRole } from '@/lib/admin-auth'
import { PromptForm } from '@/components/prompts/PromptForm'
import { PageHeader } from '@/components/shared/PageHeader'

/** Write a new cover prompt. E13, AI prompt management. */
export const dynamic = 'force-dynamic'

export default async function NewPromptPage() {
  await requireAdminRole('catalog_manager')

  return (
    <>
      <PageHeader
        title="Add prompt"
        description="It appears in every shop's cover picker once it is offered."
      />
      <PromptForm
        initial={{
          slug: '',
          label: '',
          hint: '',
          scene: '',
          person: 'staff',
          group: 'everyday',
          sortOrder: '100',
          // A new prompt arrives retired, so a half-written scene cannot reach
          // a shop's picker between saving it and reading it back.
          isActive: false,
        }}
      />
    </>
  )
}
