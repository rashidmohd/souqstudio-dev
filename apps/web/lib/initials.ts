/**
 * Initials for the account avatar.
 *
 * `users.name` is nullable — an invited person has an account before they have
 * given a name — so the email is the fallback and there is always something to
 * draw. Never more than two characters: the avatar is 28px and a third letter
 * would have to come off the type scale to fit.
 *
 * Code points, not `charAt`. The product ships in Arabic and the first letter of
 * a name is frequently outside the BMP once accents and ligatures are involved;
 * `charAt` would slice a surrogate pair in half and render a replacement glyph.
 */
export function initials(name: string | null, email: string): string {
  const fromName = nameInitials(name ?? '')
  if (fromName) return fromName

  // The local part only. Initials taken from a domain would be identical for
  // everyone at the same company.
  const local = email.split('@')[0] ?? ''
  return firstCodePoint(local).toUpperCase() || '?'
}

/**
 * The name half on its own. A shop has a name and no email, so the switcher
 * calls this directly rather than passing a second copy of the name as a
 * fallback it can never need.
 */
export function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''

  const first = firstCodePoint(words[0] as string)
  // First and last, not first and second: "Ahmed bin Salem" is AS, and a middle
  // name should not displace the family name.
  const last = words.length > 1 ? firstCodePoint(words[words.length - 1] as string) : ''
  return (first + last).toUpperCase()
}

function firstCodePoint(value: string): string {
  return Array.from(value)[0] ?? ''
}
