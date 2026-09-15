import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'

function request(path, init = {}) {
  return new Request(`https://api.example.com${path}`, init)
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

describe('stub routes', () => {
  it('/search returns 501 Not Implemented', async () => {
    const res = await worker.fetch(request('/search'), {}, {})
    expect(res.status).toBe(501)
  })

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
