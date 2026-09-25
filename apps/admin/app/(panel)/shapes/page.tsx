import Link from 'next/link'
import { listGalleryShapes } from '@souqstudio/db'
import { OCCASIONS } from '@souqstudio/engine'
import { ShapeArtMark } from '@souqstudio/designer/components/card-designer/ShapeArtMark'
import { SHAPE_GROUPS } from '@souqstudio/designer/lib/shape-gallery'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { ShapeActions } from '@/components/shapes/ShapeActions'
import { ShapeUploadForm } from '@/components/shapes/ShapeUploadForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState, ZeroResults } from '@/components/ui/states'

/**
 * The shape gallery console. E13-04.
 *
 * SouqStudio adds outlines here, as drafts, and publishes them into every
 * shop's designer, where they open from "More shapes" in a dialog with the same
 * groups and search as this page. A gallery shape is recoloured by each shop's
 * palette like the built-in shapes; placing one copies it into the block, so
 * retiring it never changes a book.
 */
export const dynamic = 'force-dynamic'

const STATUS_FILTERS = [
  { value: '', label: 'Every state' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Retired' },
] as const

export default async function ShapesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { admin } = await requireAdmin()

  const one = (key: string) => {
    const value = searchParams[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  const q = one('q').toLowerCase()
  const group = SHAPE_GROUPS.some((g) => g.value === one('group')) ? one('group') : ''
  const status = STATUS_FILTERS.some((s) => s.value === one('status')) ? one('status') : ''

  const all = await listGalleryShapes(['draft', 'published', 'archived'])
  const shapes = all.filter(
    (shape) =>
      (group === '' || shape.group === group) &&
      (status === '' || shape.status === status) &&
      (q === '' || shape.name.toLowerCase().includes(q) || (shape.occasion ?? '').includes(q))
  )
  const counts = {
    published: all.filter((shape) => shape.status === 'published').length,
    draft: all.filter((shape) => shape.status === 'draft').length,
  }
  const groupLabel = (value: string) =>
    SHAPE_GROUPS.find((g) => g.value === value)?.label ?? value
  const mayAdd = roleAtLeast(admin.role, 'catalog_manager')
  const mayPublish = roleAtLeast(admin.role, 'super_admin')
  const filtered = q !== '' || group !== '' || status !== ''

  return (
    <>
      <PageHeader
        title="Shape gallery"
        description="Outlines every shop can add from More shapes in the designer, drawn in their own colours."
      />

      <div className="flex flex-wrap gap-2">
        <StatusPill tone="positive">{counts.published} published</StatusPill>
        <StatusPill tone="caution">{counts.draft} drafts</StatusPill>
      </div>

      {mayAdd ? (
        <ShapeUploadForm
          groups={SHAPE_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
          occasions={OCCASIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      ) : null}

      <form method="get" action="/shapes" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="shapes-q" className="text-label font-medium text-primary">
            Search
          </label>
          <Input id="shapes-q" name="q" defaultValue={q} placeholder="crescent, arrow" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="shapes-group" className="text-label font-medium text-primary">
            Group
          </label>
          <Select id="shapes-group" name="group" defaultValue={group} className="w-field-select">
            <option value="">Every group</option>
            {SHAPE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="shapes-status" className="text-label font-medium text-primary">
            State
          </label>
          <Select id="shapes-status" name="status" defaultValue={status} className="w-field-select">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Show</Button>
        {filtered ? (
          <Link href="/shapes" className="text-body text-link underline">
            Clear
          </Link>
        ) : null}
      </form>

      {shapes.length === 0 ? (
        filtered ? (
          <ZeroResults
            query={q}
            onReset={
              <Link href="/shapes" className="text-body text-link underline">
                Clear the filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No shapes yet"
            body="Add the first one above. It starts as a draft and reaches shops when it is published."
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {shapes.map((shape) => (
            <li
              key={shape.id}
              className="flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle p-2"
            >
              <div className="flex aspect-square items-center justify-center rounded-chip bg-stone-100 p-4 text-primary">
                <ShapeArtMark art={shape.art} className="h-full w-full" />
              </div>
              <span className="truncate text-body font-medium text-primary" title={shape.name}>
                {shape.name}
              </span>
              <span className="truncate text-body-sm text-secondary">
                {groupLabel(shape.group)}
                {shape.occasion === null ? '' : `, ${shape.occasion}`}
              </span>
              <div className="flex flex-wrap gap-1">
                {shape.status === 'published' ? (
                  <StatusPill tone="positive">Published</StatusPill>
                ) : shape.status === 'archived' ? (
                  <StatusPill tone="quiet">Retired</StatusPill>
                ) : (
                  <StatusPill tone="caution">Draft</StatusPill>
                )}
              </div>
              {mayPublish ? <ShapeActions id={shape.id} status={shape.status} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
