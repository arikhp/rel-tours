import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TravelpayoutsError, fetchCalendar, fetchLatest } from '../../src/providers/travelpayouts.js'

// ─── Fixture loading (REL-11's committed, real-response fixtures) ───────────
// No live network calls anywhere in this suite: `fetch` is always supplied
// via the `options.fetch` dependency-injection point (see travelpayouts.js's
// module doc comment on why DI rather than stubbing globalThis.fetch), and
// every response body comes straight from api/test/fixtures/*.json.

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'))
}

/** Turns a fixture's `{ status, body }` into a Response, as `fetch` would return it. */
function responseFor(fixture) {
  return new Response(JSON.stringify(fixture.body), {
    status: fixture.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A `fetch` stub that always resolves with the given fixture, recording every call it received. */
function stubFetch(fixture) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return responseFor(fixture)
  }
  fn.calls = calls
  return fn
}

const SECRET_TOKEN = 'do-not-leak-this-token-9f3a7c'
const env = { TRAVELPAYOUTS_TOKEN: SECRET_TOKEN }

const bcnCall = { origin: 'TLV', destination: 'BCN', yearMonth: '2026-11', currency: 'USD' }
const bcnLatestCall = { origin: 'TLV', destination: 'BCN', currency: 'USD' }

describe('fetchCalendar: parsing a real calendar response', () => {
  it('parses every date in the fixture into a sorted array', async () => {
    const fixture = loadFixture('calendar-tlv-bcn-2026-11.json')
    const fetchImpl = stubFetch(fixture)

    const result = await fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    const expectedDates = Object.keys(fixture.body.data).sort()
    expect(result).toHaveLength(expectedDates.length)
    expect(result.map((r) => r.date)).toEqual(expectedDates)

    const first = result[0]
    const expectedFirstRow = fixture.body.data[first.date]
    expect(first.price).toBe(expectedFirstRow.price)
    expect(first.airline).toBe(expectedFirstRow.airline)
    expect(first.flightNumber).toBe(expectedFirstRow.flight_number)
    expect(first.departureAt).toBe(expectedFirstRow.departure_at)
    expect(first.returnAt).toBe(expectedFirstRow.return_at)
    expect(first.transfers).toBe(expectedFirstRow.transfers)
  })

  it('respects an optional `length` filter and issues the length param on the request', async () => {
    const fixture = loadFixture('calendar-tlv-bcn-2026-11-length7.json')
    const fetchImpl = stubFetch(fixture)

    const result = await fetchCalendar({ ...bcnCall, length: 7 }, env, { fetch: fetchImpl })

    expect(result).toHaveLength(Object.keys(fixture.body.data).length)
    expect(fetchImpl.calls[0].url).toContain('length=7')
  })

  it('always sends an explicit currency param, even though REL-11 collected this fixture without one', async () => {
    // calendar-tlv-bcn-2026-11.json's own requestUrl has no `currency` param at
    // all, and its body defaults to "currency": "rub" as a result — exactly
    // the trap DECISION.md warns about. This client must never repeat that
    // mistake, and must never trust the response's own currency field.
    const fixture = loadFixture('calendar-tlv-bcn-2026-11.json')
    expect(fixture.requestUrl).not.toContain('currency')
    expect(fixture.body.currency).toBe('rub')

    const fetchImpl = stubFetch(fixture)
    const result = await fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    expect(fetchImpl.calls[0].url).toContain('currency=usd')
    expect(result.every((r) => r.currency === 'USD')).toBe(true) // requested currency, not the fixture's 'rub'
  })

  it('sends the token via the X-Access-Token header, never as a query param', async () => {
    const fixture = loadFixture('calendar-tlv-bcn-2026-11.json')
    const fetchImpl = stubFetch(fixture)

    await fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    const { url, init } = fetchImpl.calls[0]
    expect(init.headers['X-Access-Token']).toBe(SECRET_TOKEN)
    expect(url).not.toContain(SECRET_TOKEN)
  })
})

describe('fetchCalendar: no data for route', () => {
  it('a 400 "not flightable" response throws a no_data TravelpayoutsError, not a generic one', async () => {
    const fixture = loadFixture('calendar-tlv-uln-2026-11.json')
    expect(fixture.status).toBe(400)
    const fetchImpl = stubFetch(fixture)

    const promise = fetchCalendar({ ...bcnCall, destination: 'ULN' }, env, { fetch: fetchImpl })

    await expect(promise).rejects.toBeInstanceOf(TravelpayoutsError)
    await expect(promise).rejects.toMatchObject({ kind: 'no_data', status: 400, code: 'not_flightable' })
    expect(fetchImpl.calls).toHaveLength(1) // a 400 is a real answer — never retried
  })

  it('a 200 with an empty calendar object is also treated as no_data', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ data: {}, currency: 'usd', success: true }), { status: 200 })

    await expect(fetchCalendar(bcnCall, env, { fetch: fetchImpl })).rejects.toMatchObject({
      kind: 'no_data',
      code: 'empty_response',
    })
  })
})

