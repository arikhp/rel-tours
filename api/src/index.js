import { corsHeadersFor } from './cors.js'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORKER ENTRY (REL-6)
 *
 * Routing skeleton for the fare API. `/search` and `/confirm` are stubs here —
 * REL-11..REL-20 wire /search to Travelpayouts, REL-21..REL-24 wire /confirm
 * to SerpApi. Nothing calls an upstream API yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function notImplemented(routeName) {
  return () =>
    json(
      { error: 'not_implemented', message: `${routeName} is not implemented yet` },
      { status: 501 },
    )
}

const ROUTES = {
  '/health': () => json({ status: 'ok', time: new Date().toISOString() }),
  '/search': notImplemented('/search'),
  '/confirm': notImplemented('/confirm'),
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    // A request with no Origin header (curl, wrangler tail, server-to-server) is
    // not a browser request, so it isn't subject to CORS — let it through with
    // no CORS headers attached. A request that *does* carry an Origin but isn't
    // on the allowlist is rejected outright, both for the real request and for
    // its preflight.
    const cors = origin ? corsHeadersFor(origin) : {}
    const originRejected = Boolean(origin) && cors === null

    if (request.method === 'OPTIONS') {
      return originRejected
        ? new Response(null, { status: 403 })
        : new Response(null, { status: 204, headers: cors ?? {} })
    }

    if (originRejected) {
      return json({ error: 'origin_not_allowed' }, { status: 403 })
    }

    const handler = ROUTES[url.pathname]
    if (!handler) {
      return json({ error: 'not_found' }, { status: 404, headers: cors ?? {} })
    }
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, { status: 405, headers: cors ?? {} })
    }

    const response = await handler(request, env, ctx)
    for (const [key, value] of Object.entries(cors ?? {})) {
      response.headers.set(key, value)
    }
    return response
  },
}
