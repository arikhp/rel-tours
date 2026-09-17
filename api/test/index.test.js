import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'

function request(path, init = {}) {
  return new Request(`https://api.example.com${path}`, init)
}

// ─── Fetch stub: dependency-injected via `env.fetch` (index.js's DI point —
// see its module doc comment), same spirit as travelpayouts.test.js's
// stubFetch but routing on the two Travelpayouts endpoints and a handful of
// (destination, yearMonth, length) keys so a metro fan-out and a multi-month
// window can each get distinct, controllable data. ────────────────────────

/**
 * @param {object} opts
 * @param {Record<string, object>} [opts.calendarFixtures] keyed by
 *   `${destination}|${yearMonth}|${length}` -> calendar `data` object.
 *   Any (destination, yearMonth, length) combination not present in this map
 *   responds with an empty calendar (-> no_data, absorbed as empty rows).
 * @param {Record<string, object[]>} [opts.latestFixtures] keyed by
 *   `destination` -> `latest` rows array. Missing key responds with an empty
 *   array (-> no_data, absorbed as empty rows).
 * @param {number} [opts.calendarStatus] force every calendar call to this
 *   HTTP status instead of the fixture lookup (for failure-mode tests).
 * @param {boolean} [opts.notFlightable] force every calendar call to a 400
 *   "not flightable" response (the real no_data shape calendar uses).
 */
function makeFetchStub({ calendarFixtures = {}, latestFixtures = {}, calendarStatus, notFlightable = false } = {}) {
  const calls = []
  const fn = async (url) => {
    calls.push(url)
    const u = new URL(url)

    if (u.pathname.endsWith('/prices/calendar')) {
      if (notFlightable) {
        return new Response(JSON.stringify({ error: 'bad request: airport XXX: not flightable' }), { status: 400 })
      }
      if (calendarStatus && calendarStatus !== 200) {
        return new Response(JSON.stringify({ error: 'upstream exploded' }), { status: calendarStatus })
      }
      const destination = u.searchParams.get('destination')
      const yearMonth = u.searchParams.get('depart_date')
      const length = u.searchParams.get('length')
      const entries = calendarFixtures[`${destination}|${yearMonth}|${length}`]
      const data = entries ?? {}
      return new Response(JSON.stringify({ data, currency: 'usd', success: true }), { status: 200 })
    }

    if (u.pathname.endsWith('/prices/latest')) {
      const destination = u.searchParams.get('destination')
      const rows = latestFixtures[destination] ?? []
      return new Response(JSON.stringify({ currency: 'usd', error: '', data: rows }), { status: 200 })
    }

    throw new Error(`unexpected fetch url in test: ${url}`)
  }
  fn.calls = calls
  return fn
}

/** In-memory KV stand-in (get/put), same minimal shape cache.test.js's FakeKV uses. */
class FakeKV {
  constructor() {
    this.store = new Map()
  }
  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  async put(key, value) {
    this.store.set(key, value)
  }
}

const TOKEN = 'test-token-do-not-leak'

// One fixed 7-night BCN fare, valid for the default search window below.
const BCN_ENTRY = {
  '2027-06-10': {
    airline: 'LY',
    departure_at: '2027-06-10T10:00:00+03:00',
    return_at: '2027-06-17T10:00:00+02:00',
    price: 401,
    flight_number: 100,
    transfers: 0,
  },
}

function searchUrl(overrides = {}) {
  const base = {
    from: 'TLV',
    to: 'BCN',
    earliest: '2027-06-01',
    latest: '2027-07-15',
    nights: '7',
    flexibility: '1',
    passengers: '1',
    cabin: 'economy',
    distanceKm: '3100',
  }
  const params = new URLSearchParams({ ...base, ...overrides })
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) params.delete(key)
  }
  return `/search?${params.toString()}`
}

