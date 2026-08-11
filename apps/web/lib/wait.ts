/**
 * A wait in words, for a shop owner reading in their second or third language.
 * "2 minutes", not "PT2M" or "120s".
 */
export function formatWait(seconds: number): string {
  if (seconds <= 60) return `${Math.max(1, Math.ceil(seconds))} seconds`

  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`

  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour' : `${hours} hours`
}

/** mm:ss for a live countdown on a button. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}
