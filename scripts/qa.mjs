/**
 * Full QA pipeline. Run with `npm run qa`.
 *
 * Gates a deploy: lint, build, pure-logic checks, then a real headless browser
 * driven against the PRODUCTION build served under its deploy base path — the
 * place GitHub Pages breakages actually show up. Exits non-zero on any failure.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = process.env.BASE_PATH ?? '/rel-tours/'
const PORT = 4178
const CDP_PORT = 9455

let failures = 0
let checks = 0
const started = Date.now()

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

function stage(name) {
  console.log(`\n${c.bold('▸ ' + name)}`)
}

function check(name, ok, detail = '') {
  checks++
  if (!ok) failures++
  console.log(`  ${ok ? c.green('PASS') : c.red('FAIL')}  ${name}${detail ? c.dim(' — ' + detail) : ''}`)
  return ok
}

/**
 * Run a local tool with this same Node binary.
 *
 * Deliberately not `npm run <script>`: on Windows npm is a .cmd shim, and Node
 * refuses to spawn .cmd without shell:true — which in turn needs every argument
 * escaped by hand. Invoking the tool's own JS entry point sidesteps both.
 */
function runNode(entry, args, label) {
  const r = spawnSync(process.execPath, [join(ROOT, entry), ...args], { cwd: ROOT, encoding: 'utf8' })
  const ok = r.status === 0 && !r.error
  check(label, ok, ok ? '' : (r.error?.message || r.stderr || r.stdout || '').trim().split('\n').slice(-4).join(' | '))
  return { ok, out: (r.stdout || '') + (r.stderr || '') }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── 1. Static checks ────────────────────────────────────────────────────────
stage('Lint & build')
runNode('node_modules/oxlint/bin/oxlint', [], 'oxlint reports no problems')
runNode('node_modules/vite/bin/vite.js', ['build'], 'production build succeeds')

const DIST = join(ROOT, 'dist')
check('dist/ produced', existsSync(join(DIST, 'index.html')))

const html = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : ''
check('index.html carries the deploy base path', html.includes(`${BASE}assets/`), `expected asset URLs under ${BASE}assets/`)
check('favicon rewritten to base path', html.includes(`${BASE}favicon.svg`))
check('no leftover localhost/dev references', !/localhost:\d+/.test(html))
check('page title is branded', /<title>[^<]*R\.E\.L[^<]*<\/title>/.test(html), html.match(/<title>[^<]*<\/title>/)?.[0])

// Every local asset the HTML references must exist on disk under dist/.
const referenced = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith(BASE))
let missing = referenced.filter((u) => !existsSync(join(DIST, u.slice(BASE.length))))
check('every referenced asset exists in dist/', missing.length === 0, missing.join(', '))

// ─── 2. Bundle budget ────────────────────────────────────────────────────────
stage('Bundle size')
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}
const files = existsSync(DIST) ? walk(DIST) : []
const totalKB = files.reduce((n, f) => n + statSync(f).size, 0) / 1024
const biggest = files
  .map((f) => ({ f: relative(DIST, f), kb: statSync(f).size / 1024 }))
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 4)
console.log(c.dim('    ' + biggest.map((b) => `${b.f} ${b.kb.toFixed(0)}KB`).join('  ')))
check('total dist under 1.5 MB', totalKB < 1536, `${totalKB.toFixed(0)} KB`)
check('world atlas split into its own chunk', files.some((f) => /countries-110m/.test(f)), 'map data must not be in the entry bundle')

// ─── 3. Pure logic ───────────────────────────────────────────────────────────
stage('Logic')
const { validateSearch, toISODate, today } = await import('../src/lib/validation.js')
const { searchFlights } = await import('../src/lib/searchFlights.js')
const { findPlace, searchPlaces, airportsFor, distanceKm, metros, airports } = await import('../src/data/airports.js')
const { findAirline, airlines } = await import('../src/data/airlines.js')

const d = (off) => {
  const x = new Date(today())
  x.setDate(x.getDate() + off)
  return toISODate(x)
}
const base = { from: 'TLV', to: 'BCN', earliest: d(30), latest: d(120), nights: 7, flexibility: 2, passengers: 1, cabin: 'economy' }

