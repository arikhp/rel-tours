/**
 * ─────────────────────────────────────────────────────────────────────────────
 * METRO AREA → CONCRETE AIRPORTS TO SEARCH, CAPPED (REL-18, revised scope per
 * REL-11's spike — see api/test/fixtures/DECISION.md)
 *
 * REL-18 originally assumed a metro code (e.g. `TYO`) could be passed straight
 * through to Travelpayouts and the response "expanded back" into per-airport
 * offers. REL-11 (merged) found that's impossible: no candidate endpoint ever
 * resolves a metro code to a concrete airport — querying `destination=TYO`
 * returns `"destination": "TYO"` verbatim on every row, across all 3
 * candidate endpoints. There's nothing to expand; upstream never tells us
 * which airport it actually means.
 *
 * DECISION: FAN OUT TO REAL MEMBER AIRPORTS, CAPPED AT 2 PER SIDE
 * -----------------------------------------------------------------
 * Instead, a metro search becomes several *separate* per-airport searches —
 * each one honest, because every offer then names an airport that was
 * actually queried, never an invented "primary" airport for the metro. To
 * bound worst-case upstream cost, this module returns at most the 2 biggest
 * member airports for any metro (biggest = earliest in the source table's
 * `airports` array — see ORDERING below).
 *
 * Most defined metros already have <= 2 airports, so the cap only changes
 * behavior for the 3 metros with more:
 *   - LON (5: LHR/LGW/STN/LTN/LCY) -> LHR, LGW
 *   - NYC (3: JFK/EWR/LGA)         -> JFK, EWR
 *   - WAS (3: IAD/DCA/BWI)         -> IAD, DCA
 *
 * This module is deliberately standalone: it does NOT call fetchCalendar /
 * fetchLatest (providers/travelpayouts.js), does NOT touch planner.js, and
 * does NOT touch normalize.js. Its only job is: given a code, which 1-2
 * concrete airport codes does a caller need to search separately. Nothing
 * calls this yet — same "REL-19 wires it in" pattern as every other Epic 2
 * module so far (duration.js, planner.js, cache.js, travelpayouts.js).
 *
 * PACKAGING: WHY THIS TABLE IS DUPLICATED, NOT IMPORTED
 * ---------------------------------------------------------
 * `src/data/airports.js` (repo root, the front-end Vite package) already
 * defines this exact `metros` array, complete with coordinates. api/ (this
 * package, a Cloudflare Worker — see api/package.json's name "rel-tours-api"
 * vs. the root package.json's "cheap-flights") is a separate npm package with
 * no workspace config and no import path to that file — the identical
 * situation REL-17 hit with the airport coordinate table (see duration.js's
 * "PACKAGING" note for the full reasoning, which applies here unchanged).
 *
 * Rather than force cross-package tooling (a workspace/monorepo migration)
 * for one small table, this module duplicates *only* the piece it actually
 * needs: metro code -> member airport codes, in source order. It does NOT
 * duplicate coordinates (this module never plots anything) or the ~130-row
 * airport table (a plain airport is returned as-is; nothing here needs to
 * validate that e.g. "TLV" is a real airport). 13 entries is small enough to
 * keep in sync by hand, with this comment as the tripwire — same tradeoff as
 * duration.js's formula constants.
 *
 * DRIFT RISK: metros.test.js hardcodes the full 13-entry mapping (all of it,
 * not just the 4 that matter for the cap) and asserts it byte-for-byte
 * against this table, so CI catches drift the moment `src/data/airports.js`'s
 * `metros` array changes without a matching edit here — rather than someone
 * discovering it in production because TYO quietly returned the wrong pair.
 *
 * ORDERING: "FIRST N" MEANS "BIGGEST N", CONSISTENTLY
 * -------------------------------------------------------
 * `src/data/airports.js` orders each metro's `airports` array with the
 * busiest/primary airport(s) first (e.g. TYO: NRT before HND; LON: LHR before
 * the other four). This module copies that order verbatim and always takes
 * the first `MAX_AIRPORTS_PER_METRO` entries — so "capped at 2" reliably
 * means "the 2 biggest", not an arbitrary subset, as long as the source table
 * keeps observing that same "biggest first" convention when it's edited.
 *
 * ISTANBUL / SHANGHAI EXCLUSION
 * ----------------------------------
 * `src/data/airports.js` deliberately excludes Istanbul and Shanghai from
 * `metros`: their real-world IATA metro codes (`IST`, `SHA`) collide with an
 * existing airport code (Istanbul's own main airport is coded `IST`; `SHA`
 * would collide if it were ever added as Shanghai's Hongqiao airport code),
 * which would make a typed code ambiguous — is `IST` the metro or the
 * airport? The source file even carries a dev-only assertion that fails
 * loudly on such a collision. This module's table matches that exclusion:
 * `IST` and `SHA` are not metro entries here either, so `resolveAirports`
 * treats them as plain airports (see UNKNOWN/PLAIN CODES below) — same
 * behavior as the front end.
 *
 * UNKNOWN/PLAIN CODES: RETURNED AS-IS, NEVER THROWN
 * ------------------------------------------------------
 * `resolveAirports` never throws. A code not present in this module's metro
 * table — whether it's a real, plain airport (`TLV`), an excluded metro-like
 * code (`IST`, `SHA`), or outright garbage (`ZZZ`, `''`) — is returned
 * unchanged as a single-element array. This module has no airport table to
 * validate against (see PACKAGING above), so it cannot distinguish "real
 * airport" from "garbage" anyway; that validation belongs to whichever
 * downstream caller actually queries Travelpayouts (REL-19), which will
 * naturally get an empty/error response for a bogus code and can surface
 * that to the user. Throwing here would just move that failure earlier
 * without adding any information.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Metro code -> member airport codes, busiest/primary first. Duplicated by
 * hand from `src/data/airports.js`'s `metros` array (coordinates and city/
 * country fields dropped — this module only ever needs the airport list) —
 * see the PACKAGING and DRIFT RISK notes above. Keep in sync by hand; if this
 * table and the source table ever diverge, `metros.test.js` fails.
 */
