import { realDurationFrom, resolveDuration } from './duration.js'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NORMALIZING UPSTREAM RESPONSES INTO THE `Offer` CONTRACT (REL-14)
 *
 * The single seam between "whatever shape Travelpayouts happens to hand
 * back" and the `Offer[]` shape the front end already renders (documented at
 * the top of src/lib/searchFlights.js). Nothing calls this module yet —
 * REL-19 is what will call `fetchCalendar()`/`fetchLatest()` (REL-12) and
 * feed their output through `normalizeOffers()` here. This module knows
 * nothing about HTTP, the cache (REL-15), or the call planner (REL-13); it
 * only knows how to turn two arrays of already-parsed provider rows into
 * offers, the same "do one thing, know nothing about its neighbours" shape
 * as planner.js/cache.js/duration.js.
 *
 * THE JOIN PROBLEM: calendar AND latest DON'T SHARE A KEY
 * -----------------------------------------------------------
 * `calendar` (REL-12's `fetchCalendar()`) is the primary source: one row per
 * calendar day, with price + date + airline + transfers, but no duration.
 * `latest` (REL-12's `fetchLatest()`) is "recently found fares for this
 * route" — not tied to any specific calendar day, fetched once per route
 * rather than per date. Its own `departDate`/`returnDate` may or may not
 * line up with a given calendar row's dates.
 *
 * This module builds offers FROM `calendar` (one offer candidate per
 * calendar row) and only ever uses `latest` as a duration backfill,
 * matched by an exact `departDate`+`returnDate` string match (the only
 * natural join key — see DECISION.md and REL-13's planner doc comment: a
 * `latest` row's `departDate`/`returnDate` and a `calendar` row's
 * `date`/`returnAt` are the same route's fields once both are normalized to
 * plain `YYYY-MM-DD` strings). Concretely, per calendar row:
 *   1. look up a `latest` row with the same departDate+returnDate (route is
 *      implicit — normalizeOffers() is called once per origin/destination
 *      pair, same as fetchCalendar()/fetchLatest() are);
 *   2. if found, hand it to `resolveDuration()` — a real, trustworthy
 *      duration wins;
 *   3. if not found (the common case: `latest` is a much smaller, price-
 *      ranked sample, not a full calendar month), `resolveDuration()` falls
 *      back to the great-circle estimate, using `stops` from the calendar
 *      row's OWN `transfers` field — calendar does carry that, so even a
 *      duration-estimated, calendar-only offer isn't guessing at stop count.
 * When several `latest` rows collide on the same key (possible — `latest`
 * can return more than one fare for the same date pair), the one with a
 * trustworthy real duration (`realDurationFrom(row) != null`) is preferred
 * over one whose `gate` is `""`/duration is unusable, so a synthetic row
 * never shadows a real one just by appearing first.
 * `latest` rows are NEVER turned into offers on their own — they aren't
 * bound to the requested window/nights the way a calendar row is (their
 * dates are whatever Travelpayouts happened to have cached), so promoting
 * one to a standalone offer would risk showing a fare outside what the user
 * actually asked for. This is a deliberate scope choice: if a real fare only
 * shows up in `latest` and never in `calendar`, it doesn't appear here.
 *
 * `priceSource`: A CALLER INPUT, NOT SOMETHING THIS MODULE DECIDES
 * -----------------------------------------------------------------
 * `'cached' | 'live'` records whether the calendar/latest data behind this
 * batch of offers came from a fresh upstream fetch or a REL-15 KV hit — a
 * later story (REL-5) needs that to show "prices may be a few hours old".
 * This module has no way to know that on its own (a KV hit and a live fetch
 * parse into the exact same row shape), so it's accepted as a single input
 * applied to every offer in the batch, exactly like `distanceKm` below — the
 * caller (REL-19, or REL-15's cache wrapper) is the one that knows which
 * path served the data.
 *
 * `collectedAt`: WHAT "WHEN WAS THIS FARE SEEN" ACTUALLY MEANS PER SOURCE
 * ---------------------------------------------------------------------------
 * REL-11 found `calendar`'s `expires_at` is a flat, response-level cache TTL
 * (same value on every row, ~1h after the request) — NOT a per-row
 * collection timestamp, so it's never used here as one (see DECISION.md).
 * `calendar` rows simply don't carry a real "when was this fare found"
 * value. `latest` rows do, in `found_at`, which varies per row.
 *
 * So, per offer:
 *   - a calendar row matched to a `latest` row uses that `latest` row's
 *     `foundAt` verbatim as `collectedAt` — the closest real "when was this
 *     price actually seen" this module has for that offer. `found_at` values
 *     come back without an explicit UTC offset (e.g. "2026-09-17T06:40:50");
 *     this module passes them through as-is rather than guessing a timezone
 *     another module downstream would then have to un-guess.
 *   - a calendar row with no matching `latest` row (the common case) falls
 *     back to the caller-supplied `collectedAt` input — the moment the
 *     calendar fetch that produced this batch was made. That's a coarser
 *     signal (one timestamp for the whole batch, not per-row), but it's
 *     honest: it's the only "when" this module actually has for a
 *     calendar-only row. If the caller omits it, this module defaults to
 *     "now" purely so the field is never `undefined`; a real caller (REL-19)
 *     should always pass the actual fetch time.
 *
 * `deepLink`: NO BUILDER EXISTS YET
 * -----------------------------------
 * REL-25/REL-26 (monetization epic) haven't landed, so there is no real
 * affiliate/deep-link URL to put here. This module uses `null` rather than
 * the mock's `'#'` placeholder — `'#'` reads as "a link that goes nowhere on
 * purpose" (a mock-data flourish so a disposable `<a>` has *something*
 * clickable), whereas `null` is the more honest signal to a real consumer
 * that no link has been built yet. (`<a href={null}>` renders as a plain,
 * non-interactive `<a>` in React — not a broken same-page anchor.)
 *
 * `airline`/`airlineCode`: NO NAME LOOKUP EXISTS YET EITHER
 * -------------------------------------------------------------
 * REL-16 (airline code -> display name lookup) hasn't merged into `main` as
 * of this ticket. `calendar` rows only ever carry the 2-letter IATA code
 * (e.g. `"BZ"`), never a display name. Rather than invent a fake name or
 * skip offers over a cosmetic field, `airline` is set equal to `airlineCode`
 * until REL-16 lands and a future ticket wires its lookup in here — a
 * documented, honest placeholder, same spirit as the `deepLink` decision
 * above. A missing/null code (calendar's `airline` can be `null`) falls back
 * to `'??'` for both fields rather than `undefined`.
 *
 * BRIDGING A NAMING SEAM BETWEEN REL-12 AND REL-17
 * -----------------------------------------------------------
 * REL-17's `resolveDuration()`/`realDurationFrom()` read a row's real
 * duration off `row.duration` and `row.gate` — the RAW Travelpayouts field
 * names, matching `duration.test.js`'s fixtures (which load
 * `body.data` directly, bypassing `fetchLatest()`'s own parsing). REL-12's
 * `fetchLatest()`, however, parses that same field into `durationMinutes`
 * (see `parseLatestBody()` in providers/travelpayouts.js) — `gate` keeps its
 * name, `duration` doesn't. Nothing bridged that gap before this ticket,
 * since REL-14 is the first module to actually feed `fetchLatest()`'s
 * output into `resolveDuration()`. Rather than change either already-merged
 * module's contract, `toDurationRow()` below adapts one `fetchLatest()` row
 * into the `{ gate, duration }` shape `resolveDuration()` expects,
 * immediately before the call.
 *
 * `distanceKm`: A CALLER INPUT, NOT SOMETHING THIS MODULE COMPUTES
 * ----------------------------------------------------------------------
 * Same reasoning as `duration.js`'s own `distanceKm` parameter: api/ has no
 * airport coordinate table (see that module's packaging note on why
 * duplicating src/data/airports.js's ~130-row table isn't worth it). One
 * `distanceKm` figure is accepted per `normalizeOffers()` call — valid
 * because this module, like `fetchCalendar()`/`fetchLatest()`, is called
 * once per (origin, destination) pair, so every offer in a batch shares the
 * same great-circle distance. The caller (eventually REL-19, which already
 * has to resolve airport codes to build the upstream request) is
 * responsible for supplying it.
 *
 * `originAirport`/`destAirport`: NOT SOLVING REL-18's METRO PROBLEM HERE
 * ----------------------------------------------------------------------------
 * REL-11 confirmed none of the 3 Travelpayouts endpoints ever resolve a
 * metro code (e.g. `TYO`) to a concrete airport (`NRT`/`HND`) — they just
 * echo the metro code back. Deciding how a metro search fans out across
 * member airports is REL-18's job, not yet decided. This module assumes
 * `origin`/`destination` are ALREADY concrete airport codes by the time they
 * reach here (whatever REL-18 eventually lands feeds a resolved airport code
 * in) and copies them straight onto every offer — no metro-specific logic.
 *
 * FILTERING & MISSING-FIELD HANDLING
 * -------------------------------------
 * Mirrors the mock's semantics in src/lib/searchFlights.js exactly: a trip's
 * `nights` (derived from the calendar row's OWN `date`/`returnAt` — not
 * assumed from whatever `length` a particular upstream call was filtered
 * to) must be within `flexibility` of the requested `nights`, and both
 * `departDate` and `returnDate` must fall inside `[earliest, latest]`
 * (plain `YYYY-MM-DD` string comparison is valid here — that format sorts
 * lexicographically the same as chronologically).
 *
 * A calendar row missing something this module cannot proceed without
 * (`price`, `date`, or a parseable `returnAt`) is silently skipped — one bad
 * upstream row degrades to one missing offer, never a thrown error. Empty
 * `calendar`/`latest` input arrays are a normal "nothing to show for this
 * route" case, not an error either: `normalizeOffers()` returns `[]` and
 * never throws, for any input.
 *
 * ID, SORT, CAP
 * -------------
 * `id` follows the mock's `${from}-${to}-${date}-${nights}-${index}`
 * pattern, `index` being a running counter over rows as they're built
 * (before sorting), which is sufficient to guarantee uniqueness within one
 * batch even if two calendar rows land on the same date/nights pair. Offers
 * are sorted cheapest-first and capped at `MAX_OFFERS` (24) — matching the
 * mock and `ResultsSection.jsx`, which renders the full result array with no
 * pagination.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cap on returned offers — matches the mock; `ResultsSection.jsx` doesn't paginate. */
export const MAX_OFFERS = 24

/** Fallback airline code/name when a calendar row's `airline` is missing (see module doc comment). */
const UNKNOWN_AIRLINE = '??'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parses a strict `YYYY-MM-DD` string into a UTC-based day count, or `null` if malformed. */
function parseISODateUTC(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const time = Date.UTC(y, m - 1, d)
  // Guards against e.g. "2026-02-30" silently rolling over to March.
  const roundTrip = new Date(time)
  if (roundTrip.getUTCFullYear() !== y || roundTrip.getUTCMonth() !== m - 1 || roundTrip.getUTCDate() !== d) {
    return null
  }
  return time
}

/** Whole days from ISO date `a` to ISO date `b`. `null` if either is unparseable. */
function daysBetweenISO(a, b) {
  const ta = parseISODateUTC(a)
  const tb = parseISODateUTC(b)
  if (ta == null || tb == null) return null
  return Math.round((tb - ta) / 86400000)
}

/** True when `value` falls within the inclusive `[earliest, latest]` ISO-date window. */
function withinWindow(value, earliest, latest) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false
  return value >= earliest && value <= latest
}

/**
 * Adapts a `fetchLatest()`-shaped row (`{ gate, durationMinutes, ... }`) into
 * the `{ gate, duration }` shape `resolveDuration()`/`realDurationFrom()`
 * (REL-17) actually read — see the module doc comment's "bridging a naming
 * seam" section. `null`/`undefined` in, `null` out (matches how
 * `resolveDuration({ row: null, ... })` already means "no row to consider").
 */
function toDurationRow(latestRow) {
  if (!latestRow) return null
  return { gate: latestRow.gate, duration: latestRow.durationMinutes }
}

/**
 * Index `latest` rows by an exact `departDate|returnDate` key, so each
 * calendar row can look up a duration backfill in O(1). When more than one
 * `latest` row collides on the same key, the one with a trustworthy real
 * duration wins (see module doc comment) — a synthetic `gate: ""` row never
 * shadows a real one just by coming first in the array.
 */
function indexLatestByDates(latestRows) {
  const index = new Map()
  for (const row of latestRows ?? []) {
    if (!row || typeof row.departDate !== 'string' || typeof row.returnDate !== 'string') continue
    const key = `${row.departDate}|${row.returnDate}`
    const existing = index.get(key)
    if (!existing || (realDurationFrom(toDurationRow(existing)) == null && realDurationFrom(toDurationRow(row)) != null)) {
      index.set(key, row)
    }
  }
  return index
}

/**
 * Normalizes one calendar row into an `Offer`, or returns `null` when the
 * row is missing something required, fails the window/flexibility filter,
 * or is otherwise unusable. Never throws.
 */
function buildOfferFromCalendarRow(row, index, ctx) {
  if (!row) return null

  const price = Number(row.price)
  if (!Number.isFinite(price) || price <= 0) return null // required: no price, no offer

  const departDate = row.date
  if (typeof departDate !== 'string' || !ISO_DATE_RE.test(departDate)) return null // required

  const returnAt = row.returnAt
  if (typeof returnAt !== 'string' || returnAt.length < 10) return null // required: can't derive returnDate
  const returnDate = returnAt.slice(0, 10)
  if (!ISO_DATE_RE.test(returnDate)) return null

  const nights = daysBetweenISO(departDate, returnDate)
  if (nights == null || nights < 1) return null // corrupt/unusable date pair

  if (Math.abs(nights - ctx.nights) > ctx.flexibility) return null
  if (!withinWindow(departDate, ctx.earliest, ctx.latest)) return null
  if (!withinWindow(returnDate, ctx.earliest, ctx.latest)) return null

  const rawStops = Number(row.transfers)
  const stops = Number.isFinite(rawStops) && rawStops > 0 ? Math.round(rawStops) : 0

  const latestMatch = index.get(`${departDate}|${returnDate}`) ?? null
  const { duration, durationEstimated } = resolveDuration({
    row: toDurationRow(latestMatch),
    distanceKm: ctx.distanceKm,
    stops,
  })

  const airlineCode = typeof row.airline === 'string' && row.airline.trim() ? row.airline : UNKNOWN_AIRLINE
  const currency = typeof row.currency === 'string' && row.currency ? row.currency : 'USD'
  const collectedAt = latestMatch?.foundAt || ctx.collectedAt

  return {
    price: Math.round(price * ctx.passengers),
    currency,
    airline: airlineCode,
    airlineCode,
    originAirport: ctx.origin,
    destAirport: ctx.destination,
    departDate,
    returnDate,
    nights,
    stops,
    durationOutbound: duration,
    durationReturn: duration,
    deepLink: null, // see module doc comment: no deep-link builder exists yet (REL-25/REL-26)
    priceSource: ctx.priceSource,
    collectedAt,
    durationEstimated,
  }
}

/**
 * Maps `calendar`+`latest` provider rows into `Offer[]` for one
 * origin/destination pair. See the module doc comment for the join
 * strategy, and for what `priceSource`/`collectedAt`/`distanceKm`/
 * `deepLink`/`airline` mean here.
 *
 * @param {object} params
 * @param {Array} [params.calendar]     rows from `fetchCalendar()` — primary source
 * @param {Array} [params.latestRows]   rows from `fetchLatest()` — duration backfill only
 * @param {string} params.origin        concrete origin airport code (already resolved; see module doc comment)
 * @param {string} params.destination   concrete destination airport code
 * @param {string} params.earliest      'YYYY-MM-DD', inclusive window start
 * @param {string} params.latest        'YYYY-MM-DD', inclusive window end
 * @param {number} params.nights        requested trip length
 * @param {number} [params.flexibility] days of slack either side of `nights`, default 0
 * @param {number} [params.passengers]  passenger count `price` is multiplied by, default 1
 * @param {number} [params.distanceKm]  great-circle route distance, for the duration-estimate fallback
 * @param {'cached'|'live'} params.priceSource  where this batch's data came from — caller-supplied, see module doc comment
 * @param {string} [params.collectedAt] ISO timestamp this calendar batch was fetched; used when no `latest` match supplies a better one
 * @returns {Array<object>} Offer[], sorted cheapest-first, capped at MAX_OFFERS. Never throws.
 */
export function normalizeOffers({
  calendar = [],
  latestRows = [],
  origin,
  destination,
  earliest,
  latest,
  nights,
  flexibility = 0,
  passengers = 1,
  distanceKm,
  priceSource,
  collectedAt,
} = {}) {
  if (!origin || !destination) return []
  if (typeof earliest !== 'string' || typeof latest !== 'string' || earliest > latest) return []
  if (!Array.isArray(calendar) || calendar.length === 0) return []

  const requestedNights = Number(nights)
  if (!Number.isFinite(requestedNights) || requestedNights < 1) return []

  const ctx = {
    origin,
    destination,
    earliest,
    latest,
    nights: requestedNights,
    flexibility: Number.isFinite(Number(flexibility)) ? Math.max(0, Number(flexibility)) : 0,
    passengers: Number.isFinite(Number(passengers)) && Number(passengers) >= 1 ? Number(passengers) : 1,
    distanceKm,
    priceSource,
    collectedAt: typeof collectedAt === 'string' && collectedAt ? collectedAt : new Date().toISOString(),
  }

  const latestIndex = indexLatestByDates(latestRows)

  let runningIndex = 0
  const offers = []
  for (const row of calendar) {
    const offer = buildOfferFromCalendarRow(row, latestIndex, ctx)
    if (!offer) continue
    offer.id = `${origin}-${destination}-${offer.departDate}-${offer.nights}-${runningIndex}`
    runningIndex += 1
    offers.push(offer)
  }

  return offers.sort((a, b) => a.price - b.price).slice(0, MAX_OFFERS)
}
