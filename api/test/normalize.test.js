import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { estimateDuration } from '../src/duration.js'
import { MAX_OFFERS, normalizeOffers } from '../src/normalize.js'
import { fetchCalendar, fetchLatest } from '../src/providers/travelpayouts.js'

// ─── Fixture loading, run through the real REL-12 parser (fetchCalendar/ ────
// fetchLatest) so this suite exercises normalizeOffers() against exactly the
// row shape those functions actually hand back, not a hand-rolled synthetic
// approximation of it. Same fetch-stubbing approach as
// providers/travelpayouts.test.js: no live network calls anywhere here.

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'))
}

function responseFor(fixture) {
  return new Response(JSON.stringify(fixture.body), {
    status: fixture.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(fixture) {
  return async () => responseFor(fixture)
}

const env = { TRAVELPAYOUTS_TOKEN: 'test-token' }

async function loadCalendarRows(fixtureName, call) {
  return fetchCalendar(call, env, { fetch: stubFetch(loadFixture(fixtureName)) })
}

async function loadLatestRows(fixtureName, call) {
  return fetchLatest(call, env, { fetch: stubFetch(loadFixture(fixtureName)) })
}

const CONTRACT_FIELDS = [
  'id',
  'price',
  'currency',
  'airline',
  'airlineCode',
  'originAirport',
  'destAirport',
  'departDate',
  'returnDate',
  'nights',
  'stops',
  'durationOutbound',
  'durationReturn',
  'deepLink',
  'priceSource',
  'collectedAt',
  'durationEstimated',
]

const LCA_CALENDAR_CALL = { origin: 'TLV', destination: 'LCA', yearMonth: '2026-11', currency: 'USD' }
const LCA_LATEST_CALL = { origin: 'TLV', destination: 'LCA', currency: 'USD' }

const BASE_PARAMS = {
  origin: 'TLV',
  destination: 'LCA',
  earliest: '2026-10-01',
  latest: '2026-10-31',
  nights: 5,
  flexibility: 3,
  distanceKm: 340, // TLV-LCA great-circle distance, per the latest fixture's own `distance` field
  priceSource: 'live',
  collectedAt: '2026-09-17T18:00:00.000Z',
}

describe('normalizeOffers: real TLV-LCA fixtures — calendar primary, latest duration backfill', () => {
  it('every offer satisfies the full Offer contract (no undefined fields)', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const latestRows = await loadLatestRows('latest-tlv-lca.json', LCA_LATEST_CALL)

    const offers = normalizeOffers({ calendar, latestRows, ...BASE_PARAMS })

    expect(offers.length).toBeGreaterThan(0)
    for (const offer of offers) {
      for (const field of CONTRACT_FIELDS) {
        expect(offer).toHaveProperty(field)
        expect(offer[field]).not.toBeUndefined()
      }
    }
  })

  it('joins a calendar row to a latest row on exact departDate+returnDate: a real duration and its found_at win', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const latestRows = await loadLatestRows('latest-tlv-lca.json', LCA_LATEST_CALL)

    const offers = normalizeOffers({ calendar, latestRows, ...BASE_PARAMS })

    // Confirmed by direct inspection of both fixtures: calendar's 2026-10-17
    // row (price 4724, transfers 0) returns 2026-10-22, and latest carries a
    // row for that exact depart/return pair with gate "Farera", duration 135,
    // found_at "2026-09-15T13:12:34".
    const matched = offers.find((o) => o.departDate === '2026-10-17')
    expect(matched).toBeTruthy()
    expect(matched.returnDate).toBe('2026-10-22')
    expect(matched.nights).toBe(5)
    expect(matched.durationEstimated).toBe(false)
    expect(matched.durationOutbound).toBe(135)
    expect(matched.durationReturn).toBe(135)
    expect(matched.collectedAt).toBe('2026-09-15T13:12:34')
    expect(matched.price).toBe(4724) // passengers defaults to 1
  })

  it('a calendar row with no matching latest row falls back to the distance estimate and the batch collectedAt', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const latestRows = await loadLatestRows('latest-tlv-lca.json', LCA_LATEST_CALL)

    const offers = normalizeOffers({ calendar, latestRows, ...BASE_PARAMS })

    // 2026-10-14 -> 2026-10-19 (5 nights, transfers 0): confirmed absent from
    // the latest fixture's depart/return pairs.
    const unmatched = offers.find((o) => o.departDate === '2026-10-14')
    expect(unmatched).toBeTruthy()
    expect(unmatched.returnDate).toBe('2026-10-19')
    expect(unmatched.durationEstimated).toBe(true)
    expect(unmatched.durationOutbound).toBe(estimateDuration({ distanceKm: 340, stops: 0 }))
    expect(unmatched.durationReturn).toBe(unmatched.durationOutbound)
    expect(unmatched.collectedAt).toBe(BASE_PARAMS.collectedAt) // caller-supplied batch fallback, not a per-row value
  })

  it('sorts cheapest-first, caps at MAX_OFFERS, and every id is unique', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)

    const offers = normalizeOffers({
      calendar,
      latestRows: [],
      origin: 'TLV',
      destination: 'LCA',
      earliest: '2026-09-01',
      latest: '2027-09-30', // the fixture's whole date range
      nights: 5,
      flexibility: 10, // >100 candidate rows pass this bound (verified against the fixture) - the cap actually bites
      distanceKm: 340,
      priceSource: 'cached',
      collectedAt: BASE_PARAMS.collectedAt,
    })

    expect(offers).toHaveLength(MAX_OFFERS)
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i].price).toBeGreaterThanOrEqual(offers[i - 1].price)
    }
    expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length)
    expect(offers.every((o) => o.priceSource === 'cached')).toBe(true)
  })

  it('excludes offers whose departDate or returnDate falls outside the requested window', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)

    const offers = normalizeOffers({
      calendar,
      latestRows: [],
      origin: 'TLV',
      destination: 'LCA',
      earliest: '2026-10-10',
      latest: '2026-10-20',
      nights: 5,
      flexibility: 10,
      distanceKm: 340,
      priceSource: 'live',
      collectedAt: BASE_PARAMS.collectedAt,
    })

    expect(offers.length).toBeGreaterThan(0)
    for (const offer of offers) {
      expect(offer.departDate >= '2026-10-10' && offer.departDate <= '2026-10-20').toBe(true)
      expect(offer.returnDate >= '2026-10-10' && offer.returnDate <= '2026-10-20').toBe(true)
    }
  })

  it('excludes trips whose length falls outside nights +/- flexibility', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)

    const offers = normalizeOffers({
      calendar,
      latestRows: [],
      origin: 'TLV',
      destination: 'LCA',
      earliest: '2026-09-01',
      latest: '2027-09-30',
      nights: 5,
      flexibility: 0,
      distanceKm: 340,
      priceSource: 'live',
      collectedAt: BASE_PARAMS.collectedAt,
    })

    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.nights === 5)).toBe(true)
  })

  it('multiplies the per-person calendar price by the passenger count', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)

    const solo = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS, passengers: 1 })
    const family = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS, passengers: 4 })

    expect(family.length).toBe(solo.length)
    const soloByDate = new Map(solo.map((o) => [o.departDate, o.price]))
    for (const offer of family) {
      expect(offer.price).toBe(soloByDate.get(offer.departDate) * 4)
    }
  })

  it('carries originAirport/destAirport straight from the plain origin/destination inputs', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const offers = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS })

    expect(offers.every((o) => o.originAirport === 'TLV' && o.destAirport === 'LCA')).toBe(true)
  })

  it('deepLink is always null — no deep-link builder exists yet (REL-25/REL-26)', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const offers = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS })

    expect(offers.every((o) => o.deepLink === null)).toBe(true)
  })
})

