// Explicit allowlist rather than `*` — the browser must never be able to read a
// response from an origin we didn't name. Add a preview-deploy origin here if
// GitHub Pages preview URLs are ever used; do not fall back to a wildcard.
const ALLOWED_ORIGINS = new Set([
  'https://arikhp.github.io', // production site (CORS cares about origin, not the /rel-tours/ path)
  'http://localhost:5173', // `npm run dev` (Vite default port)
])

/**
 * Returns the CORS headers to send for a given request Origin, or `null` if
 * that origin is not on the allowlist. A missing Origin header (curl, another
 * Worker, wrangler tail, ...) is treated as a non-browser client and is not
 * subject to CORS at all — CORS is a browser-enforced mechanism, not an auth
 * check, so we don't need an ACAO header for those callers.
 */
export function corsHeadersFor(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
