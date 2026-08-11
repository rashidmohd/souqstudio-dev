/**
 * Liveness probe for the platform healthcheck. Railway polls this after every
 * deploy and holds the old container until it answers 200.
 *
 * Deliberately outside `/api/v1` and deliberately not using the `ok()` envelope:
 * this is infrastructure, not product API surface, and nothing should ever build
 * a client against it. It is unauthenticated because a probe has no session, and
 * safe to be so because it reveals nothing — no database call, no env read.
 *
 * It answers "this process is serving HTTP", not "the system is healthy". A
 * database or Redis check here would fail the deploy for an outage the container
 * cannot fix by restarting, which is the wrong response to that failure.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