describe('fetchLatest: parsing a real latest response', () => {
  it('parses every row, mapping value/gate/number_of_changes to the normalized shape', async () => {
    const fixture = loadFixture('latest-tlv-bcn.json')
    const fetchImpl = stubFetch(fixture)

    const result = await fetchLatest(bcnLatestCall, env, { fetch: fetchImpl })

    expect(result).toHaveLength(fixture.body.data.length)
    const first = result[0]
    const expectedFirst = fixture.body.data[0]
    expect(first.departDate).toBe(expectedFirst.depart_date)
    expect(first.returnDate).toBe(expectedFirst.return_date)
    expect(first.price).toBe(expectedFirst.value)
    expect(first.currency).toBe('USD') // requested currency, per fetchCalendar's same rule
    expect(first.gate).toBe(expectedFirst.gate)
    expect(first.transfers).toBe(expectedFirst.number_of_changes)
    expect(first.durationMinutes).toBe(expectedFirst.duration)
  })

  it('treats synthetic rows (gate: "", duration/distance: 0) as missing duration, not a real zero', async () => {
    const fixture = loadFixture('latest-tlv-bcn.json')
    const syntheticRows = fixture.body.data.filter((r) => r.gate === '')
    expect(syntheticRows.length).toBeGreaterThan(0) // sanity: fixture actually has this case

    const fetchImpl = stubFetch(fixture)
    const result = await fetchLatest(bcnLatestCall, env, { fetch: fetchImpl })

    const normalizedSynthetic = result.filter((r) => r.gate === '' || r.gate === null)
    expect(normalizedSynthetic.length).toBe(syntheticRows.length)
    for (const row of normalizedSynthetic) {
      expect(row.durationMinutes).toBeNull()
      expect(row.distanceKm).toBeNull()
    }
  })

  it('passes an optional tripDuration through as trip_duration on the request', async () => {
    const fixture = loadFixture('latest-tlv-bcn-tripduration7.json')
    const fetchImpl = stubFetch(fixture)

    await fetchLatest({ ...bcnLatestCall, tripDuration: 7 }, env, { fetch: fetchImpl })

    expect(fetchImpl.calls[0].url).toContain('trip_duration=7')
  })
})

describe('fetchLatest: no data for route', () => {
  it('a 200 with an empty data array throws no_data — the shape `latest` uses instead of a 400', async () => {
    const fixture = loadFixture('latest-tlv-uln.json')
    expect(fixture.status).toBe(200)
    expect(fixture.body.data).toEqual([])
    const fetchImpl = stubFetch(fixture)

    const promise = fetchLatest({ ...bcnLatestCall, destination: 'ULN' }, env, { fetch: fetchImpl })

    await expect(promise).rejects.toBeInstanceOf(TravelpayoutsError)
    await expect(promise).rejects.toMatchObject({ kind: 'no_data', code: 'empty_response' })
  })
})

describe('HTTP error taxonomy: rate limiting and upstream breakage', () => {
  it('a 429 surfaces as rate_limited and is never retried', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: 'too many requests' }), { status: 429 })
    let calls = 0
    const counted = async (...args) => {
      calls++
      return fetchImpl(...args)
    }

    const promise = fetchLatest(bcnLatestCall, env, { fetch: counted })

    await expect(promise).rejects.toBeInstanceOf(TravelpayoutsError)
    await expect(promise).rejects.toMatchObject({ kind: 'rate_limited', status: 429 })
    expect(calls).toBe(1)
  })

  it('retries once on a 5xx and succeeds if the retry comes back clean', async () => {
    const fixture = loadFixture('latest-tlv-bcn.json')
    let calls = 0
    const fetchImpl = async () => {
      calls++
      if (calls === 1) return new Response('Bad Gateway', { status: 502 })
      return responseFor(fixture)
    }

    const result = await fetchLatest(bcnLatestCall, env, { fetch: fetchImpl })

    expect(calls).toBe(2)
    expect(result).toHaveLength(fixture.body.data.length)
  })

  it('gives up as upstream_error after the retry also fails', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return new Response('Service Unavailable', { status: 503 })
    }

    const promise = fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    await expect(promise).rejects.toBeInstanceOf(TravelpayoutsError)
    await expect(promise).rejects.toMatchObject({ kind: 'upstream_error', status: 503, code: 'http_5xx' })
    expect(calls).toBe(2) // one original attempt + exactly one retry, no more
  })

  it('a 400 that is not the not-flightable shape is invalid_request, distinct from no_data, and not retried', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return new Response(JSON.stringify({ error: 'bad request: missing origin' }), { status: 400 })
    }

    const promise = fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    await expect(promise).rejects.toMatchObject({ kind: 'invalid_request', status: 400 })
    expect(calls).toBe(1)
  })
})

