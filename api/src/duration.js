/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FLIGHT DURATION: A REAL VALUE WHEN WE HAVE ONE, A LABELED ESTIMATE OTHERWISE
 * (REL-17, revised scope per REL-11's spike — see test/fixtures/DECISION.md)
 *
 * REL-17 originally assumed Travelpayouts never returns a duration and asked
 * for "always estimate from distance". REL-11 (merged) found that's only true
 * of `/v1/prices/calendar` — the chosen primary source for search coverage,
 * which never carries a duration field at all. `/v2/prices/latest` (REL-12's
 * secondary/backfill source) *does* carry a `duration` (minutes) on most
 * rows, but two catches:
 *   1. it looks like full elapsed itinerary time including layovers, not
 *      pure flight time (LCA: a tight, plausible ~130-135min; BCN/TYO with
 *      more connections: anywhere from ~1100 to ~5500min for the "same"
 *      route depending on the routing found) — noisy, but real.
 *   2. rows where `gate` is `""` are synthetic/aggregated and report
 *      `duration: 0` (and `distance: 0`) — that's a MISSING value, not a
 *      genuine zero-minute flight. Trusting it would put nonsense on a card.
 *
 * So the decision this module makes, per offer, is:
 *   - a `latest`-sourced row with a non-empty `gate` and a positive
 *     `duration` -> use that duration verbatim, `durationEstimated: false`.
 *   - anything else (no row at all — e.g. every `calendar`-only offer, which
 *     is the common case since calendar is the primary/high-volume source —
 *     or a row with `gate: ""`, or a non-positive/non-numeric duration) ->
 *     fall back to the great-circle distance estimate, `durationEstimated: true`.
 *
 * THE ESTIMATE FORMULA
 * ---------------------
 * Extracted verbatim (constants and shape) from the mock's inline estimate in
 * src/lib/searchFlights.js, minus the random jitter (that's mock flavor for
 * making repeated searches feel less mechanical — it has no place in a real
 * estimate that claims to be "the nonstop time for this distance"):
 *
 *   nonstop  = (distanceKm / CRUISE_KMH) * 60 + TAXI_MINUTES
 *   estimate = nonstop + stops * STOP_MINUTES
 *
 * PACKAGING: WHY THIS ISN'T LITERALLY IMPORTED BY THE MOCK
 * -----------------------------------------------------------
 * api/ (this package, a Cloudflare Worker) and the repo-root Vite app are
 * separate npm packages — compare api/package.json (name "rel-tours-api")
 * against the root package.json (name "cheap-flights"): no workspace config,
 * no shared node_modules, no existing build step that resolves a relative
 * import across that boundary. Forcing one would mean either introducing a
 * workspace/monorepo tool (real complexity for one shared formula) or a
 * fragile relative `../../api/src/duration.js` import that Vite would need
 * to be taught to bundle from outside its root.
 *
 * REL-19 (the future real search path) is the primary consumer of the
 * REAL-vs-ESTIMATE *decision logic* (`resolveDuration`/`realDurationFrom`),
 * which only makes sense in the Worker — the mock never has a `latest` row
 * to reconcile against. So that logic lives here, once, as the single source
 * of truth. The mock's inline formula in src/lib/searchFlights.js is left
 * as-is (already matches these constants) with a comment cross-referencing
 * this file, rather than duplicating the decision logic there too. If the
 * two ever need to be literally shared, promoting the formula half (not the
 * real/estimate decision, which the mock has no use for) to a tiny published
 * package would be the clean move — not attempted here, since one formula
 * kept in sync by a paired comment is a small, honest cost next to that.
 *
 * DISTANCE: WHY THIS TAKES `distanceKm` AS A NUMBER, NOT A ROUTE
 * -----------------------------------------------------------------
 * `estimateDuration`/`resolveDuration` accept a pre-computed `distanceKm`
 * rather than airport codes. api/ has no airport coordinate table — unlike
 * src/data/airports.js, which pairs distanceKm() with a ~130-row lat/lon
 * table. Duplicating that whole table into api/ just to re-derive a number
 * the caller likely already has (REL-19 will be resolving airport codes to
 * query Travelpayouts anyway) would be a much bigger, more drift-prone
 * duplication than the formula itself. Instead this module exports
 * `haversineKm(a, b)` — the same ~10-line great-circle formula as
 * src/data/airports.js's `distanceKm`, operating on `{ lat, lon }` points
 * instead of codes — for a caller that has coordinates but not a
 * pre-computed distance. Whoever eventually wires REL-19 picks whichever fits
 * its own airport-data source.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cruise speed used for the nonstop-time estimate, km/h. */
export const CRUISE_KMH = 850
/** Fixed taxi/takeoff/landing overhead added to every estimate, minutes. */
export const TAXI_MINUTES = 35
/** Extra time added per stop (detour + connection sit), minutes. */
export const STOP_MINUTES = 90

/**
 * Great-circle distance in km between two `{ lat, lon }` points (degrees).
 * Same haversine implementation as src/data/airports.js's `distanceKm`,
 * kept in sync by hand — see the packaging note above. Returns 0 if either
 * point is missing.
 */
export function haversineKm(a, b) {
  if (!a || !b) return 0

  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δφ = (b.lat - a.lat) * toRad
  const Δλ = (b.lon - a.lon) * toRad

  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The real duration (minutes) from a `/v2/prices/latest` (or `week-matrix`,
 * same row shape) row, if — and only if — it's trustworthy:
 *   - `row.gate` must be a non-empty string. A `gate: ""` row is a
 *     synthetic/aggregated entry that always reports `duration: 0` — that's
 *     a missing value, not a real zero-minute flight (see DECISION.md).
 *   - `row.duration` must be a finite, positive number.
 *
 * Returns the duration in whole minutes, or `null` if untrustworthy/absent
 * (including when `row` itself is null/undefined — no row fetched).
 *
 * @param {{ gate?: string, duration?: number } | null | undefined} row
 * @returns {number | null}
 */
export function realDurationFrom(row) {
  if (!row) return null
  if (typeof row.gate !== 'string' || row.gate.trim() === '') return null

  const duration = Number(row.duration)
  if (!Number.isFinite(duration) || duration <= 0) return null

  return Math.round(duration)
}

/**
 * The distance-based estimate (minutes): great-circle nonstop time plus a
 * fixed penalty per stop. Never falls below the nonstop minimum for the
 * given distance (stops only ever add time; a negative/invalid `stops` is
 * clamped to 0 rather than allowed to subtract).
 *
 * @param {object} params
 * @param {number} params.distanceKm    great-circle distance, km (see
 *                                      `haversineKm` if you have coordinates
 *                                      instead of a pre-computed distance)
 * @param {number} [params.stops]       transfer count; defaults to 0 (nonstop)
 *                                      if omitted or not a usable number
 * @returns {number} estimated minutes, rounded
 */
export function estimateDuration({ distanceKm, stops = 0 } = {}) {
  const km = Number(distanceKm)
  const safeKm = Number.isFinite(km) && km > 0 ? km : 0

  const rawStops = Number(stops)
  const safeStops = Number.isFinite(rawStops) && rawStops > 0 ? Math.round(rawStops) : 0

  const nonstop = (safeKm / CRUISE_KMH) * 60 + TAXI_MINUTES
  const estimate = nonstop + safeStops * STOP_MINUTES

  // estimate >= nonstop always holds algebraically (safeStops >= 0), but the
  // explicit max makes that guarantee obvious at the call site and protects
  // against future edits to the formula above silently breaking it.
  return Math.max(Math.round(estimate), Math.round(nonstop))
}

/**
 * The actual decision: use a trustworthy real duration when one is
 * available, otherwise fall back to the distance estimate.
 *
 * @param {object} params
 * @param {{ gate?: string, duration?: number } | null | undefined} [params.row]
 *   a parsed `latest`/`week-matrix` row for this route, if one was fetched
 * @param {number} [params.distanceKm]  great-circle distance for the
 *   estimate fallback (ignored, but harmless to omit, when `row` yields a
 *   real duration)
 * @param {number} [params.stops]  transfer count for the estimate fallback
 * @returns {{ duration: number, durationEstimated: boolean }}
 */
export function resolveDuration({ row, distanceKm, stops = 0 } = {}) {
  const real = realDurationFrom(row)
  if (real != null) {
    return { duration: real, durationEstimated: false }
  }
  return { duration: estimateDuration({ distanceKm, stops }), durationEstimated: true }
}