check('valid criteria pass', Object.keys(validateSearch(base)).length === 0)
check('same airport rejected', !!validateSearch({ ...base, to: 'TLV' }).to)
check('unknown code rejected', !!validateSearch({ ...base, to: 'XXX' }).to)
check('past departure rejected', !!validateSearch({ ...base, earliest: d(-5) }).earliest)
check('reversed window rejected', !!validateSearch({ ...base, latest: d(10) }).latest)
check('trip longer than window rejected', !!validateSearch({ ...base, earliest: d(30), latest: d(38), nights: 14, flexibility: 0 }).nights)
check('exact fit accepted', !validateSearch({ ...base, earliest: d(30), latest: d(37), nights: 7, flexibility: 0 }).nights)
check('passenger bounds enforced', !!validateSearch({ ...base, passengers: 10 }).passengers && !validateSearch({ ...base, passengers: 9 }).passengers)

// Metro integrity — a metro code shadowing an airport makes typed input ambiguous.
const airportCodes = new Set(airports.map((a) => a.code))
check('no metro code collides with an airport code', metros.every((m) => !airportCodes.has(m.code)),
  metros.filter((m) => airportCodes.has(m.code)).map((m) => m.code).join(','))
check('every metro member airport exists', metros.every((m) => m.airports.every((x) => airportCodes.has(x))))
check('all place codes unique', new Set([...airports.map((a) => a.code), ...metros.map((m) => m.code)]).size === airports.length + metros.length)
check('every airport has coordinates', airports.every((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon) && Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180))
check('TYO expands to Narita and Haneda', airportsFor('TYO').map((a) => a.code).sort().join(',') === 'HND,NRT')
check('metro outranks its own airports', searchPlaces('tokyo')[0]?.code === 'TYO')
check('lowercase code resolves', findPlace('tlv')?.city === 'Tel Aviv')

// Airline lookup — known codes resolve, unknown codes fall back to the code
// itself rather than an empty string, and lookup is case-insensitive.
check('all airline codes unique', new Set(airlines.map((a) => a.code)).size === airlines.length)
check('every airline has a code and a name', airlines.every((a) => a.code && a.name))
check('known airline code resolves to its name', findAirline('LY')?.name === 'El Al')
check('lowercase airline code resolves', findAirline('ly')?.name === 'El Al')
check('unknown airline code falls back to the code itself', findAirline('ZZ')?.name === 'ZZ')
check('lowercase unknown airline code falls back uppercased', findAirline('zz')?.name === 'ZZ')

// Distances against published great-circle figures (±2%). Each baseline is an
// independently computed figure, not a value copied back out of this codebase.
for (const [a, b, expected] of [['TLV', 'TYO', 9200], ['TLV', 'BCN', 3100], ['LHR', 'JFK', 5550], ['SYD', 'LAX', 12050], ['TLV', 'LCA', 340]]) {
  const got = distanceKm(a, b)
  check(`${a}→${b} distance within 2% of ${expected}km`, Math.abs(got - expected) / expected < 0.02, `${Math.round(got)} km`)
}

const offers = await searchFlights(base)
check('search returns offers', offers.length > 0, `${offers.length}`)
check('offers sorted cheapest first', offers.every((o, i) => i === 0 || offers[i - 1].price <= o.price))
check('trip lengths honour flexibility', offers.every((o) => Math.abs(o.nights - 7) <= 2))
check('all offers inside the window', offers.every((o) => o.departDate >= base.earliest && o.returnDate <= base.latest))
check('offer ids unique', new Set(offers.map((o) => o.id)).size === offers.length)
check('results deterministic for identical criteria', JSON.stringify(await searchFlights(base)) === JSON.stringify(offers))
check('more passengers cost more', (await searchFlights({ ...base, passengers: 4 }))[0].price > offers[0].price)
check('business costs more than economy', (await searchFlights({ ...base, cabin: 'business' }))[0].price > offers[0].price)
check('impossible window returns empty, not a crash', (await searchFlights({ ...base, earliest: d(30), latest: d(31), nights: 30, flexibility: 0 })).length === 0)

const tyo = await searchFlights({ ...base, to: 'TYO' })
check('metro search names a concrete airport', tyo.every((o) => ['NRT', 'HND'].includes(o.destAirport)))
// Flight time must agree with distance: TLV–Tokyo nonstop is ~11h20m.
const nonstopTokyo = (distanceKm('TLV', 'TYO') / 850) * 60 + 35
check('durations consistent with distance', tyo.every((o) => o.durationOutbound >= nonstopTokyo - 5),
  `min ${Math.min(...tyo.map((o) => o.durationOutbound))}m vs nonstop ${Math.round(nonstopTokyo)}m`)

