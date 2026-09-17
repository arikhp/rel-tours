import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CRUISE_KMH,
  STOP_MINUTES,
  TAXI_MINUTES,
  estimateDuration,
  haversineKm,
  realDurationFrom,
  resolveDuration,
} from '../src/duration.js'

// ─── Real fixtures collected in REL-11's spike (test/fixtures/DECISION.md) ──

function loadFixtureRows(name) {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  const parsed = JSON.parse(readFileSync(path, 'utf-8'))
  return parsed.body.data
}

const bcnRows = loadFixtureRows('latest-tlv-bcn.json')
const tyoRows = loadFixtureRows('latest-tlv-tyo.json')
const lcaRows = loadFixtureRows('latest-tlv-lca.json')
const ulnRows = loadFixtureRows('latest-tlv-uln.json')

describe('realDurationFrom: real fixture rows', () => {
  it('TLV-BCN, TLV-TYO, TLV-LCA: every non-empty-gate row yields its own duration verbatim', () => {
    for (const rows of [bcnRows, tyoRows, lcaRows]) {
      const trustworthy = rows.filter((r) => r.gate !== '')
      expect(trustworthy.length).toBeGreaterThan(0) // sanity: fixture actually has real rows
      for (const row of trustworthy) {
        expect(realDurationFrom(row)).toBe(Math.round(row.duration))
      }
    }
  })

  it('TLV-BCN, TLV-TYO, TLV-LCA: every gate: "" row is treated as missing, not zero', () => {
    for (const rows of [bcnRows, tyoRows, lcaRows]) {
      const synthetic = rows.filter((r) => r.gate === '')
      expect(synthetic.length).toBeGreaterThan(0) // sanity: fixture actually has a synthetic row
      for (const row of synthetic) {
        expect(row.duration).toBe(0) // confirms the fixture really does report 0, not absent
        expect(realDurationFrom(row)).toBeNull()
      }
    }
  })

  it('TLV-ULN: an empty upstream data array yields no rows to even consider', () => {
    expect(ulnRows).toEqual([])
  })
})

describe('realDurationFrom: synthetic edge cases', () => {
  it('no row at all (undefined/null) is untrustworthy', () => {
    expect(realDurationFrom(undefined)).toBeNull()
    expect(realDurationFrom(null)).toBeNull()
  })

  it('a non-empty gate with a positive duration is trusted and rounded', () => {
    expect(realDurationFrom({ gate: 'Kupi.com', duration: 130.6 })).toBe(131)
  })

  it('gate: "" is untrustworthy even if duration happens to be positive', () => {
    expect(realDurationFrom({ gate: '', duration: 200 })).toBeNull()
  })

  it('a missing gate field entirely is untrustworthy', () => {
    expect(realDurationFrom({ duration: 200 })).toBeNull()
  })

  it('a whitespace-only gate is untrustworthy', () => {
    expect(realDurationFrom({ gate: '   ', duration: 200 })).toBeNull()
  })

  it('zero or negative duration is untrustworthy even with a real gate', () => {
    expect(realDurationFrom({ gate: 'Kupi.com', duration: 0 })).toBeNull()
    expect(realDurationFrom({ gate: 'Kupi.com', duration: -5 })).toBeNull()
  })

  it('a non-numeric duration is untrustworthy', () => {
    expect(realDurationFrom({ gate: 'Kupi.com', duration: 'unknown' })).toBeNull()
    expect(realDurationFrom({ gate: 'Kupi.com', duration: null })).toBeNull()
    expect(realDurationFrom({ gate: 'Kupi.com', duration: NaN })).toBeNull()
  })
})