describe('/health', () => {
  it('returns 200 with a JSON status body', async () => {
    const res = await worker.fetch(request('/health'), {}, {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.time).toBe('string')
  })
})

describe('stub/simple routes', () => {
  it('/confirm returns 501 Not Implemented', async () => {
    const res = await worker.fetch(request('/confirm'), {}, {})
    expect(res.status).toBe(501)
  })

  it('unknown routes return 404', async () => {
    const res = await worker.fetch(request('/nope'), {}, {})
    expect(res.status).toBe(404)
  })

  it('non-GET on a known route returns 405', async () => {
    const res = await worker.fetch(request('/health', { method: 'POST' }), {}, {})
    expect(res.status).toBe(405)
  })
})

describe('CORS', () => {
  it('attaches CORS headers for an allowed origin', async () => {
    const res = await worker.fetch(
      request('/health', { headers: { Origin: 'http://localhost:5173' } }),
      {},
      {},
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })

  it('rejects a request from a disallowed origin', async () => {
    const res = await worker.fetch(
      request('/health', { headers: { Origin: 'https://evil.example.com' } }),
      {},
      {},
    )
    expect(res.status).toBe(403)
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it('answers an OPTIONS preflight from an allowed origin with 204', async () => {
    const res = await worker.fetch(
      request('/search', { method: 'OPTIONS', headers: { Origin: 'https://arikhp.github.io' } }),
      {},
      {},
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://arikhp.github.io')
  })

  it('rejects an OPTIONS preflight from a disallowed origin', async () => {
    const res = await worker.fetch(
      request('/search', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } }),
      {},
      {},
    )
    expect(res.status).toBe(403)
  })

  it('does not require an Origin header at all (non-browser clients)', async () => {
    const res = await worker.fetch(request('/health'), {}, {})
    expect(res.status).toBe(200)
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
})

describe('/search: validation', () => {
  it('returns a clean 400 when a required param is missing, not a crash', async () => {
    const url = searchUrl({ nights: undefined })
    const res = await worker.fetch(request(url), { TRAVELPAYOUTS_TOKEN: TOKEN }, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_request')
    expect(typeof body.message).toBe('string')
  })

  it('returns a clean 400 for a malformed date', async () => {
    const url = searchUrl({ earliest: 'not-a-date' })
    const res = await worker.fetch(request(url), { TRAVELPAYOUTS_TOKEN: TOKEN }, {})
    expect(res.status).toBe(400)
  })

  it('returns a clean 400 when latest is before earliest', async () => {
    const url = searchUrl({ earliest: '2027-07-15', latest: '2027-06-01' })
    const res = await worker.fetch(request(url), { TRAVELPAYOUTS_TOKEN: TOKEN }, {})
    expect(res.status).toBe(400)
  })
})

describe('/search: a successful plain search', () => {
  it('returns Offer[] in the documented shape', async () => {
    const fetchImpl = makeFetchStub({ calendarFixtures: { 'BCN|2027-06|7': BCN_ENTRY } })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl()), env, {})
    expect(res.status).toBe(200)

    const offers = await res.json()
    expect(Array.isArray(offers)).toBe(true)
    expect(offers.length).toBeGreaterThan(0)

    const offer = offers[0]
    for (const key of [
      'id', 'price', 'currency', 'airline', 'airlineCode', 'originAirport', 'destAirport',
      'departDate', 'returnDate', 'nights', 'stops', 'durationOutbound', 'durationReturn', 'deepLink',
    ]) {
      expect(offer).toHaveProperty(key)
    }
    expect(offer.originAirport).toBe('TLV')
    expect(offer.destAirport).toBe('BCN')
    expect(offer.price).toBe(401)
    expect(offer.nights).toBe(7)
    expect(offer.deepLink).toBeNull()
  })
})

describe('/search: metro fan-out', () => {
  it('a metro destination (TYO) fans out to its member airports', async () => {
    const fetchImpl = makeFetchStub({
      calendarFixtures: {
        'NRT|2027-06|7': BCN_ENTRY,
        'HND|2027-06|7': BCN_ENTRY,
      },
    })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl({ to: 'TYO' })), env, {})
    expect(res.status).toBe(200)
    const offers = await res.json()

    const destinations = new Set(offers.map((o) => o.destAirport))
    expect(destinations.has('NRT')).toBe(true)
    expect(destinations.has('HND')).toBe(true)
    expect(offers.every((o) => o.originAirport === 'TLV')).toBe(true)
    // Never the metro code itself — every offer names a concrete airport actually queried.
    expect(offers.every((o) => o.destAirport !== 'TYO')).toBe(true)
  })

  it('a metro origin (LON) fans out to its member airports', async () => {
    const fetchImpl = makeFetchStub({
      calendarFixtures: { 'BCN|2027-06|7': BCN_ENTRY },
    })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl({ from: 'LON', to: 'BCN' })), env, {})
    expect(res.status).toBe(200)
    const offers = await res.json()

    const origins = new Set(offers.map((o) => o.originAirport))
    expect(origins.has('LHR')).toBe(true)
    expect(origins.has('LGW')).toBe(true)
    expect(offers.every((o) => o.destAirport === 'BCN')).toBe(true)
  })

  it('caps a metro search at MAX_OFFERS, same ceiling as a plain search', async () => {
    // 24 distinct dates per airport x 2 airports would exceed MAX_OFFERS (24)
    // if the cap weren't re-applied after merging across pairs.
    const manyDates = {}
    for (let day = 1; day <= 24; day++) {
      const d = String(day).padStart(2, '0')
      manyDates[`2027-06-${d}`] = {
        airline: 'LY',
        departure_at: `2027-06-${d}T10:00:00+03:00`,
        return_at: `2027-06-${String(Math.min(day + 7, 28)).padStart(2, '0')}T10:00:00+02:00`,
        price: 300 + day,
        flight_number: 100 + day,
        transfers: 0,
      }
    }
    const fetchImpl = makeFetchStub({
      calendarFixtures: {
        'NRT|2027-06|7': manyDates,
        'HND|2027-06|7': manyDates,
      },
    })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl({ to: 'TYO' })), env, {})
    const offers = await res.json()
    expect(offers.length).toBeLessThanOrEqual(24)
  })
})