// REL-19: fareSource.js is the real-Worker half of the backend seam. It takes
// `apiUrl` as a plain parameter (not `import.meta.env.VITE_API_URL`), so —
// unlike searchFlights.js's own mock/real dispatch, which only resolves that
// env var inside a real Vite build/dev server — it can be exercised directly
// here with a stubbed `fetch`, no browser required. This is the "mocked/
// stubbed fetch" verification the ticket calls for; VITE_API_URL itself stays
// unset for the rest of this run, so every `searchFlights()` call above and
// below still takes the mock path — the thing this suite has always tested.
stage('Logic — fareSource (REL-19 Worker path)')
const { buildSearchUrl, fetchFromWorker } = await import('../src/lib/fareSource.js')

const workerCriteria = { ...base }
const searchUrl = buildSearchUrl('https://worker.example', workerCriteria)
check('fareSource builds a /search URL carrying the criteria as query params',
  searchUrl.startsWith('https://worker.example/search?') && searchUrl.includes('from=TLV') && searchUrl.includes('to=BCN'))
check('fareSource includes a computed distanceKm query param', /distanceKm=\d+/.test(searchUrl))

const realFetch = globalThis.fetch
try {
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: '1', price: 100 }]), { status: 200 })
  const workerOffers = await fetchFromWorker('https://worker.example', workerCriteria)
  check('a successful Worker response resolves to Offer[]', Array.isArray(workerOffers) && workerOffers[0]?.price === 100)

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'upstream_error', message: 'fare provider unavailable' }), { status: 503 })
  let errMessage = null
  try {
    await fetchFromWorker('https://worker.example', workerCriteria)
  } catch (err) {
    errMessage = err?.message
  }
  check('a non-2xx Worker response throws a readable Error, not [object Object]', errMessage === 'fare provider unavailable')

  globalThis.fetch = async () => {
    throw new TypeError('network down')
  }
  let networkMessage = null
  try {
    await fetchFromWorker('https://worker.example', workerCriteria)
  } catch (err) {
    networkMessage = err?.message
  }
  check('a network failure throws a readable, non-empty Error message',
    typeof networkMessage === 'string' && networkMessage.length > 0 && networkMessage !== '[object Object]')

  // Abort-on-new-search: a second fetchFromWorker() call must abort the
  // first's still-pending fetch, not just let App.jsx discard its result.
  let firstSignal = null
  globalThis.fetch = (_url, init) => {
    firstSignal = init.signal
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
  }
  const firstPromise = fetchFromWorker('https://worker.example', workerCriteria)
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 })
  const secondPromise = fetchFromWorker('https://worker.example', workerCriteria)
  const [firstResult, secondResult] = await Promise.allSettled([firstPromise, secondPromise])
  check('starting a new search aborts the previous in-flight Worker fetch',
    firstResult.status === 'rejected' && firstSignal?.aborted === true)
  check('the newer search still resolves normally after the abort', secondResult.status === 'fulfilled')
} finally {
  globalThis.fetch = realFetch
}

// ─── 4. Serve the built site and drive a real browser ────────────────────────
stage('Browser (production build)')

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (!url.startsWith(BASE)) return void res.writeHead(404).end('outside base')
  let file = join(DIST, url.slice(BASE.length))
  if (url.endsWith('/')) file = join(file, 'index.html')
  if (!existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end('not found')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))
const SITE = `http://localhost:${PORT}${BASE}`
console.log(c.dim(`    serving dist/ at ${SITE}`))

// CHROME_PATH wins when set — CI provisions Chrome via browser-actions/setup-chrome
// and exports its exact binary path there, since the installed name/location isn't
// one of the fixed local dev paths below (and varies by runner OS).
const CHROME =
  (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH) && process.env.CHROME_PATH) ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p))

