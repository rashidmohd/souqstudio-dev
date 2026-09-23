/**
 * A number an owner types as a percent, as the fraction a document stores.
 *
 * **Every spatial value on an element is a fraction of the block's geometric
 * mean** — never pixels — which is what lets one block render at 1080 square
 * for a post and at a third of an A4 column in a booklet and read the same in
 * both. An owner must never see `0.004`, so the controls show a percent and
 * this is the one place the two meet.
 *
 * **`Number('')` is 0 and `Number('abc')` is `NaN`**, and a number input hands
 * over both — an emptied field and a half-typed one. `NaN` survives `Math.min`
 * and `Math.max` unchanged, so without this it reaches the document as a value
 * the schema refuses and the owner learns about a keystroke at save time.
 */
export function readPercent(
  input: string,
  bounds: { min: number; max: number },
  /** What an unreadable value becomes. Defaults to the minimum. */
  fallback = bounds.min
): number {
  const percent = Number(input)
  if (!Number.isFinite(percent)) return fallback / 100
  return Math.min(bounds.max, Math.max(bounds.min, percent)) / 100
}

/** The stored fraction as the percent a field shows. One decimal is enough. */
export const showPercent = (value: number): number => Math.round(value * 1000) / 10