describe('timeout: a hanging request aborts rather than hanging the caller', () => {
  it('aborts once the timeout elapses and retries, surfacing upstream_error after both attempts time out', async () => {
    let calls = 0
    // Never resolves on its own — only responds to the AbortController's signal,
    // exactly like a real hung connection would. Uses a short timeoutMs (not a
    // real multi-second wait) so the test stays fast.
    const hangingFetch = (url, init) =>
      new Promise((resolve, reject) => {
        calls++
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })

    const start = Date.now()
    const promise = fetchCalendar(bcnCall, env, { fetch: hangingFetch, timeoutMs: 25 })

    await expect(promise).rejects.toBeInstanceOf(TravelpayoutsError)
    await expect(promise).rejects.toMatchObject({ kind: 'upstream_error', code: 'timeout' })
    expect(calls).toBe(2) // timeout is retried once, same as a network failure
    expect(Date.now() - start).toBeLessThan(2000) // nowhere near a real multi-second hang
  })
})

describe('network failure (not a timeout, e.g. DNS/connection refused)', () => {
  it('a rejected fetch() surfaces as upstream_error after one retry', async () => {
    let calls = 0
    const failingFetch = async () => {
      calls++
      throw new Error('getaddrinfo ENOTFOUND api.travelpayouts.com')
    }

    const promise = fetchLatest(bcnLatestCall, env, { fetch: failingFetch })

    await expect(promise).rejects.toMatchObject({ kind: 'upstream_error', code: 'network_error' })
    expect(calls).toBe(2)
  })
})

describe('token redaction: the token never appears in a thrown error', () => {
  it('a fetch failure whose message echoes the token never lets that substring reach the thrown error', async () => {
    const throwingFetch = async () => {
      // Simulates a lower-level HTTP client that includes request context
      // (including the auth header) in its own error message.
      throw new Error(`connect ECONNREFUSED — request headers included X-Access-Token: ${SECRET_TOKEN}`)
    }

    let caught
    try {
      await fetchCalendar(bcnCall, env, { fetch: throwingFetch })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TravelpayoutsError)
    expect(caught.message).not.toContain(SECRET_TOKEN)
    expect(caught.message).toContain('[REDACTED]')
    expect(JSON.stringify(caught)).not.toContain(SECRET_TOKEN)
    expect(String(caught)).not.toContain(SECRET_TOKEN)
    expect(caught.stack ?? '').not.toContain(SECRET_TOKEN)
  })

  it('the token is passed only via the request header, never embedded in the request URL', async () => {
    const fixture = loadFixture('calendar-tlv-bcn-2026-11.json')
    const fetchImpl = stubFetch(fixture)

    await fetchCalendar(bcnCall, env, { fetch: fetchImpl })

    for (const { url } of fetchImpl.calls) {
      expect(url).not.toContain(SECRET_TOKEN)
    }
  })
})

describe('configuration and validation errors: fail before any network call', () => {
  it('a missing token throws config_error and never calls fetch', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
      throw new Error('should never be called')
    }

    await expect(fetchCalendar(bcnCall, {}, { fetch: fetchImpl })).rejects.toMatchObject({
      kind: 'config_error',
      code: 'missing_token',
    })
    expect(calls).toBe(0)
  })

  it('an empty-string token is treated the same as a missing one', async () => {
    await expect(
      fetchCalendar(bcnCall, { TRAVELPAYOUTS_TOKEN: '' }, { fetch: async () => { throw new Error('unreachable') } }),
    ).rejects.toMatchObject({ kind: 'config_error' })
  })

  it('missing required call params throws invalid_request and never calls fetch', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls++
    }

    await expect(
      fetchCalendar({ origin: 'TLV', destination: 'BCN' }, env, { fetch: fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid_request', code: 'missing_params' })
    expect(calls).toBe(0)
  })
})

describe('every failure is a typed TravelpayoutsError, never a bare Error or an unhandled rejection', () => {
  it.each([
    ['429 rate limit', async () => new Response('{}', { status: 429 })],
    ['400 not flightable', async () => new Response(JSON.stringify({ error: 'bad request: airport ULN: not flightable' }), { status: 400 })],
    ['200 empty data', async () => new Response(JSON.stringify({ data: {}, success: true }), { status: 200 })],
  ])('%s', async (_label, fetchImpl) => {
    let caught
    try {
      await fetchCalendar(bcnCall, env, { fetch: fetchImpl })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(TravelpayoutsError)
    expect(caught).toBeInstanceOf(Error)
    expect(caught.constructor).not.toBe(Error) // a distinguishable subclass, not a bare Error
    expect(typeof caught.kind).toBe('string')
  })
})