if (!CHROME) {
  check('a Chromium browser is available', false, 'install Chrome or Edge to run browser QA')
} else {
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    // CI runners can't use Chrome's setuid sandbox (no permission to create
    // the namespaces it needs) and often have a tiny /dev/shm — both make
    // the renderer fail to start silently, which shows up as the CDP
    // endpoint never listing a `page` target. Harmless locally too, since
    // this Chrome instance only ever loads our own local dist/ build.
    '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${join(ROOT, 'node_modules', '.qa-chrome')}`,
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    let targets
    for (let i = 0; i < 30; i++) {
      try {
        targets = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json()
        if (targets.some((t) => t.type === 'page')) break
      } catch { /* browser still starting */ }
      await sleep(400)
    }
    if (!targets?.some((t) => t.type === 'page')) {
      throw new Error(
        `Chrome never exposed a "page" target on the CDP endpoint after 12s ` +
          `(binary: ${CHROME}). It likely failed to launch — try running it ` +
          'directly to see stderr.',
      )
    }

    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let id = 0
    const pending = new Map()
    let consoleErrors = []
    let failedRequests = []
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text)
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
      if (m.method === 'Network.loadingFailed') failedRequests.push(m.params.errorText)
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id)
        pending.delete(m.id)
        if (m.error) reject(new Error(JSON.stringify(m.error)))
        else resolve(m.result)
      }
    }
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const n = ++id
        pending.set(n, { resolve, reject })
        ws.send(JSON.stringify({ id: n, method, params }))
      })
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
      return r.result.value
    }
    const setCombo = (i, v) => ev(`
      (() => { const el = document.querySelectorAll('input[role=combobox]')[${i}];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(v)});
        el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`)

    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')

    for (const [label, W, H] of [['desktop 1440px', 1440, 1400], ['mobile 375px', 375, 1400]]) {
      console.log(c.dim(`    ${label}`))
      consoleErrors = []; failedRequests = []
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 768 })
      await send('Page.navigate', { url: SITE })
      await sleep(2600)

      check(`[${label}] app mounted`, (await ev(`document.querySelectorAll('#root *').length`)) > 20)
      check(`[${label}] no failed network requests`, failedRequests.length === 0, failedRequests.join(', '))
      check(`[${label}] logo renders as the R mark`, await ev(`
        (() => { const s = document.querySelector('header svg[role=img]');
          return !!s && s.querySelector('title')?.textContent === 'R.E.L Tours' && s.querySelectorAll('rect').length === 0; })()`))
      check(`[${label}] stylesheet applied`, await ev(`getComputedStyle(document.body).backgroundColor === 'rgb(7, 11, 18)'`),
        await ev(`getComputedStyle(document.body).backgroundColor`))

      // Validation must block a bad search.
      await ev(`document.querySelector('button[type=submit]').click()`)
      await sleep(250)
      check(`[${label}] empty submit blocked with inline errors`, (await ev(`document.querySelectorAll('form .text-red-400').length`)) >= 2)
      check(`[${label}] no results rendered for invalid search`, (await ev(`document.querySelectorAll('#results article').length`)) === 0)

      // Metro autocomplete.
      await setCombo(1, 'tokyo')
      await sleep(350)
      const opts = await ev(`Array.from(document.querySelectorAll('[role=option]')).map(o=>o.textContent.replace(/\\s+/g,' ').trim())`)
      check(`[${label}] metro TYO ranked above its airports`, opts[0]?.startsWith('TYO'), opts[0])
      check(`[${label}] member airports listed too`, opts.some((o) => o.startsWith('NRT')) && opts.some((o) => o.startsWith('HND')))

      // Keyboard operability of the combobox.
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
      await sleep(150)
      check(`[${label}] arrow key moves the highlight`, (await ev(`document.querySelectorAll('[role=option][aria-selected=true]').length`)) === 1)

      // Full search.
      await setCombo(0, 'TLV'); await setCombo(1, 'TYO')
      await ev(`document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`)
      await sleep(250)

      // The swap button floats over the route fields; it must not land on top of
      // the caption naming the resolved airport. Both captions are populated at
      // this point, so the check cannot pass by finding nothing to collide with.
      const captioned = await ev(`
        Array.from(document.querySelectorAll('form p')).filter(p=>p.textContent.trim()).length`)
      check(`[${label}] field captions are populated (guards the next check)`, captioned >= 2, `${captioned}`)

      const overlap = await ev(`
        (() => {
          const b = document.querySelector('button[aria-label="Swap departure and arrival"]');
          if (!b) return 'missing';
          const s = b.getBoundingClientRect();
          // Measure the glyphs, not the paragraph box: a full-width <p> with
          // right padding still spans under the button while its text does not.
          const hits = Array.from(document.querySelectorAll('form p')).filter(p => {
            if (!p.textContent.trim()) return false;
            const range = document.createRange();
            range.selectNodeContents(p);
            return Array.from(range.getClientRects()).some(r =>
              s.left < r.right && s.right > r.left && s.top < r.bottom && s.bottom > r.top);
          });
          return hits.map(p => p.textContent.trim()).join(' | ') || 'clear';
        })()`)
      check(`[${label}] swap button clears the field captions`, overlap === 'clear', overlap)

      await ev(`document.querySelector('button[type=submit]').click()`)
      await sleep(3200)

      const r = await ev(`
        (() => { const cards = document.querySelectorAll('#results article');
          const svg = document.querySelector('#results section svg[role=img]');
          return { cards: cards.length, map: !!svg,
            land: svg ? svg.querySelectorAll('path').length : 0,
            arc: svg?.querySelector('.route-arc')?.getTotalLength?.() ?? 0,
            labels: svg ? Array.from(svg.querySelectorAll('text')).map(t=>t.textContent) : [],
            stats: Array.from(document.querySelectorAll('#results dd')).map(x=>x.textContent.replace(/\\s+/g,' ').trim()),
            metroAirports: /TLV\\/(NRT|HND)/.test(cards[0]?.textContent ?? ''),
            docW: document.documentElement.scrollWidth, winW: window.innerWidth }; })()`)

      check(`[${label}] results render`, r.cards > 0, `${r.cards} fares`)
      check(`[${label}] route globe renders with coastlines`, r.map && r.land >= 3, `${r.land} paths`)
      check(`[${label}] great-circle arc drawn`, r.arc > 40, `${Math.round(r.arc)}px`)
      check(`[${label}] both endpoints labelled`, r.labels.includes('TLV') && r.labels.includes('TYO'), r.labels.join('/'))
      check(`[${label}] distance/time/heading shown`, r.stats.length >= 3, r.stats.join(' · '))
      check(`[${label}] cards name the concrete airport`, r.metroAirports)
      check(`[${label}] no horizontal overflow`, r.docW <= r.winW, `${r.docW}/${r.winW}`)

      // Accessibility essentials.
      const a11y = await ev(`
        (() => {
          const unlabelled = Array.from(document.querySelectorAll('input,select')).filter(el =>
            !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'));
          const namelessBtns = Array.from(document.querySelectorAll('button')).filter(b =>
            !b.textContent.trim() && !b.getAttribute('aria-label'));
          return { unlabelled: unlabelled.length, namelessBtns: namelessBtns.length,
            imgsNoAlt: Array.from(document.querySelectorAll('img')).filter(i=>!i.alt).length,
            svgsNoLabel: Array.from(document.querySelectorAll('svg[role=img]')).filter(s=>!s.getAttribute('aria-label')).length,
            liveRegions: document.querySelectorAll('[aria-live]').length,
            h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang }; })()`)
      check(`[${label}] every form control is labelled`, a11y.unlabelled === 0, `${a11y.unlabelled} unlabelled`)
      check(`[${label}] every button has an accessible name`, a11y.namelessBtns === 0, `${a11y.namelessBtns} unnamed`)
      check(`[${label}] meaningful svgs are labelled`, a11y.svgsNoLabel === 0)
      check(`[${label}] search status announced to screen readers`, a11y.liveRegions >= 1)
      check(`[${label}] exactly one h1`, a11y.h1 === 1, `${a11y.h1}`)
      check(`[${label}] html lang set`, !!a11y.lang, a11y.lang)
      check(`[${label}] no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
    }
    ws.close()
  } finally {
    chrome.kill()
  }
}
server.close()

// ─── Report ──────────────────────────────────────────────────────────────────
const secs = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${c.bold('─'.repeat(58))}`)
if (failures === 0) {
  console.log(c.green(c.bold(`✔ QA PASSED  ${checks} checks in ${secs}s`)))
} else {
  console.log(c.red(c.bold(`✖ QA FAILED  ${failures} of ${checks} checks failed (${secs}s)`)))
}
process.exit(failures === 0 ? 0 : 1)
