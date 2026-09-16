import { describe, expect, it } from 'vitest'
import { MAX_CALLS, cacheKeyFor, planCalls, runPlanned } from '../src/planner.js'

describe('planCalls: month expansion', () => {
  it('a single-day window produces exactly one call per valid trip length', () => {
    // earliest === latest -> exactly one calendar month touched. flexibility 2
    // around nights=7 gives 5 valid lengths (5,6,7,8,9), none discarded.
    const calls = planCalls({
      from: 'tlv',
      to: 'bcn',
      earliest: '2026-05-01',
      latest: '2026-05-01',
      nights: 7,
      flexibility: 2,
    })

    expect(calls).toHaveLength(5)
    expect(calls.every((c) => c.yearMonth === '2026-05')).toBe(true)
    expect(calls.map((c) => c.length)).toEqual([5, 6, 7, 8, 9])
  })

  it('expands a window crossing a month boundary into one call per month touched', () => {
    // Jan 28 - Feb 3 touches exactly two calendar months.
    const calls = planCalls({
      from: 'TLV',
      to: 'BCN',
      earliest: '2026-01-28',
      latest: '2026-02-03',
      nights: 3,
      flexibility: 0,
    })

    const months = [...new Set(calls.map((c) => c.yearMonth))].sort()
    expect(months).toEqual(['2026-01', '2026-02'])
    expect(calls).toHaveLength(2) // 2 months x 1 length (flexibility 0)
  })
})

