/**
 * CSV parsing for the E5-06 import.
 *
 * Hand-written rather than a dependency, and deliberately so: the format is
 * small enough to implement correctly in fifty lines, and every library that
 * also reads XLSX carries a great deal more than a delimited-text parser needs.
 * **XLSX is not supported yet** — see `docs/E5-pending.md`; the shape below is
 * what an XLSX reader would have to produce, so slotting one in later is a new
 * function returning `Sheet`, not a rewrite of anything downstream.
 *
 * Pure, no I/O, no `server-only` — the mapping screen validates in the browser
 * against the same parse the server used.
 *
 * What it handles, because a spreadsheet exported from Excel in the Gulf hits
 * every one of them:
 *
 * - **Quoted fields** containing the delimiter, and `""` as an escaped quote.
 *   "Rice, Basmati" is one field and gets this wrong silently otherwise.
 * - **Newlines inside quotes.** A product description with a line break is one
 *   row, not two, and splitting on `\n` first turns a hundred-row sheet into a
 *   hundred and four with the extras unreadable.
 * - **CRLF**, which is what Excel on Windows writes.
 * - **A UTF-8 BOM**, which Excel also writes, and which otherwise becomes part
 *   of the first header name — so "Item" never matches and the column mapping
 *   screen offers a field whose name opens with an invisible character, which
 *   nobody can explain and nothing can be typed to match.
 * - **Semicolons**, the delimiter Excel uses in locales where the comma is the
 *   decimal separator. Detected, not configured: an owner should not have to
 *   know what their copy of Excel did.
 */

export type Sheet = {
  headers: string[]
  /** One entry per data row, aligned to `headers` by position. */
  rows: string[][]
}

/** The delimiters worth guessing between. Tab covers a pasted selection. */
const DELIMITERS = [',', ';', '\t'] as const

/**
 * Pick the delimiter by counting candidates in the header line only.
 *
 * The header line rather than the whole file because it is the one line
 * guaranteed to have no quoted commas in ordinary data, and because a file
 * whose first line disagrees with the rest is malformed either way. Ties go to
 * the comma — it is the format's name.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/))

  let best = ','
  let bestCount = 0
  for (const candidate of DELIMITERS) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * Split delimited text into rows of fields.
 *
 * A character-at-a-time state machine rather than a regex. The quoting rules
 * are context-dependent — whether a delimiter separates fields depends on
 * whether the scanner is inside quotes — and that is exactly what a regex
 * cannot express without becoming unreadable.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  // The BOM, if present, belongs to the encoding and not to the first header.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  // A field that has been touched at all must be emitted even when empty, so
  // "a,,b" is three fields. This tracks whether the current row has any content
  // to emit, which is what tells a trailing newline from an empty row.
  let started = false

  const endField = () => {
    row.push(field)
    field = ''
    started = false
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (index < input.length) {
    const char = input[index]

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote. Anything
        // else after a quote closes the field.
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && !started) {
      quoted = true
      started = true
      index += 1
      continue
    }

    if (char === delimiter) {
      endField()
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      endRow()
      // CRLF is one line ending, not two.
      index += char === '\r' && input[index + 1] === '\n' ? 2 : 1
      continue
    }

    field += char
    started = true
    index += 1
  }

  // Whatever is in hand when the input runs out is a final row — unless the
  // file simply ended with a newline, which every well-behaved writer emits and
  // which must not become a row of one empty field.
  if (field !== '' || started || row.length > 0) endRow()

  return rows
}

/**
 * Parse a whole file into a header row and its data rows.
 *
 * Rows are **not** padded or truncated to the header width. A ragged row is a
 * fact about the owner's file, and `catalog_import_rows.raw` is specified to
 * hold the row exactly as it was read — the review screen shows them their own
 * row in their own words, which it cannot do if the parser has already tidied
 * it. Reading a field past the end simply yields nothing.
 *
 * Fully blank rows are dropped. Spreadsheets are full of them and none of them
 * is a product.
 */
export function parseSheet(text: string, delimiter = detectDelimiter(text)): Sheet {
  const rows = parseDelimited(text, delimiter).filter((row) =>
    row.some((field) => field.trim() !== '')
  )

  const [headers, ...rest] = rows
  if (!headers) return { headers: [], rows: [] }

  return { headers: headers.map((header) => header.trim()), rows: rest }
}

/**
 * A row as an object keyed by header, for `catalog_import_rows.raw`.
 *
 * Stored keyed rather than positional so that the review screen can render it
 * without also carrying the header list, and so that a header renamed between
 * two imports does not silently shift every value one column over.
 */
export function toRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((header, index) => {
    record[header] = row[index] ?? ''
  })
  return record
}