describe('/search: upstream no_data', () => {
  it('a not-flightable calendar response returns 200 with [], not an error', async () => {
    const fetchImpl = makeFetchStub({ notFlightable: true })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl()), env, {})
    expect(res.status).toBe(200)
    const offers = await res.json()
    expect(offers).toEqual([])
  })
})

describe('/search: upstream failure', () => {
  it('a repeated 5xx from calendar returns a clean 503, not a crash', async () => {
    const fetchImpl = makeFetchStub({ calendarStatus: 500 })
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl }

    const res = await worker.fetch(request(searchUrl()), env, {})
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('upstream_error')
    expect(typeof body.message).toBe('string')
    expect(body.message).not.toContain(TOKEN)
  })

  it('a missing Travelpayouts token yields a clean 500, not a crash', async () => {
    const fetchImpl = makeFetchStub({ calendarFixtures: { 'BCN|2027-06|7': BCN_ENTRY } })
    const env = { fetch: fetchImpl } // no TRAVELPAYOUTS_TOKEN

    const res = await worker.fetch(request(searchUrl()), env, {})
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('config_error')
  })
})

describe('/search: caching', () => {
  it('a cache hit avoids a second upstream call for an identical search', async () => {
    const fetchImpl = makeFetchStub({ calendarFixtures: { 'BCN|2027-06|7': BCN_ENTRY } })
    const kv = new FakeKV()
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl, FARE_CACHE: kv }

    const res1 = await worker.fetch(request(searchUrl()), env, {})
    expect(res1.status).toBe(200)
    const callsAfterFirst = fetchImpl.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const res2 = await worker.fetch(request(searchUrl()), env, {})
    expect(res2.status).toBe(200)
    expect(fetchImpl.calls.length).toBe(callsAfterFirst) // every call served from cache, zero new upstream hits
  })

  it('a cache hit reproduces the same offers as the live search', async () => {
    const fetchImpl = makeFetchStub({ calendarFixtures: { 'BCN|2027-06|7': BCN_ENTRY } })
    const kv = new FakeKV()
    const env = { TRAVELPAYOUTS_TOKEN: TOKEN, fetch: fetchImpl, FARE_CACHE: kv }

    const res1 = await worker.fetch(request(searchUrl()), env, {})
    const offers1 = await res1.json()

    const res2 = await worker.fetch(request(searchUrl()), env, {})
    const offers2 = await res2.json()

    expect(offers2.map((o) => o.price)).toEqual(offers1.map((o) => o.price))
  })
})
