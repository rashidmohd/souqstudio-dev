import type { FontRegistration } from './fonts'
import {
  fontFileKey,
  fontLicenseKey,
  fontSlug,
  fontWoff2Key,
  googleFontsDir,
} from '@souqstudio/types'

/**
 * Pulling a typeface out of Google Fonts and into R2. `docs/fonts-from-google.md`.
 *
 * **In `packages/db` because there are three callers now**, and they live in
 * different apps: `PATCH /api/v1/brand` when an owner picks a face nobody has
 * picked before, `scripts/mirror-fonts.ts` pre-warming the likely ones from a
 * terminal, and the worker finishing a family in the background after a save has
 * already returned. The worker cannot import from `apps/web`, and a second
 * implementation is how a pre-warmed family comes to differ from a lazily
 * mirrored one under the same key — the failure `library-sync.ts` is here to
 * avoid, for the same reason.
 *
 * **R2 access is injected rather than imported.** `lib/r2.ts` is `server-only`
 * and reads the validated `env`, neither of which a `tsx` script can use. The
 * route hands in its client, the script hands in its own, and `--dry-run` hands
 * in one that discards. That seam is also what makes the interesting part
 * testable without a bucket.
 *
 * ## The shape of a run
 *
 * One family, taken whole — every weight and every italic, not the weights some
 * kit happens to bind today. §2b: a partially mirrored family forces a
 * per-weight presence check into the specimen, the artboard, the shaper and the
 * worker, and the storage that buys is ~1 MB.
 *
 * Two formats, because no single one serves both readers. §4.
 *
 * Files first, row last. The row in `fonts` is what every other surface treats
 * as proof the bytes exist; written before the uploads finish it is a brand kit
 * naming a face the export cannot load. Same ordering rule, same reason, as the
 * manifest in `blocks:publish`.
 */

/*
 * **`no-restricted-syntax` is disabled below in five places, for `italic`.**
 *
 * The design rule bans the Tailwind `italic` utility, and it is right to: Plex
 * Sans Arabic has no true italic and a mixed-script screen must not emphasise
 * differently by language. None of that reaches this file. Nothing here renders;
 * `italic` is Google's own variant vocabulary (`700italic`) and the CSS
 * `font-style` value it parses out of their stylesheet. Renaming either would
 * mean not matching what Google sends.
 *
 * Disabled per line rather than per file, so the rasterizing-filter rules in the
 * same lint stay live here.
 */

/** A modern UA, or the CSS API answers with TTF and no `unicode-range`. */
const MODERN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * How many fetches are in flight at once.
 *
 * A whole family is far more requests than it looks — woff2 is split per script,
 * so Rubik's 14 faces across 6 subsets is 99 files, not 28. The previous script
 * did them in a sequential loop, which is where the 8–10s came from.
 *
 * **A parameter rather than a constant, but do not expect much from it.** The
 * uploads dominate — Rubik is 1.6s to fetch and 7.2s end to end — and raising
 * this was measured: 7.2s / 7.0s / 7.3s at 6 / 16 / 32. The cost is per-object
 * round trips to R2 rather than bandwidth, so concurrency is not the lever that
 * makes B2's blocking save tolerable. §8 says what is.
 */
export const DEFAULT_CONCURRENCY = 6

/**
 * Immutable because the key names a family, a weight and a format, and we never
 * re-fetch a family under the same key. §2a — a newer Google release is a
 * deliberate migration to new keys, not a cache bust. This is the one cache
 * header in the codebase that is telling the truth without qualification.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable'

export interface MirrorDeps {
  put(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void>
  publicUrl(key: string): string
}

/** One row of the Developer API's reply, narrowed to what is actually used. */
export interface GoogleFamily {
  family: string
  variants: string[]
  subsets: string[]
  version: string
  category: string
  files: Record<string, string>
}

export interface MirrorResult {
  /** Whether every face and subset Google offers is now in R2. */
  complete: boolean
  registration: FontRegistration
  /** Every key written, for a CLI to print and a test to assert on. */
  keys: string[]
  bytes: number
}

/**
 * What to take, when taking the whole family costs more time than there is.
 *
 * **Omit both and the family is taken whole**, which is what a pre-warm run and
 * the background completion job both do. A save that had to mirror a cold family
 * passes them, because 99 files is 7.2s and 16 is 1.5s — see
 * `docs/fonts-from-google.md` §8 for why that is not solvable with concurrency.
 */
