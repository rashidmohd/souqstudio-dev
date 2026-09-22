import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireAdminRole } from '@/lib/admin-auth'
import { PromptForm } from '@/components/prompts/PromptForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'

/** Tune one cover prompt. E13, AI prompt management. */
export const dynamic = 'force-dynamic'

export default async function PromptPage({ params }: { params: { id: string } }) {
  await requireAdminRole('catalog_manager')

  const prompt = await prisma.coverPrompt.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      slug: true,
      label: true,
      hint: true,
      scene: true,
      person: true,
      group: true,
      sortOrder: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (prompt === null) notFound()

  /*
   * How many covers came from this prompt. It is the only measure of whether a
   * scene is working that this screen can show without a model: a prompt
   * nobody picks is as much a problem as one that returns bad pictures, and
   * neither is visible from the text.
   *
   * The column is `campaign` rather than `promptSlug` — `cover.job.ts` writes
   * `job.data.promptSlug ?? 'custom'` into it, so a free-text cover is counted
   * as "custom" and never against a row here.
   */
  const covers = await prisma.cover.count({ where: { campaign: prompt.slug } })

  return (
    <>
      <PageHeader title={prompt.label} description="Tuning this changes every cover generated from it next." />

      <Card className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col">
          <span className="text-label text-muted">Slug</span>
          <Figure size="data-sm">{prompt.slug}</Figure>
        </div>
        <div className="flex flex-col">
          <span className="text-label text-muted">Last changed</span>
          <Figure size="data-sm">{prompt.updatedAt.toISOString().slice(0, 10)}</Figure>
        </div>
        {covers === null ? null : (
          <div className="flex flex-col">
            <span className="text-label text-muted">Covers made from it</span>
            <Figure size="data-sm">{covers}</Figure>
          </div>
        )}
      </Card>

      <PromptForm
        promptId={prompt.id}
        initial={{
          slug: prompt.slug,
          label: prompt.label,
          hint: prompt.hint ?? '',
          scene: prompt.scene,
          person: prompt.person,
          group: prompt.group,
          sortOrder: String(prompt.sortOrder),
          isActive: prompt.isActive,
        }}
      />
    </>
  )
}
