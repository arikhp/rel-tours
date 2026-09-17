/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEARCH WINDOW → UPSTREAM CALL PLANNER (REL-13)
 *
 * Turns a search window (origin, destination, date range, trip length +
 * flexibility) into a bounded, deterministic list of upstream calls to make.
 *
 * This module is deliberately standalone and knows NOTHING about how a call
 * is actually issued — no HTTP, no Travelpayouts. That's REL-12 (client) and
 * REL-11 (which endpoint to hit). This module only owns the date/scheduling
 * math: which (origin, destination, month, trip-length) tuples need to be
 * asked about to cover a search, plus a mechanism to run an arbitrary async
 * function over that list without overwhelming upstream.
 *
 * CALL DESCRIPTOR CONTRACT
 * ------------------------
 * `planCalls()` returns Call[], where a Call is:
 *   { origin, destination, yearMonth, length, currency }
 *     origin, destination  IATA/metro code, upper-cased (matches criteria.from
 *                          criteria.to, upper-cased so it lines up with the
 *                          cache key format below regardless of input casing)
 *     yearMonth            'YYYY-MM' — one calendar month touched by the
 *                          search window. A future REL-12 client is expected
 *                          to query "all fares for this route in this month"
 *                          per call (the natural granularity for most flight
 *                          search APIs, including Travelpayouts' calendar/
 *                          month-price endpoints) and then filter/bucket the
 *                          response by trip length client-side.
 *     length                desired trip length in nights for this call
 *                          (nights ± flexibility, clamped to >= 1)
 *     currency              ISO currency code. Defaults to 'USD' to match the
 *                          convention already used by the mock in
 *                          src/lib/searchFlights.js (`currency: 'USD'`).
 *
 * This shape carries everything needed to (a) make the future HTTP call
 * (route + month + currency; `length` narrows what the caller asks the
 * response to bucket) and (b) build the REL-15 cache key format
 * `tp:v1:{ORIGIN}:{DEST}:{YYYY-MM}:{length}:{currency}` — see `cacheKeyFor()`
 * below, which is the reference implementation of that format so REL-15 can
 * either reuse it or match it byte-for-byte.
 *
 * ORDERING & DETERMINISM
 * -----------------------
 * Output is ordered by yearMonth ascending, then by length ascending. Same
 * input always produces the identical array (same order, not just same
 * set) — see planner.test.js's determinism test.
 *
 * THE CEILING
 * -----------
 * A naive cross-product of (months touched) x (trip lengths to check) can
 * grow large for a wide window with high flexibility. `MAX_CALLS` is a hard
 * ceiling on how many calls one `planCalls()` invocation will emit. If the
 * cross-product exceeds it, we trim from the edges of the flexibility range
 * — the exact `nights` length is never dropped; the widest ± offsets go
 * first — until the list is back under the ceiling. See `trimPriority()`.
 *
 * CONCURRENCY
 * -----------
 * There's no HTTP here, so nothing actually needs to be "in flight" yet, but
 * the acceptance criteria calls for a concurrency cap on how the planned
 * calls get executed. Rather than a fixed-size `chunk()` helper (which forces
 * whoever executes the plan to also write their own wait-for-batch loop),
 * this module exports `runPlanned(items, fn, { concurrency })`: a small
 * generic bounded-concurrency runner. It runs `fn` over every item, never
 * running more than `concurrency` calls at once, and resolves to results in
 * input order regardless of completion order. A future REL-12/REL-15
 * consumer calls `runPlanned(planCalls(criteria), fetchOneMonth, { concurrency: 4 })`
 * and gets both the plan and the bounded execution from one contract, rather
 * than gluing a chunker to its own promise pool.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Hard ceiling on calls emitted by a single `planCalls()` invocation. */
export const MAX_CALLS = 28

/** Default bound for `runPlanned()` when the caller doesn't specify one. */
export const DEFAULT_CONCURRENCY = 4

/** Matches the currency convention already used by the front-end mock. */
export const DEFAULT_CURRENCY = 'USD'

/** Parse a `YYYY-MM-DD` string into integer parts (no Date/timezone math). */
function parseISODate(value) {
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) {
    throw new Error(`planCalls: invalid date "${value}", expected YYYY-MM-DD`)
  }
  return { y, m, d }
}

/**
 * Every distinct calendar month (`YYYY-MM`) touched by `[earliest, latest]`,
 * inclusive, ascending. A window that starts and ends in the same month
 * returns a single entry; a window crossing a year boundary rolls over
 * correctly since this is done in integer arithmetic, not `Date` objects.
 */
