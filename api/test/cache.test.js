import { describe, expect, it } from 'vitest'
import { cacheKeyFor } from '../src/planner.js'
import {
  CACHE_TTL_SECONDS,
  DAILY_WRITE_BUDGET,
  getCached,
  setCached,
  writeCounterKeyFor,
} from '../src/cache.js'

// ─── Lightweight KV mocks (same pattern as index.test.js: plain JS objects/
// classes implementing the subset of the KV namespace API this module uses —
// get/put — returning Promises. No Miniflare, no wrangler pool.) ────────────

/**
 * In-memory KV stand-in that honours `expirationTtl` the way real Cloudflare
 * KV does: an entry put with `expirationTtl: N` seconds stops being
 * `get()`-able N seconds later. Time is driven by an injectable clock so
 * tests can simulate expiry deterministically without real timers.
 */
class FakeKV {
  constructor({ now = () => Date.now() } = {}) {
    this.store = new Map()
    this.now = now
    this.putCalls = []
  }

  async get(key) {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt != null && this.now() >= entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async put(key, value, options = {}) {
    this.putCalls.push({ key, value, options })
    const expiresAt = options.expirationTtl ? this.now() + options.expirationTtl * 1000 : null
    this.store.set(key, { value, expiresAt })
  }

  // Test helper: seed a raw counter/value without going through setCached.
  seed(key, value, { expirationTtl } = {}) {
    const expiresAt = expirationTtl ? this.now() + expirationTtl * 1000 : null
    this.store.set(key, { value: String(value), expiresAt })
  }
}

/** KV stand-in where every call throws, simulating KV being entirely down. */
class ThrowingKV {
  async get() {
    throw new Error('kv get is down')
  }
  async put() {
    throw new Error('kv put is down')
  }
}

const sampleCall = { origin: 'TLV', destination: 'BCN', yearMonth: '2026-05', length: 7, currency: 'USD' }
const sampleValue = { fares: [{ price: 412, currency: 'USD' }] }

describe('getCached / setCached: hit and miss', () => {
  it('a miss returns null and never calls upstream', async () => {
    const kv = new FakeKV()
    let upstreamCalls = 0
    const fetchLive = async () => {
      upstreamCalls++
      return sampleValue
    }

    const cached = await getCached(kv, sampleCall)
    expect(cached).toBeNull()

    // Caller falls back to upstream on a miss — this is the caller's
    // responsibility, not the cache's, but it demonstrates the composition.
    if (!cached) await fetchLive()
    expect(upstreamCalls).toBe(1)
  })

  it('a second identical search hits the cache and performs zero upstream calls', async () => {
    const kv = new FakeKV()
    let upstreamCalls = 0
    const fetchLive = async () => {
      upstreamCalls++
      return sampleValue
    }

    async function search(call) {
      const cached = await getCached(kv, call)
      if (cached) return cached
      const live = await fetchLive()
      await setCached(kv, call, live)
      return live
    }

    const first = await search(sampleCall)
    const second = await search({ ...sampleCall })

    expect(first).toEqual(sampleValue)
    expect(second).toEqual(sampleValue)
    expect(upstreamCalls).toBe(1) // the second search was served entirely from cache
  })

  it('setCached stores the value and getCached then returns it verbatim', async () => {
    const kv = new FakeKV()
    const wrote = await setCached(kv, sampleCall, sampleValue)
    expect(wrote).toBe(true)

    const cached = await getCached(kv, sampleCall)
    expect(cached).toEqual(sampleValue)
  })

  it('never writes to KV on a read hit — only a genuine miss gets populated', async () => {
    const kv = new FakeKV()
    await setCached(kv, sampleCall, sampleValue) // the one legitimate write

    const putCallsBeforeReads = kv.putCalls.length
    await getCached(kv, sampleCall)
    await getCached(kv, sampleCall)
    await getCached(kv, sampleCall)

    expect(kv.putCalls.length).toBe(putCallsBeforeReads) // reads added zero writes
  })

  it('accepts a pre-built key string as an alternative to a Call descriptor', async () => {
    const kv = new FakeKV()
    const key = cacheKeyFor(sampleCall)

    await setCached(kv, key, sampleValue)
    expect(await getCached(kv, sampleCall)).toEqual(sampleValue) // Call form reads back the string-keyed write
    expect(await getCached(kv, key)).toEqual(sampleValue)
  })

  it('a corrupt/non-JSON stored value is treated as a miss, not a thrown error', async () => {
    const kv = new FakeKV()
    kv.seed(cacheKeyFor(sampleCall), 'not-json-{{{')

    await expect(getCached(kv, sampleCall)).resolves.toBeNull()
  })
})

describe('cache key: currency isolation', () => {
  it('a USD hit is not served for an identical EUR request', async () => {
    const kv = new FakeKV()
    const usdCall = { ...sampleCall, currency: 'USD' }
    const eurCall = { ...sampleCall, currency: 'EUR' }

    await setCached(kv, usdCall, { price: 412, currency: 'USD' })

    expect(await getCached(kv, usdCall)).toEqual({ price: 412, currency: 'USD' })
    expect(await getCached(kv, eurCall)).toBeNull() // falls out of cacheKeyFor() including currency in the key
    expect(cacheKeyFor(usdCall)).not.toBe(cacheKeyFor(eurCall))
  })
})

describe('TTL', () => {
  it('writes with expirationTtl set to CACHE_TTL_SECONDS (~6 hours)', async () => {
    const kv = new FakeKV()
    await setCached(kv, sampleCall, sampleValue)

    expect(CACHE_TTL_SECONDS).toBe(6 * 60 * 60)
    const valueWrite = kv.putCalls.find((c) => c.key === cacheKeyFor(sampleCall))
    expect(valueWrite.options.expirationTtl).toBe(CACHE_TTL_SECONDS)
  })

  it('a value is still a hit just before TTL expiry and a miss just after', async () => {
    const clock = { t: 0 }
    const kv = new FakeKV({ now: () => clock.t })

    await setCached(kv, sampleCall, sampleValue)

    clock.t += (CACHE_TTL_SECONDS - 1) * 1000
    expect(await getCached(kv, sampleCall)).toEqual(sampleValue)

    clock.t += 2000 // now just past the 6-hour TTL
    expect(await getCached(kv, sampleCall)).toBeNull()
  })
})

describe('daily write budget', () => {
  it('writes succeed and the counter increments while under budget', async () => {
    const kv = new FakeKV()
    kv.seed(writeCounterKeyFor(), 997)

    expect(await setCached(kv, { ...sampleCall, length: 5 }, sampleValue)).toBe(true)
    expect(await kv.get(writeCounterKeyFor())).toBe('998')

    expect(await setCached(kv, { ...sampleCall, length: 6 }, sampleValue)).toBe(true)
    expect(await kv.get(writeCounterKeyFor())).toBe('999')

    expect(await setCached(kv, { ...sampleCall, length: 7 }, sampleValue)).toBe(true)
    expect(await kv.get(writeCounterKeyFor())).toBe('1000')
  })

  it('once the budget is spent, setCached reports false and skips the write — the miss still resolves cleanly', async () => {
    const kv = new FakeKV()
    kv.seed(writeCounterKeyFor(), DAILY_WRITE_BUDGET)

    let upstreamCalls = 0
    const fetchLive = async () => {
      upstreamCalls++
      return sampleValue
    }

    async function search(call) {
      const cached = await getCached(kv, call)
      if (cached) return cached
      const live = await fetchLive()
      const wrote = await setCached(kv, call, live)
      return { live, wrote }
    }

    const result = await search(sampleCall)

    expect(result.wrote).toBe(false) // budget exhausted, write skipped
    expect(result.live).toEqual(sampleValue) // the search itself still succeeds
    expect(upstreamCalls).toBe(1)
    expect(await getCached(kv, sampleCall)).toBeNull() // nothing was actually cached
  })

  it('does not bump the counter past the budget when already exhausted', async () => {
    const kv = new FakeKV()
    kv.seed(writeCounterKeyFor(), DAILY_WRITE_BUDGET)

    await setCached(kv, sampleCall, sampleValue)

    expect(await kv.get(writeCounterKeyFor())).toBe(String(DAILY_WRITE_BUDGET)) // untouched
  })

  it('the write-counter key is namespaced by today\'s UTC date', () => {
    const key = writeCounterKeyFor(new Date('2026-05-17T23:59:00Z'))
    expect(key).toBe('tp:v1:writes:2026-05-17')
    expect(writeCounterKeyFor()).toMatch(/^tp:v1:writes:\d{4}-\d{2}-\d{2}$/)
  })
})

describe('failure modes: KV errors and unavailability', () => {
  it('getCached degrades to null (not a throw) when KV.get throws', async () => {
    const kv = new ThrowingKV()
    await expect(getCached(kv, sampleCall)).resolves.toBeNull()
  })

  it('setCached degrades to false (not a throw) when KV.put throws', async () => {
    const kv = new ThrowingKV()
    await expect(setCached(kv, sampleCall, sampleValue)).resolves.toBe(false)
  })

  it('a cache write failure never fails the caller\'s search', async () => {
    const kv = new ThrowingKV()
    let searchSucceeded = false

    async function search(call) {
      const cached = await getCached(kv, call)
      if (cached) return cached
      const live = sampleValue // stand-in for a live upstream fetch
      await setCached(kv, call, live) // must not throw even though KV is down
      searchSucceeded = true
      return live
    }

    const result = await search(sampleCall)
    expect(searchSucceeded).toBe(true)
    expect(result).toEqual(sampleValue)
  })

  it('no KV binding at all (undefined) degrades to always-miss, never-cache, no throw', async () => {
    await expect(getCached(undefined, sampleCall)).resolves.toBeNull()
    await expect(setCached(undefined, sampleCall, sampleValue)).resolves.toBe(false)
  })

  it('no KV binding at all (null) degrades to always-miss, never-cache, no throw', async () => {
    await expect(getCached(null, sampleCall)).resolves.toBeNull()
    await expect(setCached(null, sampleCall, sampleValue)).resolves.toBe(false)
  })

  it('with KV entirely unavailable, repeated searches fall through to upstream every time', async () => {
    let upstreamCalls = 0
    async function search(call) {
      const cached = await getCached(undefined, call)
      if (cached) return cached
      upstreamCalls++
      const live = sampleValue
      await setCached(undefined, call, live)
      return live
    }

    await search(sampleCall)
    await search(sampleCall)

    expect(upstreamCalls).toBe(2) // no caching happened, so every call goes live
  })
})
