import { describe, expect, it } from 'vitest'
import { MAX_AIRPORTS_PER_METRO, METRO_AIRPORTS, resolveAirportPairs, resolveAirports } from '../src/metros.js'

// ─── Drift guard: this table must match src/data/airports.js's `metros`  ───
// array exactly (code -> airports, source order) at all times. If someone
// edits the front-end table without updating api/src/metros.js, this test
// fails instead of the mismatch shipping silently. See metros.js's
// "DRIFT RISK" comment.
const EXPECTED_METRO_AIRPORTS = {
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

describe('METRO_AIRPORTS: matches src/data/airports.js exactly', () => {
  it('has exactly the 13 metro codes defined in the front-end table', () => {
    expect(Object.keys(METRO_AIRPORTS).sort()).toEqual(Object.keys(EXPECTED_METRO_AIRPORTS).sort())
  })

  for (const [code, airports] of Object.entries(EXPECTED_METRO_AIRPORTS)) {
    it(`${code} -> [${airports.join(', ')}] (order matters)`, () => {
      expect(METRO_AIRPORTS[code]).toEqual(airports)
    })
  }

  it('does not include Istanbul (IST) or Shanghai (SHA) — code-collision exclusion', () => {
    // src/data/airports.js deliberately omits these: their real IATA metro
    // codes collide with an airport code, which would make a typed code
    // ambiguous. This table must match that exclusion.
    expect(METRO_AIRPORTS.IST).toBeUndefined()
    expect(METRO_AIRPORTS.SHA).toBeUndefined()
  })
})

describe('resolveAirports: plain airports pass through unchanged', () => {
  it('TLV (a plain, non-metro airport) resolves to itself, exactly 1 code', () => {
    expect(resolveAirports('TLV')).toEqual(['TLV'])
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveAirports('tlv')).toEqual(['TLV'])
    expect(resolveAirports('  tlv  ')).toEqual(['TLV'])
  })
})

describe('resolveAirports: metros fan out, capped at 2', () => {
  it('TYO -> [NRT, HND], both members, order matches the source table', () => {
    expect(resolveAirports('TYO')).toEqual(['NRT', 'HND'])
  })

  it('LON -> exactly 2 codes ([LHR, LGW]), not all 5 members', () => {
    const result = resolveAirports('LON')
    expect(result).toEqual(['LHR', 'LGW'])
    expect(result).toHaveLength(2)
  })

  it('NYC -> [JFK, EWR], not all 3 members', () => {
    expect(resolveAirports('NYC')).toEqual(['JFK', 'EWR'])
  })

  it('WAS -> [IAD, DCA], not all 3 members', () => {
    expect(resolveAirports('WAS')).toEqual(['IAD', 'DCA'])
  })

  it('a metro with exactly 2 members returns both, unaffected by the cap', () => {
    expect(resolveAirports('PAR')).toEqual(['CDG', 'ORY'])
    expect(resolveAirports('TYO')).toHaveLength(MAX_AIRPORTS_PER_METRO)
  })

  it('is case-insensitive for metro codes too', () => {
    expect(resolveAirports('tyo')).toEqual(['NRT', 'HND'])
  })
})

describe('resolveAirports: Istanbul/Shanghai exclusion behaves like a plain airport', () => {
  it('IST resolves to itself, not a metro fan-out', () => {
    expect(resolveAirports('IST')).toEqual(['IST'])
  })

  it('SHA resolves to itself, not a metro fan-out', () => {
    expect(resolveAirports('SHA')).toEqual(['SHA'])
  })
})

describe('resolveAirports: unknown/garbage codes never throw', () => {
  it('an unrecognized code is returned as-is, for the caller to fail elsewhere', () => {
    expect(resolveAirports('ZZZ')).toEqual(['ZZZ'])
  })

  it('empty/missing input degrades to an empty-string single-element array rather than throwing', () => {
    expect(() => resolveAirports('')).not.toThrow()
    expect(() => resolveAirports(undefined)).not.toThrow()
    expect(() => resolveAirports(null)).not.toThrow()
    expect(resolveAirports('')).toEqual([''])
    expect(resolveAirports(undefined)).toEqual([''])
    expect(resolveAirports(null)).toEqual([''])
  })
})

describe('resolveAirportPairs', () => {
  it('plain airport to plain airport yields exactly 1 pair', () => {
    expect(resolveAirportPairs('TLV', 'BCN')).toEqual([{ origin: 'TLV', destination: 'BCN' }])
  })

  it('TLV -> LON yields 2 pairs, one per capped LON airport', () => {
    expect(resolveAirportPairs('TLV', 'LON')).toEqual([
      { origin: 'TLV', destination: 'LHR' },
      { origin: 'TLV', destination: 'LGW' },
    ])
  })

  it('metro -> metro yields the full cross-product, capped on both sides', () => {
    expect(resolveAirportPairs('TYO', 'LON')).toEqual([
      { origin: 'NRT', destination: 'LHR' },
      { origin: 'NRT', destination: 'LGW' },
      { origin: 'HND', destination: 'LHR' },
      { origin: 'HND', destination: 'LGW' },
    ])
  })
})