describe('normalizeOffers: a corrupted upstream entry is skipped, not thrown on', () => {
  it('a row missing `price` is skipped; every other row still normalizes the same as the baseline', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const baseline = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS })
    expect(baseline.some((o) => o.departDate === '2026-10-17')).toBe(true) // sanity: row survives uncorrupted

    const corrupted = calendar.map((row) => (row.date === '2026-10-17' ? { ...row, price: undefined } : row))

    expect(() => normalizeOffers({ calendar: corrupted, latestRows: [], ...BASE_PARAMS })).not.toThrow()
    const offers = normalizeOffers({ calendar: corrupted, latestRows: [], ...BASE_PARAMS })

    expect(offers.some((o) => o.departDate === '2026-10-17')).toBe(false)
    expect(offers).toHaveLength(baseline.length - 1)
    expect(offers.map((o) => o.departDate).sort()).toEqual(
      baseline.filter((o) => o.departDate !== '2026-10-17').map((o) => o.departDate).sort(),
    )
  })

  it('a row missing `date` is skipped; every other row still normalizes', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const baseline = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS })

    const corrupted = calendar.map((row) => {
      if (row.date !== '2026-10-17') return row
      const { date: _date, ...rest } = row
      return rest
    })

    const offers = normalizeOffers({ calendar: corrupted, latestRows: [], ...BASE_PARAMS })
    expect(offers.some((o) => o.departDate === '2026-10-17')).toBe(false)
    expect(offers).toHaveLength(baseline.length - 1)
  })

  it('a row with an unparseable `returnAt` is skipped', async () => {
    const calendar = await loadCalendarRows('calendar-tlv-lca-2026-11.json', LCA_CALENDAR_CALL)
    const baseline = normalizeOffers({ calendar, latestRows: [], ...BASE_PARAMS })

    const corrupted = calendar.map((row) =>
      row.date === '2026-10-17' ? { ...row, returnAt: 'not-a-date' } : row,
    )

    const offers = normalizeOffers({ calendar: corrupted, latestRows: [], ...BASE_PARAMS })
    expect(offers.some((o) => o.departDate === '2026-10-17')).toBe(false)
    expect(offers).toHaveLength(baseline.length - 1)
  })

  it('never throws on thoroughly garbage input', () => {
    expect(() => normalizeOffers()).not.toThrow()
    expect(normalizeOffers()).toEqual([])
    expect(() =>
      normalizeOffers({
        calendar: [null, undefined, {}, { price: 'not-a-number' }, { price: -5, date: '2026-01-01' }],
        latestRows: [null, {}, { departDate: 1, returnDate: 2 }],
        origin: 'TLV',
        destination: 'BCN',
        earliest: '2026-01-01',
        latest: '2026-01-31',
        nights: 3,
      }),
    ).not.toThrow()
  })
})