describe('planCalls: trip length expansion', () => {
  it('discards trip lengths below 1 night', () => {
    // nights=1, flexibility=3 -> raw offsets give -2,-1,0,1,2,3,4; only
    // 1,2,3,4 are >= 1 night.
    const calls = planCalls({
      from: 'TLV',
      to: 'BCN',
      earliest: '2026-05-01',
      latest: '2026-05-01',
      nights: 1,
      flexibility: 3,
    })

    expect(calls.some((c) => c.length < 1)).toBe(false)
    expect(calls.map((c) => c.length).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })
})

describe('planCalls: the 28-call ceiling', () => {
  it('a 90-day window with flexibility 3 produces exactly 28 calls (the documented worst case)', () => {
    // Jan 15 -> Apr 14, 2026 is a 90-day inclusive window (16 remaining days
    // of Jan + 28 of Feb (2026 is not a leap year) + 31 of Mar + 14 of Apr =
    // 89 days between the bounds, i.e. a 90-day window) that touches 4
    // distinct calendar months (Jan, Feb, Mar, Apr). nights=7, flexibility=3
    // gives 7 valid lengths (4..10, none discarded since 7-3=4 >= 1).
    // 4 months x 7 lengths = 28 calls exactly -> this is the real worst case
    // the ceiling is tuned against, not an arbitrary number.
    const calls = planCalls({
      from: 'TLV',
      to: 'BCN',
      earliest: '2026-01-15',
      latest: '2026-04-14',
      nights: 7,
      flexibility: 3,
    })

    const months = [...new Set(calls.map((c) => c.yearMonth))].sort()
    expect(months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(calls).toHaveLength(28)
    expect(calls.length).toBeLessThanOrEqual(MAX_CALLS)
  })

  it('trims from the outermost flexibility offsets first when the cross-product exceeds the ceiling', () => {
    // Jan-Jun 2026 touches 6 calendar months. nights=10, flexibility=3 gives
    // 7 valid lengths (7..13), so the naive cross-product is 6 x 7 = 42,
    // well over MAX_CALLS (28). Trimming removes whole offset groups
    // (widest first: +3, -3, +2, ...) until under the ceiling:
    //   42 -> drop offset +3 (length 13, 6 calls)  -> 36
    //      -> drop offset -3 (length 7,  6 calls)  -> 30
    //      -> drop offset +2 (length 12, 6 calls)  -> 24  (<= 28, stop)
    // leaving offsets {-2,-1,0,+1} -> lengths {8,9,10,11} across all 6 months.
    const calls = planCalls({
      from: 'TLV',
      to: 'BCN',
      earliest: '2026-01-01',
      latest: '2026-06-30',
      nights: 10,
      flexibility: 3,
    })

    expect(calls.length).toBeLessThanOrEqual(MAX_CALLS)
    expect(calls).toHaveLength(24)

    const lengths = [...new Set(calls.map((c) => c.length))].sort((a, b) => a - b)
    expect(lengths).toEqual([8, 9, 10, 11])
    // The exact requested `nights` is never trimmed away.
    expect(lengths).toContain(10)
    // The widest offsets (7 and 12, i.e. -3 and +2 relative to nights=10... )
    expect(calls.some((c) => c.length === 13)).toBe(false)
    expect(calls.some((c) => c.length === 7)).toBe(false)
    expect(calls.some((c) => c.length === 12)).toBe(false)

    const months = [...new Set(calls.map((c) => c.yearMonth))].sort()
    expect(months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })
})

describe('planCalls: determinism', () => {
  it('identical criteria produce an identical call list, in the same order, every time', () => {
    const criteria = {
      from: 'tlv',
      to: 'bcn',
      earliest: '2026-01-15',
      latest: '2026-04-14',
      nights: 7,
      flexibility: 3,
      passengers: 2,
      cabin: 'economy',
    }

    const first = planCalls(criteria)
    const second = planCalls({ ...criteria })

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('is ordered by yearMonth ascending, then by length ascending', () => {
    const calls = planCalls({
      from: 'TLV',
      to: 'BCN',
      earliest: '2026-01-28',
      latest: '2026-02-03',
      nights: 5,
      flexibility: 1,
    })

    for (let i = 1; i < calls.length; i++) {
      const prev = calls[i - 1]
      const curr = calls[i]
      const inOrder =
        prev.yearMonth < curr.yearMonth || (prev.yearMonth === curr.yearMonth && prev.length < curr.length)
      expect(inOrder).toBe(true)
    }
  })
})

describe('planCalls: call descriptor shape', () => {
  it('carries origin, destination, yearMonth, length and a default currency', () => {
    const [call] = planCalls({
      from: 'tlv',
      to: 'bcn',
      earliest: '2026-05-01',
      latest: '2026-05-01',
      nights: 7,
      flexibility: 0,
    })

    expect(call).toEqual({
      origin: 'TLV',
      destination: 'BCN',
      yearMonth: '2026-05',
      length: 7,
      currency: 'USD',
    })
  })

  it('builds the REL-15 cache key format from a call descriptor', () => {
    const call = { origin: 'TLV', destination: 'BCN', yearMonth: '2026-05', length: 7, currency: 'USD' }
    expect(cacheKeyFor(call)).toBe('tp:v1:TLV:BCN:2026-05:7:USD')
  })
})

describe('runPlanned: bounded concurrency', () => {
  it('never runs more than `concurrency` tasks at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 10 }, (_, i) => i)

    const results = await runPlanned(
      items,
      async (item) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        // Yield a few times so overlapping tasks actually overlap in time,
        // proving the cap is enforced rather than trivially satisfied by
        // synchronous execution.
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return item * 2
      },
      { concurrency: 3 },
    )

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBe(3) // with 10 items and a cap of 3, the cap is actually reached
    expect(results).toEqual(items.map((i) => i * 2))
  })

  it('preserves input order in the results regardless of completion order', async () => {
    // Earlier items take longer than later ones, so completion order is
    // reversed relative to input order; results must still come back in
    // input order.
    const delays = [30, 20, 10, 5]
    const results = await runPlanned(
      delays,
      async (delay, i) => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return i
      },
      { concurrency: 4 },
    )

    expect(results).toEqual([0, 1, 2, 3])
  })

  it('defaults to a bounded concurrency when none is specified', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 12 }, (_, i) => i)

    await runPlanned(items, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
    })

    expect(maxInFlight).toBeGreaterThan(0)
    expect(maxInFlight).toBeLessThan(items.length) // some bound is applied, not "all at once"
  })
})