export const METRO_AIRPORTS = {
  LON: ['LHR', 'LGW', 'STN', 'LTN', 'LCY'],
  PAR: ['CDG', 'ORY'],
  ROM: ['FCO', 'CIA'],
  MIL: ['MXP', 'BGY'],
  NYC: ['JFK', 'EWR', 'LGA'],
  WAS: ['IAD', 'DCA', 'BWI'],
  CHI: ['ORD', 'MDW'],
  TYO: ['NRT', 'HND'],
  OSA: ['KIX', 'ITM'],
  SEL: ['ICN', 'GMP'],
  BJS: ['PEK', 'PKX'],
  BUE: ['EZE', 'AEP'],
  SAO: ['GRU', 'CGH'],
}

/** Hard cap on how many member airports a single metro fans out to. */
export const MAX_AIRPORTS_PER_METRO = 2

/**
 * Given ANY code (a metro or a plain airport), returns the concrete airport
 * code(s) a caller should actually search.
 *
 *   - A plain airport (or any code not in `METRO_AIRPORTS`, including the
 *     deliberately-excluded IST/SHA and outright garbage) returns itself,
 *     upper-cased/trimmed, as a 1-element array.
 *   - A known metro returns its `MAX_AIRPORTS_PER_METRO` biggest member
 *     airports (source order = biggest first), never all of them.
 *
 * Never throws — see the UNKNOWN/PLAIN CODES note above.
 *
 * @param {string} code
 * @returns {string[]}
 */
export function resolveAirports(code) {
  const normalized = String(code ?? '').trim().toUpperCase()
  const members = METRO_AIRPORTS[normalized]
  if (!members) return [normalized]
  return members.slice(0, MAX_AIRPORTS_PER_METRO)
}

/**
 * Every `{origin, destination}` airport-pair a caller needs to search to
 * cover a full origin/destination search, taking the cross-product of each
 * side's `resolveAirports()` result. A plain-airport-to-plain-airport search
 * yields exactly 1 pair; a metro on either or both sides multiplies out —
 * e.g. `TLV` -> `LON` yields 2 pairs (`TLV-LHR`, `TLV-LGW`), and a
 * metro-to-metro search yields up to `MAX_AIRPORTS_PER_METRO ** 2` pairs.
 *
 * This is a convenience for whoever wires REL-19 (combining this module with
 * the REL-13 planner, REL-12 client, and REL-15 cache) — it doesn't call any
 * of those itself.
 *
 * @param {string} origin
 * @param {string} destination
 * @returns {{origin: string, destination: string}[]}
 */
export function resolveAirportPairs(origin, destination) {
  const origins = resolveAirports(origin)
  const destinations = resolveAirports(destination)

  const pairs = []
  for (const o of origins) {
    for (const d of destinations) {
      pairs.push({ origin: o, destination: d })
    }
  }
  return pairs
}