describe('normalizeOffers: synthetic edge cases', () => {
  const params = {
    origin: 'TLV',
    destination: 'BCN',
    earliest: '2026-01-01',
    latest: '2026-01-31',
    nights: 5,
    flexibility: 0,
    distanceKm: 1000,
    priceSource: 'live',
    collectedAt: '2026-01-01T00:00:00.000Z',
  }

  function calendarRow(overrides = {}) {
    return {
      date: '2026-01-10',
      price: 100,
      currency: 'USD',
      airline: 'LY',
      flightNumber: 123,
      departureAt: '2026-01-10T10:00:00+02:00',
      returnAt: '2026-01-15T10:00:00+02:00',
      transfers: 0,
      ...overrides,
    }
  }

  it('returns [] for empty calendar/latest input — a normal "no data" case, not an error', () => {
    expect(normalizeOffers({ calendar: [], latestRows: [], ...params })).toEqual([])
  })

  it('returns [] when origin or destination is missing', () => {
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, origin: undefined })).toEqual([])
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, destination: '' })).toEqual([])
  })

  it('returns [] when the window is inverted or unparseable', () => {
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, earliest: '2026-02-01', latest: '2026-01-01' })).toEqual([])
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, earliest: 'not-a-date' })).toEqual([])
  })

  it('returns [] when nights is missing or invalid', () => {
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, nights: undefined })).toEqual([])
    expect(normalizeOffers({ calendar: [calendarRow()], ...params, nights: 0 })).toEqual([])
  })

  it('falls back airline/airlineCode to a documented placeholder when the calendar row has none', () => {
    const offers = normalizeOffers({ calendar: [calendarRow({ airline: null })], latestRows: [], ...params })
    expect(offers).toHaveLength(1)
    expect(offers[0].airline).toBe(offers[0].airlineCode)
    expect(typeof offers[0].airlineCode).toBe('string')
    expect(offers[0].airlineCode.length).toBeGreaterThan(0)
  })

  it('airline equals airlineCode when a real code is present (no name lookup exists yet — REL-16)', () => {
    const offers = normalizeOffers({ calendar: [calendarRow({ airline: 'LY' })], latestRows: [], ...params })
    expect(offers[0].airlineCode).toBe('LY')
    expect(offers[0].airline).toBe('LY')
  })

  it('defaults missing/invalid transfers to 0 stops rather than skipping the row', () => {
    expect(normalizeOffers({ calendar: [calendarRow({ transfers: null })], latestRows: [], ...params })[0].stops).toBe(0)
    expect(normalizeOffers({ calendar: [calendarRow({ transfers: -1 })], latestRows: [], ...params })[0].stops).toBe(0)
  })

  it('when two latest rows collide on the same date pair, the trustworthy real duration wins over a synthetic gate:"" row', () => {
    // Shaped exactly as fetchLatest() returns a row (durationMinutes, not
    // duration — see normalize.js's "bridging a naming seam" doc comment).
    const synthFirst = [
      { departDate: '2026-01-10', returnDate: '2026-01-15', gate: '', durationMinutes: null, distanceKm: null },
      { departDate: '2026-01-10', returnDate: '2026-01-15', gate: 'Kupi.com', durationMinutes: 250, distanceKm: 1000 },
    ]
    const realFirst = [
      { departDate: '2026-01-10', returnDate: '2026-01-15', gate: 'Kupi.com', durationMinutes: 250, distanceKm: 1000 },
      { departDate: '2026-01-10', returnDate: '2026-01-15', gate: '', durationMinutes: null, distanceKm: null },
    ]

    for (const latestRows of [synthFirst, realFirst]) {
      const offers = normalizeOffers({ calendar: [calendarRow()], latestRows, ...params })
      expect(offers[0].durationEstimated).toBe(false)
      expect(offers[0].durationOutbound).toBe(250)
    }
  })

  it('defaults collectedAt to "now" when the caller omits it, rather than leaving it undefined', () => {
    const offers = normalizeOffers({ calendar: [calendarRow()], latestRows: [], ...params, collectedAt: undefined })
    expect(typeof offers[0].collectedAt).toBe('string')
    expect(new Date(offers[0].collectedAt).toString()).not.toBe('Invalid Date')
  })

  it('rounds price to the nearest whole unit after multiplying by passengers', () => {
    const offers = normalizeOffers({ calendar: [calendarRow({ price: 99.6 })], latestRows: [], ...params, passengers: 3 })
    expect(offers[0].price).toBe(Math.round(99.6 * 3))
  })
})
