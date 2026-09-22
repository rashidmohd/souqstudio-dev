import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getFonts, listFonts, type Font } from '@souqstudio/db'
import { fontFileKey } from '@souqstudio/types'
import { getObjectBytes } from './r2'

/**
 * The brand-kit typefaces, as **files**, for everything that renders or measures
 * outside a browser. `docs/fonts-from-google.md` §6 A4.
 *
 * **A link is not enough here, and that is the whole point of Part A.** Three
 * consumers need the bytes themselves:
 *
 *   Playwright  a PDF embeds a font program, and Chromium can only embed one it
 *               has actually loaded. Fetching it from `fonts.googleapis.com` on
 *               a critical path makes an export depend on an external network.
 *   HarfBuzz    a shaper opens a font file. E14 Phase 0.1 measured 0.000%
 *               parity with Chromium's canvas — over the same bytes. Read a
 *               different release and the number stops being true.
 *   Anything    that wants to know a face's real metrics rather than guess.
 *
 * **TTF, not the woff2 the browser gets.** A shaper cannot read woff2 without a
 * brotli decompressor, and the mirror stores both for exactly this reason.
 *
 * **The registry is the index.** A row exists only once the files are in R2, so
 * a family named by a brand kit is a family this can load — and one that is not
 * in the registry is reported as missing rather than fetched from anywhere else.
 */

/**
 * Where files land between jobs.
 *
 * A worker renders many books and a family is ~90 kB a weight; re-fetching the
 * same face from R2 for every page is a round trip per page for bytes that
 * cannot have changed. Keys are immutable by design — §2a — so a cached file is
 * never stale, which is what makes a plain on-disk cache correct here rather
 * than merely fast.
 */
const CACHE_DIR = join(tmpdir(), 'souqstudio-fonts')

/** Same process, same bytes. Bounded by the catalog, which is small. */
const memory = new Map<string, Buffer>()

export interface FontFile {
  family: string
  weight: number
  italic: boolean
  path: string
  bytes: Buffer
}

function cachePath(slug: string, weight: number, italic: boolean): string {
  return join(CACHE_DIR, `${slug}-${weight}${italic ? 'i' : ''}.ttf`)
}

/**
 * The nearest weight a family actually has.
 *
 * **Asking for a weight a family does not ship is not an error.** A brand kit
 * binds a level to 600 and Lalezar has only 400; the page still has to render.
 * Chromium would synthesise, and a shaper would fail — so the choice is made
 * here, once, where both can see it. Nearest rather than next-heavier because
 * 400 is a better stand-in for 500 than 700 is.
 */
export function nearestWeight(available: readonly number[], wanted: number): number | null {
  if (available.length === 0) return null
  return available.reduce((best, weight) =>
    Math.abs(weight - wanted) < Math.abs(best - wanted) ? weight : best
  )
}

async function fetchFace(font: Font, weight: number, italic: boolean): Promise<Buffer> {
  const key = fontFileKey(font.slug, weight, italic)

  const cached = memory.get(key)
  if (cached) return cached

  const onDisk = cachePath(font.slug, weight, italic)
  if (existsSync(onDisk)) {
    const bytes = await readFile(onDisk)
    memory.set(key, bytes)
    return bytes
  }

  const bytes = await getObjectBytes(key)
  if (bytes.length === 0) {
    throw new Error(
      `${font.family} ${weight}${italic ? ' italic' : ''}: no bytes at ${key}. ` +
        'The registry row says this face is mirrored; the bucket disagrees.'
    )
  }

  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(onDisk, bytes)
  memory.set(key, bytes)
  return bytes
}

/**
 * One face, by family and weight.
 *
 * Returns null for a family with no registry row — **not a throw**. A book whose
 * brand kit names a face we never mirrored still has to export; the caller falls
 * back exactly as `resolveFont()` does in the app, rather than failing a job an
 * owner is waiting on.
 */
export async function loadFace(
  family: string,
  weight: number,
  italic = false
): Promise<FontFile | null> {
  const [font] = await getFonts([family])
  if (!font) return null

  const available = italic ? font.italicWeights : font.weights
  const actual = nearestWeight(available, weight)
  if (actual === null) {
    // An italic asked of a family that ships none. Upright is the honest answer;
    // a synthesised slant is the browser's business, not a file we can provide.
    if (italic) return loadFace(family, weight, false)
    return null
  }

  return {
    family: font.family,
    weight: actual,
    italic,
    path: cachePath(font.slug, actual, italic),
    bytes: await fetchFace(font, actual, italic),
  }
}

/**
 * Every face a set of families needs, warmed into the cache.
 *
 * **Call this before rendering, not during.** Playwright loading a face
 * mid-render is the same defect as a webfont resolving after Fabric cached its
 * metrics: the first page is laid out against a fallback and the rest are not,
 * and one book comes out with two different sets of line breaks.
 */
export async function warmFaces(
  families: readonly string[],
  weights: readonly number[]
): Promise<FontFile[]> {
  const loaded = await Promise.all(
    [...new Set(families)].flatMap((family) =>
      [...new Set(weights)].map((weight) => loadFace(family, weight))
    )
  )
  return loaded.filter((face): face is FontFile => face !== null)
}

/**
 * `@font-face` rules pointing at **local files**, for a page Playwright renders.
 *
 * Not the registry's stored CSS: that points at R2 over the network, which is
 * the dependency this whole module exists to remove. `file://` means the render
 * cannot be slowed or broken by anything outside the container.
 *
 * `font-display: block` rather than `swap` — the opposite of the browser's rule
 * and for the opposite reason. In chrome a slow face must not blank the page; in
 * an export there is no user watching and a swap halfway through pagination is a
 * book set in two typefaces.
 */
export function localFontFaceCss(faces: readonly FontFile[]): string {
  return faces
    .map(
      (face) => `@font-face {
  font-family: '${face.family}';
  font-style: ${face.italic ? 'italic' : 'normal'};
  font-weight: ${face.weight};
  font-display: block;
  src: url('file://${face.path}') format('truetype');
}`
    )
    .join('\n')
}

/** Every mirrored family, for a warm-up that does not know the kit yet. */
export async function allFamilies(): Promise<string[]> {
  return (await listFonts()).map((font) => font.family)
}
