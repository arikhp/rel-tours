import { cacheKeyFor } from './planner.js'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KV FARE CACHE WITH A DAILY WRITE BUDGET (REL-15)
 *
 * Caches opaque fare payloads at the edge in Cloudflare KV. This module knows
 * nothing about Travelpayouts or the shape of a fare response — it caches
 * whatever `value` it's handed, keyed by the REL-13 cache key format. It also
 * knows nothing about HTTP; nothing calls it yet (REL-12/REL-19 wire a caller
 * in later). It is deliberately standalone, same as planner.js.
 *
 * WHY A WRITE BUDGET
 * -------------------
 * Cloudflare KV's free tier allows 100,000 reads/day but only 1,000
 * writes/day (per namespace). Reads are effectively free; writes are the
 * scarce resource. A naive write-through cache (write on every miss) can
 * blow that budget on a busy day and start failing outright. This module
 * tracks writes against a daily budget and, once it's spent, tells the
 * caller "don't write" instead of attempting (and failing) the write. A
 * budget-exhausted miss still returns cleanly (`null`, same as any other
 * miss) — the caller falls back to serving a live, uncached result. The
 * cache degrades toward "read-only cache, no new entries today", never
 * toward a failed search.
 *
 * CACHE KEY
 * ---------
 * Reuses `cacheKeyFor()` from planner.js — `tp:v1:{ORIGIN}:{DEST}:{YYYY-MM}:
 * {length}:{currency}` — rather than reimplementing it. Both functions below
 * accept either a pre-built key string or a planner Call descriptor
 * (`{ origin, destination, yearMonth, length, currency }`); a Call is run
 * through `cacheKeyFor()` for you. Passing the key straight through when the
 * caller already has one avoids a redundant rebuild.
 *
 * TTL
 * ---
 * `CACHE_TTL_SECONDS` (6 hours) is passed as KV's `expirationTtl` on every
 * write, so expiry is enforced by KV itself — this module never checks a
 * stored timestamp on read. A value KV still has is, by definition, not yet
 * expired.
 *
 * WRITE BUDGET MECHANICS
 * -----------------------
 * The budget is tracked with a counter key stored in KV itself (no external
 * state, no Durable Object): `tp:v1:writes:{YYYY-MM-DD}` (UTC date), holding
 * the number of cache-value writes made so far today. `setCached()`:
 *   1. reads the counter for today
 *   2. if it's already >= DAILY_WRITE_BUDGET (1000), skips the write and
 *      returns `false` — the fare-cache write itself never happens
 *   3. otherwise writes the incremented counter back (reserving the write
 *      *before* attempting it, so a slow/failing value write can't cause the
 *      budget to be overrun), then writes the actual cache entry and
 *      returns `true`
 * The counter key carries its own `expirationTtl` (36h — long enough to
 * outlive the UTC day it counts, short enough not to accumulate forever) so
 * old counters clean themselves up automatically.
 *
 * Note this means a single cache write is up to two KV writes (the counter
 * bump + the value itself) — both count against Cloudflare's real per-
 * namespace write quota, so the effective ceiling on *fare* writes this
 * tracks toward is the same 1000/day, but total KV write operations can run
 * up to ~2x that. Counting only real writes (not counter bumps) against the
 * budget is a deliberate simplification: KV has no atomic counter primitive
 * short of Durable Objects, which is out of scope here. The counter
 * read-then-write is also not atomic, so under concurrent requests the
 * budget is a soft, best-effort ceiling (possibly overshooting by a handful
 * of writes right at the boundary), not a hard guarantee — acceptable for a
 * cost-control heuristic, not something requiring strict correctness.
 *
 * FAILURE MODES
 * --------------
 *   - No KV binding at all (`kv` is null/undefined): every call is a no-op
 *     miss/skip. `getCached` -> null, `setCached` -> false. No throw.
 *   - KV throws on any call (read, write, or the counter bookkeeping): the
 *     error is caught, the operation degrades to "treat as a miss" /
 *     "treat as skipped", and the caller's search is never affected. A
 *     write failure must never fail the user's search.
 *   - A stored value that fails to `JSON.parse` (corrupt/foreign data) is
 *     treated as a miss rather than thrown.
 *
 * API
 * ---
 *   getCached(kv, callOrKey) -> Promise<any | null>
 *     Read-through. Returns the cached value on a hit, or `null` on a miss,
 *     a KV error, or no KV binding. Never writes to KV.
 *
 *   setCached(kv, callOrKey, value) -> Promise<boolean>
 *     Write-through with budget enforcement. Returns whether it actually
 *     wrote: `true` on a successful write, `false` if the daily budget is
 *     exhausted, KV threw, or there's no KV binding.
 *
 * COMPOSITION
 * -----------
 * The intended caller shape (for the future REL-12/REL-19 wiring):
 *
 *   const cached = await getCached(env.FARE_CACHE, call)
 *   if (cached) return cached
 *   const live = await fetchFromUpstream(call)   // REL-12
 *   await setCached(env.FARE_CACHE, call, live)   // fire-and-forget is fine too
 *   return live
 *
 * `getCached` never writes, so a read hit costs zero writes. `setCached` is
 * only ever called after a genuine miss, so the module never writes on a
 * hit — exactly the read-heavy, write-light shape the free tier requires.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** TTL applied to every cache write, in seconds (~6 hours). */
