import type { LibraryManifest } from './library-source'

/**
 * What `blocks:publish` writes when the prefix already has a manifest.
 *
 * **Two publishers write one library.** The repo's blocks arrive through
 * `blocks:publish`; SouqStudio's newer designs arrive one at a time from the
 * admin panel through `apps/web`'s publish route. The panel's route merges into
 * the manifest. The script used to replace it, which dropped every panel block
 * from the list, and the next sync then archived or deleted them in every shop.
 *
 * So a panel entry carries `origin: 'panel'` and this keeps it:
 *
 * - a repo block the panel has **replaced** (same id) is not written, because the
 *   panel's version is the newer design and a re-run of the script must not
 *   quietly undo it;
 * - every other panel entry is kept as it is;
 * - `drop` names panel blocks to retire on purpose, which is the only way one
 *   leaves the library from this side.
 *
 * A repo block that is no longer in the repo is dropped, as before: the repo is
 * the only thing that knows it was retired.
 */
export interface ManifestMerge {
  manifest: Omit<LibraryManifest, 'version'>
  /** Repo ids whose documents must not be written: the panel's copy stands. */
  replacedByPanel: string[]
  /** Panel ids carried over from the existing manifest. */
  keptFromPanel: string[]
  /** Panel ids retired by `drop`. */
  dropped: string[]
}

export function mergeManifest(
  repo: readonly LibraryManifest['blocks'][number][],
  existing: LibraryManifest | null,
  drop: ReadonlySet<string> = new Set()
): ManifestMerge {
  const panel = (existing?.blocks ?? []).filter((entry) => entry.origin === 'panel')
  const kept = panel.filter((entry) => !drop.has(entry.id))
  const keptIds = new Set(kept.map((entry) => entry.id))

  const fromRepo = repo
    .filter((entry) => !keptIds.has(entry.id))
    .map((entry) => ({ id: entry.id, category: entry.category }))

  const blocks = [...fromRepo, ...kept]

  return {
    manifest: { count: blocks.length, blocks },
    replacedByPanel: repo.filter((entry) => keptIds.has(entry.id)).map((entry) => entry.id),
    keptFromPanel: kept.map((entry) => entry.id),
    dropped: panel.filter((entry) => drop.has(entry.id)).map((entry) => entry.id),
  }
}