export interface MirrorScope {
  concurrency?: number
  /** Only these weights. Italics of the same weight come along. */
  weights?: readonly number[]
  /** Only these scripts — `['arabic', 'latin', 'latin-ext']` for a Gulf shop. */
  subsets?: readonly string[]
}

/* ── Google's catalog ───────────────────────────────────────────────────── */

/**
 * The whole library, from the Developer API.
 *
 * **This replaces scraping.** `version`, `subsets`, `category` and direct TTF
 * URLs all arrive in one document — every field the old `mirror-fonts.mjs`
 * recovered by requesting the CSS API with a `Mozilla/4.0` user agent and
 * regexing the reply for a font URL. The scrape survives only for woff2, below,
 * because `unicode-range` is published nowhere else.
 *
 * ~1 MB of JSON. A caller that needs it more than once should hold it; this
 * function is deliberately not a cache, because the two callers have very
 * different lifetimes and a module-level cache in a serverless route is a
 * cache that never hits.
 */
export async function fetchGoogleCatalog(apiKey: string): Promise<GoogleFamily[]> {
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url)

  if (!response.ok) {
    // Google explains itself in the body, and the explanations are specific
    // enough to act on — a disabled API, a key restricted to HTTP referrers, a
    // key that does not exist. Swallowing that and printing the status leaves
    // somebody guessing between three different console settings.
    const detail = await response
      .json()
      .then((body: unknown) => {
        const error = (body as { error?: { message?: string; status?: string } }).error
        return error?.message ?? error?.status ?? ''
      })
      .catch(() => '')

    // The likeliest misconfiguration, and the least self-evident: a key created
    // through the default "browser key" flow carries an HTTP-referrer
    // restriction, and every call made from here is a server with no referer to
    // send. The fix is in the console, not in this code — adding a Referer
    // header would defeat a restriction the key's owner chose.
    const hint = /referer/i.test(detail)
      ? '\nThis key is restricted to HTTP referrers, which a server request cannot satisfy. ' +
        'In Google Cloud console → Credentials → this key → Application restrictions, choose ' +
        '"None" or "IP addresses", and under API restrictions leave it limited to the Web Fonts ' +
        'Developer API.'
      : '\nCheck that the Web Fonts Developer API is enabled for this key.'

    throw new Error(`Google Fonts catalog: ${response.status}. ${detail}${hint}`)
  }
  const body = (await response.json()) as { items?: GoogleFamily[] }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error('Google Fonts catalog: no items in the reply.')
  }
  return body.items
}

/**
 * One family, rather than the whole catalog.
 *
 * **The Developer API takes a `family` parameter, and not using it cost 4s on
 * every cold font change.** `fetchGoogleCatalog` returns ~1 MB of JSON
 * describing every family Google has; the blocking path needs one of them.
 * Measured: mirroring Amiri — 4 variants, 3 subsets, 17 objects — took 5.3s end
 * to end, of which the catalog download was the majority. The mirroring itself
 * was never the problem for a small family.
 *
 * Returns null when the family does not exist, which the caller reports as a
 * bad family name rather than as a failure to mirror.
 */
export async function fetchGoogleFamily(
  apiKey: string,
  family: string
): Promise<GoogleFamily | null> {
  const url =
    `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}` +
    `&family=${encodeURIComponent(family)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google Fonts (${family}): ${response.status}.`)
  }
  const body = (await response.json()) as { items?: GoogleFamily[] }
  // The filter matches on exact name, but it is Google's match rather than ours;
  // confirm it rather than trusting the first row.
  return body.items?.find((item) => item.family === family) ?? null
}

/**
 * `regular` → 400 upright, `700italic` → 700 italic, `italic` → 400 italic.
 *
 * Google's variant vocabulary, which is not CSS's. Anything unrecognised
 * returns null and is skipped rather than guessed at — a variant we cannot name
 * is a file we would store under a key nothing looks for.
 *
 * **Four digits, not three.** CSS defines `wght` up to 1000 and Google's variant
 * strings are bare digits, so a family offering that weight names it `1000`. No
 * family in the recommended ten does — Cairo, the heaviest, tops out at 900 —
 * but a three-digit pattern would drop such a face *silently*, because
 * unrecognised variants are filtered rather than raised, leaving the family
 * registered as complete with its heaviest weight missing. Cheap to allow for;
 * the failure it avoids is invisible.
 */