function monthsBetween(earliest, latest) {
  const start = parseISODate(earliest)
  const end = parseISODate(latest)
  if (start.y > end.y || (start.y === end.y && start.m > end.m)) {
    throw new Error('planCalls: `latest` must not be before `earliest`')
  }

  const months = []
  let y = start.y
  let m = start.m
  while (y < end.y || (y === end.y && m <= end.m)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return months
}

/**
 * `nights ± flexibility`, discarding anything below 1 night, ascending.
 * e.g. nights=7, flexibility=2 -> [5, 6, 7, 8, 9]
 *      nights=1, flexibility=3 -> [1, 2, 3, 4]        (0 and negative dropped)
 */
function buildLengths(nights, flexibility) {
  const n = Number(nights)
  if (!Number.isFinite(n)) {
    throw new Error(`planCalls: invalid nights "${nights}"`)
  }
  const flex = Number(flexibility) || 0

  const lengths = []
  for (let offset = -flex; offset <= flex; offset++) {
    const length = n + offset
    if (length >= 1) lengths.push(length)
  }
  return lengths
}

/**
 * The order in which flexibility offsets get dropped when trimming to
 * `MAX_CALLS`: widest magnitude first, offset 0 (the exact requested
 * `nights`) is never included and therefore never dropped. At equal
 * magnitude the longer trip (+offset) is dropped before the shorter one
 * (-offset) — an arbitrary but deterministic tie-break; a later story could
 * bias this toward whichever direction upstream pricing data shows is more
 * popular.
 */
function trimPriority(flexibility) {
  const order = []
  for (let mag = flexibility; mag >= 1; mag--) {
    order.push(mag, -mag)
  }
  return order
}

/**
 * Plan the upstream calls needed to cover a search window.
 *
 * @param {object} criteria
 * @param {string} criteria.from        origin IATA/metro code
 * @param {string} criteria.to          destination IATA/metro code
 * @param {string} criteria.earliest    'YYYY-MM-DD', inclusive window start
 * @param {string} criteria.latest      'YYYY-MM-DD', inclusive window end
 * @param {number} criteria.nights      desired trip length
 * @param {number} criteria.flexibility 0 | 1 | 2 | 3, days of slack
 * @param {string} [criteria.currency]  ISO currency code, defaults to 'USD'
 * @returns {{origin: string, destination: string, yearMonth: string, length: number, currency: string}[]}
 */
export function planCalls(criteria) {
  const { from, to, earliest, latest, nights, flexibility, currency } = criteria ?? {}

  if (!from || !to) {
    throw new Error('planCalls: `from` and `to` are required')
  }
  if (!earliest || !latest) {
    throw new Error('planCalls: `earliest` and `latest` are required')
  }

  const origin = String(from).toUpperCase()
  const destination = String(to).toUpperCase()
  const resolvedCurrency = currency ? String(currency).toUpperCase() : DEFAULT_CURRENCY

  const months = monthsBetween(earliest, latest)
  const lengths = buildLengths(nights, flexibility)
  const n = Number(nights)
  const flex = Number(flexibility) || 0

  // Cross product, tagged with its flexibility offset so trimming (below)
  // can target the widest offsets without recomputing anything.
  let entries = []
  for (const yearMonth of months) {
    for (const length of lengths) {
      entries.push({ origin, destination, yearMonth, length, currency: resolvedCurrency, offset: length - n })
    }
  }

  if (entries.length > MAX_CALLS) {
    for (const offset of trimPriority(flex)) {
      if (entries.length <= MAX_CALLS) break
      entries = entries.filter((entry) => entry.offset !== offset)
    }
  }

  // Deduplicate identical tuples (defensive — the cross-product above can't
  // actually produce duplicates today, but the contract promises dedup, and
  // this protects future callers who might merge multiple planCalls() runs).
  const seen = new Set()
  const calls = []
  for (const entry of entries) {
    const key = `${entry.origin}|${entry.destination}|${entry.yearMonth}|${entry.length}|${entry.currency}`
    if (seen.has(key)) continue
    seen.add(key)
    calls.push({
      origin: entry.origin,
      destination: entry.destination,
      yearMonth: entry.yearMonth,
      length: entry.length,
      currency: entry.currency,
    })
  }
  return calls
}

/** The REL-15 cache key for a single planned call: `tp:v1:{ORIGIN}:{DEST}:{YYYY-MM}:{length}:{currency}`. */
export function cacheKeyFor(call) {
  return `tp:v1:${call.origin}:${call.destination}:${call.yearMonth}:${call.length}:${call.currency}`
}

/**
 * Run `fn` over `items`, never more than `concurrency` in flight at once.
 * Resolves to an array of results in the same order as `items`, regardless
 * of completion order. Used to execute a `planCalls()` plan without
 * overwhelming upstream, but takes an arbitrary array/fn so it's equally
 * usable for tests (see planner.test.js) or any other bounded-fan-out need.
 *
 * @param {any[]} items
 * @param {(item: any, index: number) => Promise<any>} fn
 * @param {{concurrency?: number}} [options]
 */
export async function runPlanned(items, fn, { concurrency = DEFAULT_CONCURRENCY } = {}) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workerCount = Math.max(0, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
