/**
 * Liveness probe for the platform healthcheck. Same contract and same reasoning
 * as `apps/web/app/api/health/route.ts` — it answers "this process is serving
 * HTTP", nothing more.
 *
 * Not covered by the admin IP allowlist on purpose: the probe comes from the
 * platform's network, not from an operator, and it exposes nothing.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