export function parseVariant(variant: string): { weight: number; italic: boolean } | null {
  const match = /^(\d{3,4})?(regular|italic)?$/.exec(variant)
  if (match === null) return null
  const digits = match[1]
  const word = match[2]
  if (digits === undefined && word === undefined) return null
  const weight = digits === undefined ? 400 : Number(digits)
  // CSS caps `font-weight` at 1000. Anything past it is not a weight we could
  // request back from the CSS API even if Google offered it.
  if (weight < 1 || weight > 1000) return null
  // eslint-disable-next-line no-restricted-syntax -- Google's variant vocabulary; see the note above.
  return { weight, italic: word === 'italic' }
}

/* ── The licence ────────────────────────────────────────────────────────── */

/**
 * Which licence a family is under, and the text of it.
 *
 * **Read, never assumed.** The previous script hardcoded `ofl/` in the GitHub
 * path, which is correct for the ten curated families and wrong for the library:
 * Google Fonts is OFL, Apache 2.0 and UFL. All three permit hosting and
 * embedding, so nothing here blocks — what differs is *which* licence file has
 * to travel with the files, and the directory holding the family in
 * `google/fonts` is the authority on that.
 *
 * A family in none of the three is refused rather than mirrored without a
 * licence. That is redistribution with the one condition dropped.
 */
const LICENCE_DIRS = [
  { dir: 'ofl', file: 'OFL.txt', id: 'OFL-1.1' },
  { dir: 'apache', file: 'LICENSE.txt', id: 'Apache-2.0' },
  { dir: 'ufl', file: 'UFL.txt', id: 'UFL-1.0' },
] as const

export interface Licence {
  id: string
  filename: string
  text: string
}

export async function fetchLicence(family: string): Promise<Licence> {
  const dir = googleFontsDir(family)
  for (const candidate of LICENCE_DIRS) {
    const url =
      `https://raw.githubusercontent.com/google/fonts/main/` +
      `${candidate.dir}/${dir}/${candidate.file}`
    const response = await fetch(url)
    if (response.ok) {
      return { id: candidate.id, filename: candidate.file, text: await response.text() }
    }
  }
  throw new Error(
    `${family}: no licence found in google/fonts under ofl/, apache/ or ufl/ (looked for "${dir}"). ` +
      'Refusing to mirror a family whose licence cannot travel with it.'
  )
}

/* ── The CSS API, for woff2 and the unicode ranges ──────────────────────── */

/**
 * The CSS API URL for every face of a family.
 *
 * `ital,wght@` tuples must be sorted — ital ascending, then wght ascending —
 * or the API answers 400. When a family has no italic the axis is dropped
 * entirely, because `ital,wght@0,400` is legal but needlessly different from
 * what a browser would request.
 */
