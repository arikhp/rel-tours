import { distanceKm } from '../data/airports.js'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FARE SOURCE: THE REAL WORKER HALF OF THE BACKEND SEAM (REL-19)
 *
 * `searchFlights()` (src/lib/searchFlights.js) picks between this module and
 * its own mock generator based on `import.meta.env.VITE_API_URL`. This module
 * owns everything specific to talking to the real Worker's `/search` route:
 * building the query string, issuing the fetch, aborting a stale in-flight
 * request, and turning a non-2xx/network failure into an `Error` with a
 * readable `.message` (never a raw Response or a thrown JSON body — see
 * `App.jsx`'s `catch (err) { setError(err?.message || ...) }`, which only
 * ever reads `.message`).
 *
 * `distanceKm`: WHY THE FRONT END COMPUTES AND SENDS IT
 * -----------------------------------------------------------
 * The Worker (api/) has no airport coordinate table by design — every module
 * in the REL-1x epic that needed one (duration.js, metros.js) deliberately
 * did not duplicate this repo's ~130-row src/data/airports.js table, and
 * instead documented "the caller supplies what it already knows". This repo
 * already imports `distanceKm()` here to feed the mock, and already resolves
 * `criteria.from`/`criteria.to` before ever calling `searchFlights()` — so
 * computing the great-circle distance client-side and passing it as a
 * `distanceKm` query param is a small, honest addition to the request
 * contract, consistent with that pattern. The Worker treats a missing/
 * invalid value as merely "no distance hint" (duration estimates degrade
 * gracefully), never as a reason to reject the request.
 *
 * ABORTING A STALE REQUEST
 * ----------------------------
 * `App.jsx` already discards a stale response after the fact via its own
 * `requestId` ref guard (see its `runSearch`) — that guard is left completely
 * untouched here. What it does NOT do is stop the actual network request
 * once a newer search has started, so an abandoned search keeps consuming
 * bandwidth/Worker time for a result nobody will ever see. This module closes
 * that gap on its own: it keeps a single module-level `AbortController` for
 * "the most recent fetch issued by this module" and aborts the previous one
 * whenever a new one starts, before the new fetch is even issued. Because
 * this lives entirely inside `fetchFromWorker()`, `searchFlights()`'s
 * signature and `App.jsx` never need to change to get this behavior — the
 * next call to `searchFlights()` (which is exactly what a new search does)
 * is what triggers the abort.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let currentController = null

/** Builds the `/search` URL (base + query string) for one criteria object. */
export function buildSearchUrl(apiUrl, criteria) {
  const { from, to, earliest, latest, nights, flexibility, passengers, cabin } = criteria ?? {}

  const params = new URLSearchParams({
    from: from ?? '',
    to: to ?? '',
    earliest: earliest ?? '',
    latest: latest ?? '',
    nights: String(nights ?? ''),
    flexibility: String(flexibility ?? 0),
    passengers: String(passengers ?? 1),
  })
  if (cabin) params.set('cabin', cabin)

  // Best-effort: an unresolvable route (unknown code) yields 0 from
  // distanceKm(), which we simply don't send — the Worker treats an absent
  // distanceKm as "no hint" rather than a bad one.
  const km = distanceKm(from, to)
  if (km > 0) params.set('distanceKm', String(Math.round(km)))

  const base = String(apiUrl).endsWith('/') ? String(apiUrl).slice(0, -1) : String(apiUrl)
  return `${base}/search?${params.toString()}`
}

/** Extracts a readable message from a non-2xx `/search` response's JSON error body, if any. */
async function messageFromErrorResponse(res) {
  try {
    const body = await res.json()
    if (body && typeof body.message === 'string' && body.message) return body.message
    if (body && typeof body.error === 'string' && body.error) return body.error
  } catch {
    // non-JSON/empty error body — fall through to the generic status message
  }
  return `Fare search failed (HTTP ${res.status})`
}

/**
 * Fetches `Offer[]` from the real Worker for one search. Aborts whatever
 * fetch this module previously had in flight before issuing the new one (see
 * module doc comment). Throws an `Error` with a readable `.message` on any
 * network failure, non-2xx response, or unparsable body.
 *
 * @param {string} apiUrl  `import.meta.env.VITE_API_URL`, already confirmed truthy by the caller
 * @param {object} criteria  same shape searchFlights() takes
 * @returns {Promise<Array>} Offer[]
 */
export async function fetchFromWorker(apiUrl, criteria) {
  if (currentController) currentController.abort()
  const controller = new AbortController()
  currentController = controller

  const url = buildSearchUrl(apiUrl, criteria)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      // Superseded by a newer search. App.jsx's requestId guard will discard
      // whatever we throw anyway (it never got a chance to become "current"),
      // so a plain, readable message is enough — there's no result to give.
      throw new Error('Search was cancelled by a newer search.')
    }
    throw new Error('Could not reach the fare search service. Check your connection and try again.')
  } finally {
    // Don't clear a controller a newer call already replaced.
    if (currentController === controller) currentController = null
  }

  if (!res.ok) {
    throw new Error(await messageFromErrorResponse(res))
  }

  let body
  try {
    body = await res.json()
  } catch {
    throw new Error('The fare search service returned an unreadable response.')
  }

  return Array.isArray(body) ? body : []
}
