# R.E.L Tours — Cheap Flights

Flexible-date flight search. Instead of picking one departure day, travellers give a
**window** they could travel in plus a **trip length**, and the site scans every date
combination in that window for the cheapest fare.

> **Status: front end only.** Fares are generated sample data. See
> [The backend seam](#the-backend-seam) for where the real API plugs in.

## Stack

React 19 · Vite 8 · Tailwind CSS 4 (CSS-first config — there is no `tailwind.config.js`;
the brand tokens live in the `@theme` block of `src/index.css`).

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
│  ├─ SkeletonCard.jsx     loading placeholder
│  └─ Footer.jsx
├─ data/airports.js        ~130 airports + findAirport / searchAirports
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
Offer     { id, price, currency, airline, airlineCode, departDate, returnDate,
            nights, stops, durationOutbound, durationReturn, deepLink }
```

Everything below that function in the file is disposable mock-data generation. The mock
is seeded off the search criteria, so the same route returns the same prices rather than
reshuffling on every submit.

`src/data/airports.js` is a curated static list; it can later be backed by a lookup
endpoint — keep `findAirport` / `searchAirports` as the only accessors.

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
