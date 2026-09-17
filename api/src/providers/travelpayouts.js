/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRAVELPAYOUTS API CLIENT (REL-12)
 *
 * One module that owns every Travelpayouts HTTP call, so auth, currency,
 * timeouts and retries live in a single place instead of being re-implemented
 * wherever the Worker needs a fare. Nothing calls this module yet — REL-19
 * wires it into the Worker's `/search` route. This module knows nothing about
 * the Worker, the planner (REL-13) or the cache (REL-15); it only knows how to
 * talk to Travelpayouts and hand back plain data or a typed error.
 *
 * ENDPOINTS (see REL-11's api/test/fixtures/DECISION.md for the full reasoning)
 * -----------------------------------------------------------------------------
 *   fetchCalendar() -> GET /v1/prices/calendar   primary: one call = one
 *     calendar month of daily cheapest fares for a route. No duration field.
 *   fetchLatest()   -> GET /v2/prices/latest     secondary: used only to
 *     backfill flight duration (REL-17), which calendar never has.
 *
 * AUTH & CURRENCY
 * ----------------
 * Every request carries the token in the `X-Access-Token` header (never as a
 * query param) and an explicit `currency` query param. The currency default
 * matters: Travelpayouts defaults to RUB when `currency` is omitted, and
 * REL-11's own calendar fixtures were collected without it — every
 * `calendar-*.json` fixture in api/test/fixtures shows `"currency": "rub"`
 * even though this codebase prices in USD. Silently treating that RUB
 * response as USD would misprice the whole site, so this module never issues
 * a request without `currency` set, and never trusts a response's own
 * `currency` field for what to label the parsed output — it labels every
 * parsed row with the currency *this module asked for*, which is the only
 * value we can actually vouch for.
 *
 * TYPED ERROR TAXONOMY
 * ----------------------
 * Every failure surfaces as a `TravelpayoutsError` (never a raw `Error`, never
 * an unhandled rejection) with a `kind` the Worker can switch on:
 *
 *   'no_data'        Real answer, just nothing to show: calendar 400 "not
 *                     flightable", or a 200 with an empty data array/object
 *                     (how `latest` reports the same "no data for this
 *                     route" situation — see DECISION.md). Not retried, not
 *                     a bug — show the user "no fares found".
 *   'rate_limited'    HTTP 429. Not retried (retrying a rate limit just makes
 *                     it worse). The Worker should back off / queue.
 *   'upstream_error'  HTTP 5xx (after the one retry below is exhausted), a
 *                     request that timed out, or a network failure. Genuinely
 *                     "something is broken", as opposed to 'no_data'.
 *   'invalid_request' Any other non-2xx (e.g. a 400 that isn't the
 *                     not-flightable shape, or a 404). Indicates a bug in how
 *                     *we* built the request, not upstream flakiness — also
 *                     not retried.
 *   'config_error'    No token configured (`env.TRAVELPAYOUTS_TOKEN` missing/
 *                     empty). Caught before any network call is made.
 *
 * TIMEOUT & RETRY MECHANICS
 * ---------------------------
 * Each attempt is wrapped in an `AbortController` + `setTimeout` (the
 * standard Workers-compatible timeout pattern — Workers don't have
 * `AbortSignal.timeout` reliably across runtimes, so this is spelled out
 * explicitly). `DEFAULT_TIMEOUT_MS` (8s) aborts a single slow upstream call
 * so it can't hang the whole search; a timed-out attempt is treated the same
 * as a network failure.
 *
 * Retry policy: **one** retry, and only for a 5xx response or a network/
 * timeout failure — never for a 4xx. A 4xx (400, 404, 429, ...) is upstream
 * telling us something concrete about *this* request; retrying it burns a
 * call against Travelpayouts' rate limit for an answer that will not change.
 * `fetchWithRetry()` is the single place this policy lives: attempt once,
 * and if (and only if) the failure was a 5xx or a thrown network/timeout
 * error, attempt exactly once more before giving up.
 *
 * TOKEN REDACTION
 * -----------------
 * The token is never put anywhere a `TravelpayoutsError` could carry it: the
 * error only ever stores `kind`/`status`/`code`/a human message built from
 * fixed strings and route info (origin/destination/month), never the request
 * URL, headers, or raw upstream error object. As a second line of defence —
 * in case a lower-level `fetch` implementation ever throws an error whose
 * `.message` happens to echo the request (some HTTP client libraries do
 * this) — `redact()` strips the literal token substring out of any string
 * before it's allowed into a thrown message. See travelpayouts.test.js's
 * "token redaction" suite, which deliberately makes `fetch` throw an error
 * containing the token and asserts it never reaches the thrown error.
 *
 * TESTABILITY: DEPENDENCY-INJECTED `fetch`
 * -------------------------------------------
 * Every exported function takes an `options.fetch` override (defaulting to
 * `globalThis.fetch`, which Node 22/24 and Workers both provide natively).
 * Tests pass a stub instead of touching `globalThis.fetch`, so tests can run
 * fully in parallel without one test's stubbed global leaking into another's
 * — the same reason `cache.js` takes `kv` as a parameter rather than reading
 * a global binding.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CALENDAR_URL = 'https://api.travelpayouts.com/v1/prices/calendar'
export const LATEST_URL = 'https://api.travelpayouts.com/v2/prices/latest'

/** Header carrying the auth token. Never sent as a query param. */
export const TOKEN_HEADER = 'X-Access-Token'

/** `env` binding name — matches the convention in api/.dev.vars.example / wrangler.toml. */
export const TOKEN_ENV_KEY = 'TRAVELPAYOUTS_TOKEN'

/** Per-attempt timeout. One slow upstream call can't hang the whole search. */
export const DEFAULT_TIMEOUT_MS = 8000

/** `latest` row count per request — matches the convention in REL-11's fixtures. */
export const DEFAULT_LATEST_LIMIT = 30

/**
 * Typed error thrown by every function in this module. Never carries the
 * token, the request URL, or raw headers — only enough for the Worker to
 * build a clean user-facing message and decide whether to retry/back off.
 */
export class TravelpayoutsError extends Error {
  /**
   * @param {string} message
   * @param {object} details
   * @param {'no_data'|'rate_limited'|'upstream_error'|'invalid_request'|'config_error'} details.kind
   * @param {number|null} [details.status]  upstream HTTP status, if any
   * @param {string|null} [details.code]    short machine-readable sub-reason
   */
  constructor(message, { kind, status = null, code = null } = {}) {
    super(message)
    this.name = 'TravelpayoutsError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

/** Replaces every occurrence of `token` in `value` — defence-in-depth so the token can never ride along on a thrown error, even via a lower-level library's own error message. */
function redact(value, token) {
  if (typeof value !== 'string' || !token) return value
  return value.split(token).join('[REDACTED]')
}

/** Reads the token from `env`, throwing a `config_error` before any network call if it's missing. Never returns an empty/whitespace-only token. */
function getToken(env) {
  const token = env?.[TOKEN_ENV_KEY]
  if (!token || !String(token).trim()) {
    throw new TravelpayoutsError('Travelpayouts token is not configured', {
      kind: 'config_error',
      code: 'missing_token',
    })
  }
  return String(token)
}

/** True when a calendar 400's body matches the documented "airport not flightable" shape (see DECISION.md). */
function isNotFlightable(body) {
  return typeof body?.error === 'string' && /not[ _]?flightable/i.test(body.error)
}

function buildCalendarUrl({ origin, destination, yearMonth, length, currency }) {
  const params = new URLSearchParams({
    origin: String(origin).toUpperCase(),
    destination: String(destination).toUpperCase(),
    depart_date: yearMonth,
    currency: String(currency).toLowerCase(),
  })
  if (length != null) params.set('length', String(length))
  return `${CALENDAR_URL}?${params.toString()}`
}

function buildLatestUrl({ origin, destination, currency, tripDuration, limit = DEFAULT_LATEST_LIMIT }) {
  const params = new URLSearchParams({
    origin: String(origin).toUpperCase(),
    destination: String(destination).toUpperCase(),
    currency: String(currency).toLowerCase(),
  })
  if (tripDuration != null) params.set('trip_duration', String(tripDuration))
  params.set('limit', String(limit))
  return `${LATEST_URL}?${params.toString()}`
}

/**
 * One HTTP attempt with a hard timeout. Resolves to `{ status, body }` for
 * any response that came back (including 4xx/5xx — those are handled by the
 * caller, not here). Throws `{ code: 'timeout' | 'network_error', message }`
 * (a plain object, not yet a `TravelpayoutsError`) for an aborted or failed
 * request — `fetchWithRetry()` decides whether that's worth retrying.
 */
async function attemptFetch(url, token, timeoutMs, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      headers: { [TOKEN_HEADER]: token, Accept: 'application/json' },
      signal: controller.signal,
    })
    let body = null
    try {
      body = await res.json()
    } catch {
      body = null // non-JSON/empty body — status-based handling still applies
    }
    return { status: res.status, body }
  } catch (err) {
    const redactedMessage = redact(err?.message ?? String(err), token)
    if (err?.name === 'AbortError') {
      throw { code: 'timeout', message: redactedMessage || 'request timed out' }
    }
    throw { code: 'network_error', message: redactedMessage || 'network error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Issues the request, retrying exactly once on a 5xx status or a thrown
 * network/timeout failure. Never retries a 4xx. Returns `{ status, body }`
 * on any response (even a final 5xx after the retry is exhausted); throws a
 * `TravelpayoutsError` (`kind: 'upstream_error'`) only once both attempts
 * have failed outright (timeout/network — no response at all).
 */
async function fetchWithRetry(url, token, timeoutMs, fetchImpl) {
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await attemptFetch(url, token, timeoutMs, fetchImpl)
      if (result.status >= 500 && attempt < maxAttempts) continue // retry once on 5xx
      return result
    } catch (failure) {
      if (attempt < maxAttempts) continue // retry once on network/timeout
      throw new TravelpayoutsError(`Travelpayouts request failed: ${failure.message}`, {
        kind: 'upstream_error',
        code: failure.code,
      })
    }
  }
  /* c8 ignore next */
  throw new TravelpayoutsError('Travelpayouts request failed', { kind: 'upstream_error' })
}

/** Maps a non-2xx `{ status, body }` to the matching `TravelpayoutsError`, or returns `null` for a 2xx (nothing to map). `routeLabel` is fixed strings only (origin/destination/month) — never request/header data. */
function errorForStatus(result, routeLabel) {
  const { status, body } = result
  if (status >= 200 && status < 300) return null

  if (status === 429) {
    return new TravelpayoutsError(`Travelpayouts rate limit exceeded for ${routeLabel}`, {
      kind: 'rate_limited',
      status,
      code: 'rate_limited',
    })
  }
  if (status >= 500) {
    return new TravelpayoutsError(`Travelpayouts upstream error (status ${status}) for ${routeLabel}`, {
      kind: 'upstream_error',
      status,
      code: 'http_5xx',
    })
  }
  if (status === 400 && isNotFlightable(body)) {
    return new TravelpayoutsError(`No data for ${routeLabel}: airport not flightable`, {
      kind: 'no_data',
      status,
      code: 'not_flightable',
    })
  }
  return new TravelpayoutsError(`Travelpayouts request rejected (status ${status}) for ${routeLabel}`, {
    kind: 'invalid_request',
    status,
    code: 'http_4xx',
  })
}

/**
 * Normalizes a `/v1/prices/calendar` success body into a plain array, sorted
 * by date. Attaches `currency` from the *requested* currency (see the
 * module-level doc comment on why the response's own `currency` field is
 * never trusted). Throws `no_data` when `data` is missing/empty — a 200 with
 * nothing in it is the same "no data for this route" situation as a 400
 * not-flightable, just a different shape (see DECISION.md).
 */
function parseCalendarBody(body, currency, routeLabel) {
  const data = body?.data
  const dates = data && typeof data === 'object' ? Object.keys(data) : []
  if (dates.length === 0) {
    throw new TravelpayoutsError(`No data for ${routeLabel}: empty calendar response`, {
      kind: 'no_data',
      code: 'empty_response',
    })
  }

  return dates
    .sort()
    .map((date) => {
      const row = data[date]
      return {
        date,
        price: row.price,
        currency,
        airline: row.airline ?? null,
        flightNumber: row.flight_number ?? null,
        departureAt: row.departure_at ?? null,
        returnAt: row.return_at ?? null,
        transfers: row.transfers ?? null,
      }
    })
}

/**
 * Normalizes a `/v2/prices/latest` success body into a plain array. Per
 * DECISION.md: rows with `gate: ""` are synthetic/aggregated and report
 * `duration: 0, distance: 0` — those are treated as missing (`null`), not a
 * real zero-minute flight. Throws `no_data` on an empty `data` array (the
 * `latest` endpoint's way of saying "nothing for this route", vs. calendar's
 * 400 — see the module doc comment).
 */
function parseLatestBody(body, currency, routeLabel) {
  const rows = Array.isArray(body?.data) ? body.data : []
  if (rows.length === 0) {
    throw new TravelpayoutsError(`No data for ${routeLabel}: empty latest response`, {
      kind: 'no_data',
      code: 'empty_response',
    })
  }

  return rows.map((row) => {
    const hasRealGate = Boolean(row.gate)
    return {
      departDate: row.depart_date ?? null,
      returnDate: row.return_date ?? null,
      price: row.value,
      currency,
      gate: row.gate ?? null,
      transfers: row.number_of_changes ?? null,
      durationMinutes: hasRealGate ? row.duration ?? null : null,
      distanceKm: hasRealGate ? row.distance ?? null : null,
      foundAt: row.found_at ?? null,
    }
  })
}

/**
 * Fetch one calendar month of daily cheapest fares for a route.
 *
 * @param {object} call
 * @param {string} call.origin        IATA/metro code
 * @param {string} call.destination   IATA/metro code
 * @param {string} call.yearMonth     'YYYY-MM'
 * @param {number} [call.length]      optional trip length filter (nights)
 * @param {string} call.currency      ISO currency code — required, never defaulted
 * @param {object} env                Worker env (must carry TRAVELPAYOUTS_TOKEN)
 * @param {{fetch?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Promise<Array<{date: string, price: number, currency: string, airline: string|null, flightNumber: number|null, departureAt: string|null, returnAt: string|null, transfers: number|null}>>}
 * @throws {TravelpayoutsError}
 */
export async function fetchCalendar(call, env, options = {}) {
  const { origin, destination, yearMonth, length, currency } = call ?? {}
  if (!origin || !destination || !yearMonth || !currency) {
    throw new TravelpayoutsError(
      'fetchCalendar: `origin`, `destination`, `yearMonth` and `currency` are required',
      { kind: 'invalid_request', code: 'missing_params' },
    )
  }

  const token = getToken(env)
  const fetchImpl = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const routeLabel = `${origin}->${destination} (${yearMonth})`

  const url = buildCalendarUrl({ origin, destination, yearMonth, length, currency })
  const result = await fetchWithRetry(url, token, timeoutMs, fetchImpl)

  const statusError = errorForStatus(result, routeLabel)
  if (statusError) throw statusError

  return parseCalendarBody(result.body, currency, routeLabel)
}

/**
 * Fetch recently-found fares for a route (used to backfill flight duration —
 * calendar never has it; see DECISION.md).
 *
 * @param {object} call
 * @param {string} call.origin
 * @param {string} call.destination
 * @param {string} call.currency       ISO currency code — required, never defaulted
 * @param {number} [call.tripDuration] optional trip length filter (nights)
 * @param {number} [call.limit]        row cap, defaults to DEFAULT_LATEST_LIMIT
 * @param {object} env
 * @param {{fetch?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Promise<Array<{departDate: string, returnDate: string, price: number, currency: string, gate: string|null, transfers: number|null, durationMinutes: number|null, distanceKm: number|null, foundAt: string|null}>>}
 * @throws {TravelpayoutsError}
 */
export async function fetchLatest(call, env, options = {}) {
  const { origin, destination, currency, tripDuration, limit } = call ?? {}
  if (!origin || !destination || !currency) {
    throw new TravelpayoutsError('fetchLatest: `origin`, `destination` and `currency` are required', {
      kind: 'invalid_request',
      code: 'missing_params',
    })
  }

  const token = getToken(env)
  const fetchImpl = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const routeLabel = `${origin}->${destination}`

  const url = buildLatestUrl({ origin, destination, currency, tripDuration, limit })
  const result = await fetchWithRetry(url, token, timeoutMs, fetchImpl)

  const statusError = errorForStatus(result, routeLabel)
  if (statusError) throw statusError

  return parseLatestBody(result.body, currency, routeLabel)
}