describe('estimateDuration', () => {
  it('matches the extracted formula: nonstop + stops * STOP_MINUTES', () => {
    const distanceKm = 3081 // TLV-BCN, per the fixture's own `distance` field
    const nonstop = (distanceKm / CRUISE_KMH) * 60 + TAXI_MINUTES

    expect(estimateDuration({ distanceKm, stops: 0 })).toBe(Math.round(nonstop))
    expect(estimateDuration({ distanceKm, stops: 1 })).toBe(Math.round(nonstop + STOP_MINUTES))
    expect(estimateDuration({ distanceKm, stops: 2 })).toBe(Math.round(nonstop + 2 * STOP_MINUTES))
  })

  it('defaults stops to 0 (nonstop) when omitted', () => {
    expect(estimateDuration({ distanceKm: 340 })).toBe(estimateDuration({ distanceKm: 340, stops: 0 }))
  })

  it('never falls below the great-circle nonstop minimum', () => {
    const distanceKm = 9173 // TLV-TYO
    const nonstop = Math.round((distanceKm / CRUISE_KMH) * 60 + TAXI_MINUTES)

    expect(estimateDuration({ distanceKm, stops: 0 })).toBeGreaterThanOrEqual(nonstop)
    expect(estimateDuration({ distanceKm, stops: -3 })).toBe(nonstop) // clamped, not subtracted
  })

  it('an unusable distance degrades to the taxi-only floor rather than throwing', () => {
    expect(estimateDuration({ distanceKm: undefined, stops: 0 })).toBe(TAXI_MINUTES)
    expect(estimateDuration({ distanceKm: -50, stops: 0 })).toBe(TAXI_MINUTES)
    expect(estimateDuration({ distanceKm: NaN, stops: 0 })).toBe(TAXI_MINUTES)
  })
})

describe('resolveDuration: the real-vs-estimate decision', () => {
  it('a trustworthy real row wins, and durationEstimated is false', () => {
    const row = { gate: 'Trip.com', duration: 1395 }
    const result = resolveDuration({ row, distanceKm: 3081, stops: 1 })
    expect(result).toEqual({ duration: 1395, durationEstimated: false })
  })

  it('a gate: "" row falls through to the distance estimate, durationEstimated true', () => {
    const row = { gate: '', duration: 0 }
    const result = resolveDuration({ row, distanceKm: 3081, stops: 1 })
    expect(result.durationEstimated).toBe(true)
    expect(result.duration).toBe(estimateDuration({ distanceKm: 3081, stops: 1 }))
  })

  it('no row at all (the calendar-only, common case) estimates from distance', () => {
    const result = resolveDuration({ distanceKm: 340, stops: 0 })
    expect(result).toEqual({ duration: estimateDuration({ distanceKm: 340, stops: 0 }), durationEstimated: true })
  })

  it('every real fixture row across TLV-BCN/TYO/LCA resolves correctly end to end', () => {
    for (const rows of [bcnRows, tyoRows, lcaRows]) {
      for (const row of rows) {
        const result = resolveDuration({ row, distanceKm: row.distance || 1000, stops: row.number_of_changes })
        if (row.gate === '') {
          expect(result.durationEstimated).toBe(true)
          expect(result.duration).toBeGreaterThan(0)
        } else {
          expect(result).toEqual({ duration: Math.round(row.duration), durationEstimated: false })
        }
      }
    }
  })
})

describe('haversineKm', () => {
  it('is 0 between identical points', () => {
    expect(haversineKm({ lat: 32.01, lon: 34.89 }, { lat: 32.01, lon: 34.89 })).toBe(0)
  })

  it('roughly matches the great-circle TLV-BCN distance (fixture reports ~3081km actual flight distance)', () => {
    const tlv = { lat: 32.01, lon: 34.89 }
    const bcn = { lat: 41.3, lon: 2.08 }
    const km = haversineKm(tlv, bcn)
    expect(km).toBeGreaterThan(2900)
    expect(km).toBeLessThan(3300)
  })

  it('returns 0 when either point is missing', () => {
    expect(haversineKm(undefined, { lat: 1, lon: 1 })).toBe(0)
    expect(haversineKm({ lat: 1, lon: 1 }, null)).toBe(0)
  })
})
