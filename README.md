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
```

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
