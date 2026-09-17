import { corsHeadersFor } from './cors.js'
import { DEFAULT_CONCURRENCY, planCalls, runPlanned } from './planner.js'
import { resolveAirportPairs } from './metros.js'
import { getCached, setCached } from './cache.js'
import { TravelpayoutsError, fetchCalendar, fetchLatest } from './providers/travelpayouts.js'
import { MAX_OFFERS, normalizeOffers } from './normalize.js'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORKER ENTRY (REL-6, /search wired in REL-19)
 *
 * Routing skeleton for the fare API. `/confirm` is still a stub — REL-21..
 * REL-24 wire it to SerpApi. `/search` composes every module the rest of
 * Epic 2 built: REL-18's metro fan-out, REL-13's call planner, REL-15's
 * cache, REL-12's Travelpayouts client, and REL-14's normalizer. This module
 * itself owns none of that logic — it only sequences the calls and maps
 * failures to HTTP responses.
 *
 * QUERY PARAMS -> criteria
 * -------------------------
 * `from`, `to`, `earliest`, `latest`, `nights` are required; a request missing
 * any of them (or with an unparsable `nights`/date) gets a clean 400, never an
 * unhandled exception. `flexibility` (default 0), `passengers` (default 1) and
 * `cabin` are optional. `cabin` is accepted and threaded through the response
 * shape's absence of complaint, but genuinely unused: neither Travelpayouts
 * endpoint this codebase calls (calendar, latest) filters by cabin class, so
 * there is nothing to pass it to upstream. This is a known gap, not a silent
 * invention of cabin support — flagged in the REL-19 PR body.
 *
 * `distanceKm`: OPTION (a) FROM THE TICKET — CALLER SUPPLIES IT
 * -------------------------------------------------------------------
 * api/ has no airport coordinate table (see duration.js's and metros.js's
 * packaging notes — every module in this epic that needed coordinates chose
 * not to duplicate src/data/airports.js's ~130-row table). The front end
 * already resolves the route and already imports `distanceKm()` from
 * src/data/airports.js to feed the mock, so `fareSource.js` computes it
 * client-side and passes it as a query param here. A missing/invalid
 * `distanceKm` is NOT a 400 — it's treated as absent, and `normalizeOffers()`
 * (via duration.js's `estimateDuration`) degrades to a 0-based estimate
 * rather than failing the whole search over an optional, best-effort field.
 *
 * WHAT ONE SEARCH ACTUALLY DOES
 * -------------------------------
 * 1. `resolveAirportPairs(from, to)` (REL-18) turns the request into 1-4
 *    concrete {origin, destination} airport pairs (more only for a metro on
 *    one or both sides, capped at 2 airports per side).
 * 2. Per pair, `planCalls()` (REL-13) builds the bounded list of
 *    {origin, destination, yearMonth, length, currency} calendar calls, run
 *    through `runPlanned()` with a cache-then-fetch step per call
 *    (REL-15 in front of REL-12's `fetchCalendar()`), plus exactly one
 *    `fetchLatest()` per pair (route-level, not month-level — see
 *    travelpayouts.js's doc comment on why `fetchLatest` takes no
 *    `yearMonth`), also cached.
 * 3. Each pair's rows are fed through `normalizeOffers()` (REL-14).
 * 4. Offers from every pair are merged, re-sorted cheapest-first, and
 *    re-capped at `MAX_OFFERS` — a metro search fanning out to 4 pairs must
 *    not return up to 4x the offers a plain search would.
 *
 * PER-CALL `no_data` IS NOT A SEARCH FAILURE
 * ---------------------------------------------
 * A `no_data` TravelpayoutsError from one calendar call (an unflightable
 * month) or from the pair's `fetchLatest()` call (no recent fares) is caught
 * at the point of that call and treated as "this call found nothing" (empty
 * rows), not a thrown error — the same "empty is normal" philosophy
 * normalize.js already documents. If every call for every pair comes back
 * empty, the merged result is naturally `[]`, which serializes as a normal
 * 200 response — matching the acceptance criteria's "no_data returns []
 * not an error" without needing special-case top-level handling. The
 * `no_data` branch in `errorResponseFor()` below is defensive (kept in case
 * some future caller lets one through unhandled) rather than the primary
 * path.
 *
 * ANY OTHER TravelpayoutsError FAILS THE WHOLE SEARCH
 * ---------------------------------------------------------
 * `rate_limited`/`upstream_error`/`invalid_request`/`config_error` from any
 * single call is NOT caught per-call — it propagates up through
 * `Promise.all`/`runPlanned` to `handleSearch`'s top-level try/catch, which
 * fails the entire search (not just that one pair/month). This is a
 * deliberate simplification: the ticket doesn't specify partial-failure
 * semantics for a multi-pair metro search, and "one broken upstream call
 * poisons this whole response" is the easiest-to-reason-about behavior open
 * to a future ticket to refine (e.g. best-effort partial results) if it
 * turns out to matter in practice.
 *
 * ERROR -> HTTP STATUS MAPPING
 * -------------------------------
 *   no_data                    200, body `[]`            (defensive; see above)
 *   rate_limited                503, JSON error body       upstream is throttling us
 *   upstream_error               503, JSON error body       upstream 5xx/timeout/network
 *   invalid_request               500, JSON error body       our request was malformed — our bug
 *   config_error                  500, JSON error body       missing/bad token — our misconfiguration
 *   anything else (non-Travelpayouts)  500, JSON error body  unexpected — never an unhandled exception
 * No response body ever includes the upstream token (TravelpayoutsError never
 * carries it — see travelpayouts.js's TOKEN REDACTION section).
 *
 * KV CACHE: PASSED THROUGH, NEVER SPECIAL-CASED
 * ---------------------------------------------------
 * `env.FARE_CACHE` is passed straight to `getCached()`/`setCached()`. Both
 * already no-op safely (miss / skipped-write) when `kv` is falsy — see
 * cache.js's FAILURE MODES section — so a deploy without the KV binding still
 * serves live, just uncached, results.
 *
 * INJECTABLE `fetch` FOR TESTS
 * --------------------------------
 * `fetchCalendar`/`fetchLatest` already take `options.fetch`. Rather than
 * stub `globalThis.fetch` (which would leak across parallel tests) or change
 * the fixed `worker.fetch(request, env, ctx)` Workers contract, this module
 * reads an optional `env.fetch` override and falls back to `globalThis.fetch`
 * — the same "accept it as a parameter, don't reach for a global" DI pattern
 * cache.js (`kv`) and travelpayouts.js (`options.fetch`) already use. `env`
 * in production never has a `fetch` property, so this is inert there.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SEARCH_CURRENCY = 'USD'
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

/** Parses and validates `/search`'s query params into a criteria object, or returns a list of problems. */
function parseSearchParams(url) {
  const params = url.searchParams
  const problems = []

  const from = params.get('from')
  const to = params.get('to')
  const earliest = params.get('earliest')
  const latest = params.get('latest')
  const nightsRaw = params.get('nights')

  if (!from) problems.push('`from` is required')
  if (!to) problems.push('`to` is required')
  if (!earliest || !ISO_DATE_RE.test(earliest)) problems.push('`earliest` is required and must be YYYY-MM-DD')
  if (!latest || !ISO_DATE_RE.test(latest)) problems.push('`latest` is required and must be YYYY-MM-DD')
  if (earliest && latest && ISO_DATE_RE.test(earliest) && ISO_DATE_RE.test(latest) && earliest > latest) {
    problems.push('`latest` must not be before `earliest`')
  }

  const nights = Number(nightsRaw)
  if (!nightsRaw || !Number.isFinite(nights) || nights < 1) {
    problems.push('`nights` is required and must be a positive number')
  }

  const flexibilityRaw = params.get('flexibility')
  const flexibility = flexibilityRaw != null ? Number(flexibilityRaw) : 0
  if (flexibilityRaw != null && !Number.isFinite(flexibility)) {
    problems.push('`flexibility` must be a number')
  }

  const passengersRaw = params.get('passengers')
  const passengers = passengersRaw != null ? Number(passengersRaw) : 1
  if (passengersRaw != null && (!Number.isFinite(passengers) || passengers < 1)) {
    problems.push('`passengers` must be a positive number')
  }

  // Accepted, never validated as strictly required — see module doc comment.
  const cabin = params.get('cabin') || undefined

  // Best-effort only: an absent/invalid distanceKm degrades duration estimates,
  // it never fails the request (see module doc comment).
  const distanceKmRaw = params.get('distanceKm')
  const distanceKmParsed = distanceKmRaw != null ? Number(distanceKmRaw) : undefined
  const distanceKm = Number.isFinite(distanceKmParsed) && distanceKmParsed > 0 ? distanceKmParsed : undefined

  if (problems.length > 0) return { problems }

  return {
    criteria: { from, to, earliest, latest, nights, flexibility, passengers, cabin, distanceKm },
  }
}

/** Fetches (cache-then-live) one pair's `latest` rows — once per pair, never once per planned call. */
async function fetchLatestForPair(pair, env, kv, fetchImpl) {
  const cacheKey = `tp:v1:latest:${pair.origin}:${pair.destination}:${SEARCH_CURRENCY}`

  const cached = await getCached(kv, cacheKey)
  if (cached) return { rows: cached, live: false }

  let rows
  try {
    rows = await fetchLatest(
      { origin: pair.origin, destination: pair.destination, currency: SEARCH_CURRENCY },
      env,
      { fetch: fetchImpl },
    )
  } catch (err) {
    if (err instanceof TravelpayoutsError && err.kind === 'no_data') {
      rows = []
    } else {
      throw err
    }
  }

  await setCached(kv, cacheKey, rows)
  return { rows, live: true }
}

/** Runs the planner's bounded call list for one pair, cache-then-live per call. */
async function fetchCalendarForPair(pair, criteria, env, kv, fetchImpl) {
  const calls = planCalls({
    from: pair.origin,
    to: pair.destination,
    earliest: criteria.earliest,
    latest: criteria.latest,
    nights: criteria.nights,
    flexibility: criteria.flexibility,
    currency: SEARCH_CURRENCY,
  })

  let live = false
  const rowSets = await runPlanned(
    calls,
    async (call) => {
      const cached = await getCached(kv, call)
      if (cached) return cached

      live = true
      let rows
      try {
        rows = await fetchCalendar(call, env, { fetch: fetchImpl })
      } catch (err) {
        if (err instanceof TravelpayoutsError && err.kind === 'no_data') {
          rows = []
        } else {
          throw err
        }
      }
      await setCached(kv, call, rows)
      return rows
    },
    { concurrency: DEFAULT_CONCURRENCY },
  )

  return { rows: rowSets.flat(), live }
}

/** Searches one concrete airport pair end-to-end: plan -> cache/fetch -> normalize. */
async function searchOnePair(pair, criteria, env, kv, fetchImpl) {
  const [calendarResult, latestResult] = await Promise.all([
    fetchCalendarForPair(pair, criteria, env, kv, fetchImpl),
    fetchLatestForPair(pair, env, kv, fetchImpl),
  ])

  return normalizeOffers({
    calendar: calendarResult.rows,
    latestRows: latestResult.rows,
    origin: pair.origin,
    destination: pair.destination,
    earliest: criteria.earliest,
    latest: criteria.latest,
    nights: criteria.nights,
    flexibility: criteria.flexibility,
    passengers: criteria.passengers,
    distanceKm: criteria.distanceKm,
    // A pair counts as 'live' if any of its calls actually hit upstream; a
    // cache-only pair (every call was a hit) is 'cached'. See module doc
    // comment — this is a best-effort per-batch signal, not per-row.
    priceSource: calendarResult.live || latestResult.live ? 'live' : 'cached',
    collectedAt: new Date().toISOString(),
  })
}

/** Maps a thrown error to a clean JSON error Response. Never leaks the upstream token. */
function errorResponseFor(err) {
  if (err instanceof TravelpayoutsError) {
    switch (err.kind) {
      case 'no_data':
        // Defensive — see module doc comment; per-call no_data is normally
        // absorbed earlier and never reaches here.
        return json([], { status: 200 })
      case 'rate_limited':
      case 'upstream_error':
        return json(
          { error: err.kind, message: 'The fare provider is temporarily unavailable. Please try again shortly.' },
          { status: 503 },
        )
      case 'invalid_request':
      case 'config_error':
      default:
        return json(
          { error: err.kind, message: 'The fare search could not be completed due to a server-side problem.' },
          { status: 500 },
        )
    }
  }

  return json({ error: 'internal_error', message: 'Something went wrong while searching for fares.' }, { status: 500 })
}

async function handleSearch(request, env) {
  const url = new URL(request.url)
  const { criteria, problems } = parseSearchParams(url)
  if (problems) {
    return json({ error: 'invalid_request', message: problems.join('; ') }, { status: 400 })
  }

  const kv = env?.FARE_CACHE
  const fetchImpl = env?.fetch ?? globalThis.fetch

  try {
    const pairs = resolveAirportPairs(criteria.from, criteria.to)
    const perPair = await Promise.all(
      pairs.map((pair) => searchOnePair(pair, criteria, env, kv, fetchImpl)),
    )

    const merged = perPair
      .flat()
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_OFFERS)

    return json(merged, { status: 200 })
  } catch (err) {
    return errorResponseFor(err)
  }
}

const ROUTES = {
  '/health': () => json({ status: 'ok', time: new Date().toISOString() }),
  '/search': handleSearch,
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
