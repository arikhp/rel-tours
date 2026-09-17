# REL-11: Travelpayouts endpoint mix decision

## Choice

**Primary: `GET /v1/prices/calendar`.** It's the only candidate whose call shape lines up
one-to-one with a bounded date window: one call = one calendar month of daily cheapest
fares, so a 90-day search window costs ~3-4 calls regardless of the route. That matches
what REL-13's `planCalls()` already assumes (`yearMonth` + `length` per call) — no
rework needed there. `/v2/prices/latest` returns up to 1000 rows in one call, but those
rows are "cheapest fares recently found" ranked by price/recency, not bounded to a
requested date range (our TYO sample alone spanned Sept 2026 through Aug 2027 in a
single call), so it can't be pointed reliably at "the next 90 days" — it may under- or
over-cover the window depending what happened to be cached. `/v2/prices/week-matrix`
is worse for breadth: it returns a handful of rows clustered within a few days of one
depart/return date pair, so tiling a 90-day window would take on the order of 10+ calls
instead of 3.

**Secondary, for one thing calendar can't give us: `/v2/prices/latest`.** Calendar has
no flight-duration field at all. `/v2/prices/latest` does carry `duration` (minutes) on
most rows, so REL-17 should plan to pull it from there — see the durations finding
below, this is *not* what the ticket assumed going in.

`/v2/prices/week-matrix` isn't part of the recommended mix — same missing-airport-code
and non-bounded-coverage issues as `latest`, with narrower per-call coverage and no
compensating advantage for this codebase's flexible-window search.

## What changed from the plan

- **Durations are present, just not on the endpoint we're using for coverage.**
  `/v1/prices/calendar` never has them (confirmed across all 3 routes, all 3 months, and
  a `length`-filtered call — no `duration` key appears anywhere in that response shape).
  But `/v2/prices/latest` and `/v2/prices/week-matrix` both carry `duration` in minutes
  on rows where `gate` is non-empty (rows with `"gate": ""` are synthetic/aggregated and
  report `duration: 0`, `distance: 0` — treat those as missing, not zero). The values
  look like total elapsed itinerary time including layovers, not pure flight time — LCA
  (short, mostly direct) reports a tight, plausible ~130-135 min consistently, while BCN
  and TYO (more connections) report anywhere from ~1100 to ~5500 minutes for the same
  route depending on the specific routing found. REL-17 needs a plan for a primary data
  source (calendar) that has no duration data at all, with an optional cross-reference
  source (latest) whose duration numbers are noisy and itinerary-dependent rather than a
  clean per-route constant.
- **No endpoint names a concrete airport for a metro code.** Querying `destination=TYO`
  against all three endpoints returns `"destination": "TYO"` on every row — the metro
  code is echoed back verbatim, never resolved to `NRT` or `HND`. This affects REL-18
  directly: none of these endpoints can be trusted to say which specific airport a fare
  actually flies from/to when a metro code is queried. A metro search will need to fan
  out and query each member airport individually (`airportsFor()` already exists for
  this in `src/data/airports.js`) rather than relying on the API to disambiguate.
- **`calendar`'s `expires_at` is not a fare-freshness signal.** Every row in a given
  calendar response carries the *same* `expires_at`, timestamped ~1 hour after the
  request regardless of route — it's the API response's cache TTL, not when the
  underlying fare was found. Actual collection time only shows up as `found_at` on
  `/v2/prices/latest` and `/v2/prices/week-matrix` rows, and it varies per row. Any
  future "how fresh is this fare" feature has to come from `latest`/`week-matrix`, not
  from `calendar`.
- **An unflightable destination 400s, not a sparse 200.** `origin=TLV&destination=ULN`
  against `/v1/prices/calendar` returned `400 {"error": "bad request: airport ULN: not
  flightable"}` — Travelpayouts appears to maintain an allowlist of airports it has
  calendar data for. `/v2/prices/latest` for the same pair 200'd with `"data": []`
  instead. So the failure mode differs by endpoint: calendar can hard-error on an
  obscure destination, latest just comes back empty. Callers need to handle both.