export function cssApiUrl(family: string, faces: readonly { weight: number; italic: boolean }[]): string {
  const name = family.replace(/ /g, '+')
  const hasItalic = faces.some((face) => face.italic)

  const spec = hasItalic
    ? [...faces]
        .sort((a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight)
        .map((face) => `${Number(face.italic)},${face.weight}`)
        .join(';')
    : [...faces]
        .sort((a, b) => a.weight - b.weight)
        .map((face) => String(face.weight))
        .join(';')

  const axis = hasItalic ? 'ital,wght' : 'wght'
  return `https://fonts.googleapis.com/css2?family=${name}:${axis}@${spec}&display=swap`
}

export interface FaceBlock {
  /** `arabic`, `latin`, `latin-ext`. Google names it in a comment above the rule. */
  subset: string
  weight: number
  italic: boolean
  /** The gstatic URL, to be downloaded and replaced. */
  src: string
  /** The whole `@font-face { ... }` rule, verbatim. */
  rule: string
}

/**
 * Split Google's stylesheet into one record per `@font-face`.
 *
 * The subset name only exists as a CSS comment above each rule — `arabic`,
 * `latin` — and is not a property, so those comments are the delimiters. That name is what
 * makes a key readable and, more importantly, what makes it *stable*: keying by
 * the position of the rule in the file would renumber every key the day Google
 * adds a subset.
 *
 * A rule whose weight, style or src cannot be read is a parse failure and
 * throws. Skipping it would mirror a family missing a face, and the family would
 * still be registered as complete.
 */
export function parseFontFaceCss(css: string): FaceBlock[] {
  const blocks: FaceBlock[] = []
  // Each section is `/* subset */` followed by one @font-face rule.
  const pattern = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi

  for (const match of css.matchAll(pattern)) {
    // Both groups are non-optional in the pattern, so neither can actually be
    // absent; the fallbacks are there because the compiler cannot know that, and
    // an empty rule fails the three reads below with a message worth having.
    const subset = match[1] ?? ''
    const rule = match[2] ?? ''
    const weight = /font-weight:\s*(\d+)/.exec(rule)?.[1]
    const style = /font-style:\s*(normal|italic)/.exec(rule)?.[1]
    const src = /src:\s*url\((\S+?)\)/.exec(rule)?.[1]

    if (weight === undefined || style === undefined || src === undefined) {
      throw new Error(
        `Could not read weight, style and src from a @font-face rule:\n${rule.slice(0, 200)}`
      )
    }

    blocks.push({
      subset,
      weight: Number(weight),
      // eslint-disable-next-line no-restricted-syntax -- the CSS font-style value.
      italic: style === 'italic',
      src,
      rule,
    })
  }

  if (blocks.length === 0) {
    throw new Error('No @font-face rules found. The CSS API reply was not what was expected.')
  }
  return blocks
}

/* ── Fetching ───────────────────────────────────────────────────────────── */

/** Run tasks with a cap on how many are in flight. Order of results preserved. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      // Bounds-checked one line above; the index signature does not know that.
      results[index] = await fn(items[index] as T, index)
    }
  })

  await Promise.all(workers)
  return results
}

async function fetchBytes(url: string, what: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'user-agent': MODERN_UA } })
  if (!response.ok) throw new Error(`${what}: ${response.status} from ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * A TTF starts `\0\1\0\0`, `true` or `ttcf`. An HTML error page does not.
 *
 * Kept from the previous script because the failure it catches is silent:
 * Google answers a request for a weight a family does not have with a 200 and a
 * file for the *nearest* one. Without this, a mirror run stores Cairo 500 under
 * the key for 600 and everything downstream is confidently wrong.
 */
function assertTrueType(bytes: Buffer, what: string): void {
  const tag = bytes.subarray(0, 4).toString('latin1')
  if (tag !== '\u0000\u0001\u0000\u0000' && tag !== 'true' && tag !== 'ttcf') {
    throw new Error(`${what}: not a TrueType file (${bytes.length} bytes, tag ${JSON.stringify(tag)})`)
  }
}

/* ── The run ────────────────────────────────────────────────────────────── */

/**
 * Mirror one family whole, and return the row to write.
 *
 * **Does not write the row.** The caller registers it, so that a route can do so
 * inside the same transaction as the brand kit update and a CLI can do so after
 * printing what it did. What this guarantees is the ordering that matters: every
 * file is in R2 before the registration it returns can be used.
 *
 * Throws on anything unexpected, and a throw means nothing is registered. A
 * re-run is safe — every key is deterministic, so re-uploading is a no-op
 * against the same bytes.
 */
export async function mirrorFamily(
  entry: GoogleFamily,
  deps: MirrorDeps,
  options: MirrorScope = {}
): Promise<MirrorResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const slug = fontSlug(entry.family)

  const all = entry.variants
    .map(parseVariant)
    .filter((face): face is { weight: number; italic: boolean } => face !== null)

  if (all.length === 0) {
    throw new Error(`${entry.family}: no recognisable variants in ${JSON.stringify(entry.variants)}`)
  }

  /**
   * Narrowing to the asked-for weights, **without ever narrowing to nothing.**
   *
   * A kit can bind 500 to a family that ships only 400. Taking the intersection
   * literally would mirror zero faces and register a family with no files, which
   * is worse than the problem being solved — so an empty intersection falls back
   * to the whole family and the save pays for it.
   */
  const wanted = options.weights
  const faces =
    wanted === undefined
      ? all
      : (() => {
          const kept = all.filter((face) => wanted.includes(face.weight))
          return kept.length > 0 ? kept : all
        })()

  const subsetFilter = options.subsets

  const keys: string[] = []
  let bytes = 0

  const record = async (key: string, body: Buffer, type: string) => {
    await deps.put(key, body, type, IMMUTABLE)
    keys.push(key)
    bytes += body.length
  }

  // ── TTF, one per face. What the shaper and the PDF read.
  //
  // Straight from the API's `files` map, which is the same file the CSS API
  // hands an ancient user agent — without the user-agent trick. Google still
  // serves some of these as `http://`.
  await mapWithConcurrency(faces, concurrency, async (face) => {
    const variant = face.italic
      ? face.weight === 400
        // eslint-disable-next-line no-restricted-syntax -- Google names this variant `italic`.
        ? 'italic'
        // eslint-disable-next-line no-restricted-syntax -- and this one `700italic`.
        : `${face.weight}italic`
      : face.weight === 400
        ? 'regular'
        : String(face.weight)

    const url = entry.files[variant]
    if (url === undefined) {
      throw new Error(
        `${entry.family}: variant "${variant}" is listed in \`variants\` but absent from \`files\`.`
      )
    }

    // eslint-disable-next-line no-restricted-syntax -- a log line, not a class name.
    const what = `${entry.family} ${face.weight}${face.italic ? ' italic' : ''}`
    const body = await fetchBytes(url.replace(/^http:/, 'https:'), what)
    assertTrueType(body, what)
    await record(fontFileKey(slug, face.weight, face.italic), body, 'font/ttf')
  })

  // ── woff2, one per face *per script*. What the browser and Fabric read.
  const css = await fetch(cssApiUrl(entry.family, faces), {
    headers: { 'user-agent': MODERN_UA },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${entry.family}: CSS API ${response.status}`)
    return response.text()
  })

  const parsed = parseFontFaceCss(css)

  /**
   * Only the scripts this shop reads in.
   *
   * Rubik carries six — Arabic, Hebrew, both Cyrillics and both Latins — and a
   * Gulf shop draws in three of them. This is where most of the 99 files go:
   * woff2 is split per script, so it is 84 of them, and the format split an
   * earlier draft proposed would have saved 15% while this saves half.
   *
   * An unknown subset name narrows to nothing, so the filter is ignored when it
   * would leave the family undrawable.
   */
  const blocks = (() => {
    if (subsetFilter === undefined) return parsed
    const kept = parsed.filter((block) => subsetFilter.includes(block.subset))
    return kept.length > 0 ? kept : parsed
  })()

  /**
   * Whether this run left anything behind — **measured, not inferred from
   * whether a filter was passed.**
   *
   * The first version asked `subsets === undefined`, so a scoped run that
   * happened to cover the whole family still registered as incomplete. Amiri
   * ships exactly the three scripts the blocking set asks for and both weights
   * the scale binds, so its row came back `complete: false` with a css string
   * byte-identical to the one the completion job would write — a queued job that
   * could only ever be a no-op, and an export needlessly refused until it ran.
   */
  const complete = faces.length === all.length && blocks.length === parsed.length

  const rewritten = await mapWithConcurrency(blocks, concurrency, async (block) => {
    const what = `${entry.family} ${block.weight}${block.italic ? 'i' : ''} ${block.subset}`
    const body = await fetchBytes(block.src, what)
    const key = fontWoff2Key(slug, block.weight, block.subset, block.italic)
    await record(key, body, 'font/woff2')
    // Google's rule verbatim — `unicode-range` included, which is the whole
    // point of going through the CSS API at all — with only the URL swapped.
    return block.rule.replace(block.src, deps.publicUrl(key))
  })

  // ── The licence travels with the files. Not immutable: a licence text is the
  // one thing here we would want to be able to correct in place.
  const licence = await fetchLicence(entry.family)
  await deps.put(
    fontLicenseKey(slug, licence.filename),
    Buffer.from(licence.text, 'utf8'),
    'text/plain; charset=utf-8'
  )
  keys.push(fontLicenseKey(slug, licence.filename))

  // **The row describes what is in R2, never what Google offers.** A partial run
  // registers the weights it actually mirrored, so nothing downstream can bind a
  // weight whose file is missing; the completion job widens both lists when it
  // finishes the family.
  const upright = [...new Set(faces.filter((f) => !f.italic).map((f) => f.weight))].sort((a, b) => a - b)
  const italics = [...new Set(faces.filter((f) => f.italic).map((f) => f.weight))].sort((a, b) => a - b)

  return {
    complete,
    registration: {
      family: entry.family,
      slug,
      version: entry.version,
      subsets: entry.subsets,
      category: entry.category,
      weights: upright,
      italicWeights: italics,
      license: licence.id,
      css: rewritten.join('\n'),
      complete,
    },
    keys,
    bytes,
  }
}
