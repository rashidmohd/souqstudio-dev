/**
 * The IP allowlist. E13 — "IP allowlist recommended for production".
 *
 * **No `server-only`, no `@/lib/env`, no Prisma.** This module runs inside
 * `middleware.ts`, which Next 14 pins to the Edge runtime with no opt-out.
 * Importing anything Node-only from here fails the build. It reads its input as
 * plain strings and the middleware passes `process.env` in — the one place in
 * this app that touches `process.env` directly, because the validated `env`
 * module cannot be loaded on the Edge.
 *
 * Pure, so it is testable without a request. See ip-allowlist.test.ts.
 */

/**
 * Parse the comma-separated variable. Entries may be a bare address or a CIDR
 * block.
 */
export function parseAllowlist(raw: string | undefined): string[] {
  if (raw === undefined) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * The client address, from the proxy headers Railway sets.
 *
 * `x-forwarded-for` is a list appended to by each hop, and **the first entry is
 * the one to read**: later entries are the proxies, and the client can write
 * anything it likes into the header before it arrives. That makes this
 * trustworthy only behind a proxy that overwrites it, which is the deployment
 * this app has. It is not a control that would survive being exposed directly.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]?.trim()
    if (first !== undefined && first !== '') return normalize(first)
  }
  const real = headers.get('x-real-ip')
  if (real !== null && real !== '') return normalize(real.trim())
  return null
}

/**
 * Reduce an address to the form an allowlist entry is written in.
 *
 * Three shapes arrive and all three have bitten:
 *
 * - **IPv4-mapped IPv6** (`::ffff:127.0.0.1`) is the same address as its IPv4
 *   form, and a Node server on a dual-stack socket reports localhost that way.
 * - **A trailing port** (`203.0.113.9:54321`). Some proxies append the client's
 *   source port, and an address carrying one matches no entry ever written by
 *   hand — which, behind a flat 404, looks exactly like a correct refusal.
 *   Stripped only when what precedes the colon is a complete IPv4 address, so
 *   that `::1` is never mistaken for a host and a port.
 * - **A bracketed IPv6 with a port** (`[2a09::1]:443`), which is how a host and
 *   port are disambiguated when the host itself contains colons.
 */
function normalize(ip: string): string {
  const trimmed = ip.trim()

  // [2a09::1]:443 or [2a09::1]
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed)
  if (bracketed?.[1] !== undefined) return normalize(bracketed[1])

  // 203.0.113.9:54321 — only when the left side is a whole IPv4 address.
  const ported = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(trimmed)
  if (ported?.[1] !== undefined) return ported[1]

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)
  return mapped?.[1] ?? trimmed.toLowerCase()
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/**
 * IPv4 CIDR only. IPv6 entries are matched literally.
 *
 * A half-correct IPv6 range check is worse than none: it would silently admit
 * addresses nobody intended while reading as though ranges were supported. An
 * IPv6 deployment that needs ranges should list the addresses, or this should
 * grow a real implementation with tests.
 */
function matchesCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split('/')
  if (network === undefined || bitsRaw === undefined) return false

  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false

  const ipInt = ipv4ToInt(ip)
  const netInt = ipv4ToInt(network)
  if (ipInt === null || netInt === null) return false

  if (bits === 0) return true
  // `>>>` because a 32-bit shift on a signed int turns the top bit negative.
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) >>> 0 === (netInt & mask) >>> 0
}

/**
 * Is this address allowed?
 *
 * **An empty allowlist allows everything**, which is correct in development and
 * is the one thing a production deployment must not leave that way. The login
 * screen says so out loud when the list is empty, rather than leaving it to a
 * runbook: a security control that is off and silent is a control nobody knows
 * is off.
 *
 * A request with no resolvable address is refused whenever a list is set. If the
 * allowlist is on, "I could not tell where this came from" is a no.
 */
export function isAllowed(ip: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true
  if (ip === null) return false


  const candidate = normalize(ip)
  return allowlist.some((entry) =>
    entry.includes('/') ? matchesCidr(candidate, entry) : normalize(entry) === candidate
  )
}