export const CACHE_TTL_SECONDS = 6 * 60 * 60

/** Daily cap on cache-value writes (Cloudflare KV free tier: 1,000 writes/day). */
export const DAILY_WRITE_BUDGET = 1000

/** TTL applied to the daily write-counter key itself, in seconds (36 hours). */
const WRITE_COUNTER_TTL_SECONDS = 36 * 60 * 60

/** `YYYY-MM-DD` for the given (or current) instant, in UTC. */
function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** The KV key holding today's write counter: `tp:v1:writes:{YYYY-MM-DD}`. */
export function writeCounterKeyFor(date = new Date()) {
  return `tp:v1:writes:${utcDateString(date)}`
}

/** Accepts either a pre-built cache key string or a planner Call descriptor. */
function resolveKey(callOrKey) {
  return typeof callOrKey === 'string' ? callOrKey : cacheKeyFor(callOrKey)
}

/**
 * Read-through cache lookup. Returns the cached value, or `null` on a miss,
 * a KV error, or when `kv` is falsy (no binding). Never writes to KV.
 *
 * @param {{get: (key: string) => Promise<string | null>} | null | undefined} kv
 * @param {object | string} callOrKey  a planner Call descriptor, or a pre-built key
 * @returns {Promise<any | null>}
 */
export async function getCached(kv, callOrKey) {
  if (!kv) return null

  let raw
  try {
    raw = await kv.get(resolveKey(callOrKey))
  } catch {
    // KV unavailable/throwing degrades to "always miss", never a thrown error.
    return null
  }
  if (raw == null) return null

  try {
    return JSON.parse(raw)
  } catch {
    // Corrupt/foreign value at this key — treat as a miss rather than throw.
    return null
  }
}

/**
 * Write-through cache write, gated by the daily write budget. Returns
 * whether the value was actually written. A cache write failing (KV
 * throwing) never throws back to the caller — it's caught and reported as
 * `false`, same as a budget-exhausted skip, so the caller's search is never
 * put at risk by a cache-layer problem.
 *
 * @param {{get: Function, put: Function} | null | undefined} kv
 * @param {object | string} callOrKey  a planner Call descriptor, or a pre-built key
 * @param {any} value  any JSON-serializable value
 * @returns {Promise<boolean>} true if written, false if skipped (budget exhausted or KV error)
 */
export async function setCached(kv, callOrKey, value) {
  if (!kv) return false

  const allowed = await reserveWriteBudget(kv)
  if (!allowed) return false

  try {
    await kv.put(resolveKey(callOrKey), JSON.stringify(value), {
      expirationTtl: CACHE_TTL_SECONDS,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Reads today's write counter and, if under `DAILY_WRITE_BUDGET`, bumps it
 * and returns `true` (the caller may proceed with its write). Reserving
 * before the value write happens means a failing value write can't cause
 * the counter to under-report actual usage into next requests trusting a
 * budget that's already gone. Any KV error here is treated as "can't
 * confirm budget, so don't write" — the safe direction to fail in.
 */
async function reserveWriteBudget(kv) {
  const counterKey = writeCounterKeyFor()

  let current = 0
  try {
    const raw = await kv.get(counterKey)
    current = raw ? Number(raw) || 0 : 0
  } catch {
    return false
  }

  if (current >= DAILY_WRITE_BUDGET) return false

  try {
    await kv.put(counterKey, String(current + 1), { expirationTtl: WRITE_COUNTER_TTL_SECONDS })
    return true
  } catch {
    return false
  }
}
