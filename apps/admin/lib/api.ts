import { NextResponse } from 'next/server'
import type { ApiResult } from '@souqstudio/types'

/**
 * The two response shapes, and nothing else — including for errors.
 * Same contract as apps/web/lib/api.ts, because a client written against one
 * should not have to learn the other.
 * See souqstudio-technical → references/api-conventions.md.
 */

/**
 * `headers` is spread rather than passed as a possibly-undefined property:
 * exactOptionalPropertyTypes rejects `{ headers: undefined }` on ResponseInit.
 */
function init(status: number, headers?: Record<string, string>): ResponseInit {
  return headers ? { status, headers } : { status }
}

export function ok<T>(data: T, status = 200, headers?: Record<string, string>) {
  return NextResponse.json<ApiResult<T>>({ data, error: null }, init(status, headers))
}

/**
 * `code` is a stable string the client branches on. `message` is written to be
 * read: what happened, then what to do, in one sentence.
 *
 * The audience here is a colleague rather than a shop owner, so a message may
 * name a table, a role or an environment variable. It still never carries a raw
 * exception or a stack trace.
 */
export function fail(
  code: string,
  message: string,
  status = 400,
  headers?: Record<string, string>
) {
  return NextResponse.json<ApiResult<never>>(
    { data: null, error: { code, message } },
    init(status, headers)
  )
}
