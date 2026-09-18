# R.E.L Tours — Cheap Flights

Flexible-date flight search. Instead of picking one departure day, travellers give a
**window** they could travel in plus a **trip length**, and the site scans every date
combination in that window for the cheapest fare.

> **Status: front end only.** Fares are generated sample data. See
> [The backend seam](#the-backend-seam) for where the real API plugs in.

## Stack

React 19 · Vite 8 · Tailwind CSS 4 (CSS-first config — there is no `tailwind.config.js`;
the brand tokens live in the `@theme` block of `src/index.css`) · d3-geo + world-atlas
for the route globe.

## Metro areas

A search accepts either a single airport (`HND`) or a **metropolitan area** covering
several (`TYO` = Narita + Haneda). Metro codes rank above their own airports in the
autocomplete and carry an "N airports" badge; each result then names the specific
airport it flies from. `LON PAR ROM MIL NYC WAS CHI TYO OSA SEL BJS BUE SAO` are
defined in `src/data/airports.js`.

Istanbul and Shanghai are deliberately *not* metros: their IATA metro codes (`IST`,
`SHA`) collide with an airport code, which would make a typed code ambiguous. A dev-only
assertion in `airports.js` fails loudly if a future metro reintroduces such a collision.

## Route globe

`src/components/RouteMap.jsx` draws the searched route as a great circle on an
orthographic globe, with distance, heading and a nonstop-time estimate. Two details
worth knowing before editing it:

- A great circle passing through the projection's centre draws as a **straight line**,
  so the globe is deliberately centred *off* the route to make the arc bow.
- The zoom adapts to route length — a 340 km hop gets a regional view, a 16,000 km
  haul gets the whole globe — and the disc is clipped so zoomed views don't spill.

The ~100 KB world outline is `import()`ed on first mount, so it ships as its own chunk
rather than in the initial bundle.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run lint     # oxlint
npm run qa       # full QA pipeline (see below)
npm run deploy   # runs QA, then publishes to GitHub Pages
```

## QA pipeline

`npm run qa` is the gate in front of every deploy — 106 checks, ~20s:

| Stage | What it proves |
| --- | --- |
| Lint & build | oxlint clean; production build succeeds |
| Asset integrity | every URL in `index.html` resolves under the deploy base path, nothing references localhost |
| Bundle budget | `dist/` under 1.5 MB; the world atlas stays in its own chunk |
| Logic | validation rules, metro-code integrity, offer generation, determinism, and the Worker fetch path (`fareSource.js`) against a stubbed `fetch` |
| Distances | five routes within 2% of independently computed great-circle figures |
| Live smoke | a real HTTPS request to the deployed Worker's `/health` endpoint — catches a genuinely broken deployment. Skippable with `QA_SKIP_LIVE=1`, and skips itself (rather than failing) when the network is unreachable, so the pipeline still runs fully offline |
| Browser | drives the **built** site at 1440px and 375px — search, autocomplete, keyboard nav, route globe, no console errors, no horizontal overflow |
| Accessibility | every control labelled, every button named, one `h1`, `lang` set, live region present |

It runs a real headless Chrome against `dist/` served under `/rel-tours/`, because
base-path mistakes only surface in the production build — never in `npm run dev`.

Fares themselves come from `src/lib/searchFlights.js`, which dispatches on
`import.meta.env.VITE_API_URL`: unset — which it always is for `npm run qa`, since
that variable is never set in this repo's scripts or CI — it falls through to the
same deterministic mock the Logic stage has always exercised, so the QA suite stays
meaningful without needing a separate mechanism to pin it there.

## Deploying

`npm run deploy` runs QA, then pushes `dist/` to the `gh-pages` branch via a temporary
git worktree, so your working tree is never touched. A failing QA run aborts the deploy.

The Vite `base` is `/rel-tours/` to match the Pages URL. Serving from a domain root
instead (a custom domain) needs `BASE_PATH=/ npm run build`.

## Contributing

Work is tracked in Jira at [rel-nujnov.atlassian.net](https://rel-nujnov.atlassian.net)
(project key `REL`), connected to this repo via GitHub for Jira — an open PR shows up
on its Jira issue automatically.

- **Branches**: `feat/REL-<number>-<slug>` for feature work, `spike/REL-<number>-<slug>`
  for spikes (e.g. `feat/REL-10-branch-protection`).
- **PR titles and commit messages** should reference the Jira key (e.g. `REL-10: ...`),
  so the link back to the ticket is unambiguous even without the GitHub integration.
- **`main` is protected**: pushes go through a pull request, and the `ci` check (lint,
  the QA suite, and the `api/` test suite — see [CI workflow](.github/workflows/ci.yml))
  must pass before a PR can be merged.

## Project layout

```
src/
├─ App.jsx                 owns search state (status, results, criteria)
├─ index.css               @theme design tokens + base styles
├─ components/
│  ├─ Logo.jsx             R.E.L Tours mark (inline SVG)
│  ├─ Header.jsx           sticky nav
│  ├─ Hero.jsx             headline + how-it-works
│  ├─ SearchForm.jsx       the search panel
│  ├─ AirportInput.jsx     IATA code field with type-ahead
│  ├─ Stepper.jsx          number field with −/+ (nights, passengers)
│  ├─ ResultsSection.jsx   idle / loading / empty / error / results
│  ├─ FlightCard.jsx       one fare
│  ├─ RouteMap.jsx         great-circle globe for the searched route
│  ├─ SkeletonCard.jsx     loading placeholder
│  └─ Footer.jsx
├─ data/airports.js        airports + metro areas, findPlace / searchPlaces / distanceKm
└─ lib/
   ├─ validation.js        validateSearch + date helpers
   └─ searchFlights.js     ← the backend seam
```

## The backend seam

All fare fetching lives in the single exported function in
[`src/lib/searchFlights.js`](src/lib/searchFlights.js). To go live, replace that
function's **body** with a `fetch` to the real API — keep the signature and the
resolved shape identical and no component needs to change.

```js
searchFlights(criteria) => Promise<Offer[]>

criteria  { from, to, earliest, latest, nights, flexibility, passengers, cabin }
            from/to may be an airport OR a metro code — expand with airportsFor()
Offer     { id, price, currency, airline, airlineCode, originAirport, destAirport,
            departDate, returnDate, nights, stops, durationOutbound,
            durationReturn, deepLink }
            originAirport/destAirport are the SPECIFIC airports flown, which
            differ from criteria.from/to whenever a metro area was searched
```

Everything below that function in the file is disposable mock-data generation. The mock
is seeded off the search criteria, so the same route returns the same prices rather than
reshuffling on every submit.

`src/data/airports.js` is a curated static list; it can later be backed by a lookup
endpoint — keep `findPlace` / `searchPlaces` / `airportsFor` as the only accessors.
Its coordinates are approximate (good to a few km) and exist to plot the route globe
and scale the mock prices and durations by real distance, not to navigate by.

## Design tokens

Defined once in `src/index.css` and used as Tailwind utilities (`bg-surface`,
`text-accent`, `border-line`, …):

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink` | `#070b12` | page background |
| `--color-surface` | `#0e1520` | cards, form panel |
| `--color-surface-2` | `#16202e` | inputs, hover |
| `--color-line` | `#22303f` | borders |
| `--color-text` | `#e8eef6` | primary text |
| `--color-muted` | `#8ea0b5` | labels, secondary text |
| `--color-accent` | `#22d3ee` | cyan accent |
| `--color-accent-2` | `#3b82f6` | gradient partner |
| `--color-good` | `#34d399` | "cheapest" badge |

## Not built yet

Real fare API · backend server · routing / multi-page · auth · booking flow · persistence.
