import { fromISODate, toISODate, daysBetween } from './validation.js'
import { airportsFor, distanceKm } from '../data/airports.js'

// REL-17: these three constants and the nonstop/estimate formula below are
// duplicated (not imported) in api/src/duration.js, which is the real path's
// source of truth for duration estimates and for the real-vs-estimate
// decision the mock has no need for. api/ and this Vite app are separate npm
// packages with no clean import path between them (see the packaging note at
// the top of api/src/duration.js) — if you change these values, change them
// there too.
const CRUISE_KMH = 850
const TAXI_MINUTES = 35
// Each stop adds a detour plus a connection sit — roughly an hour and a half.
const STOP_MINUTES = 90

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BACKEND SEAM
 *
 * Everything the UI knows about fetching fares is this one function. When the
 * real flight API is wired up, replace the BODY of `searchFlights` with a
 * `fetch` — do not change its signature or the shape it resolves to, and no
 * component needs touching.
 *
 * Input (criteria):
 *   { from, to, earliest, latest, nights, flexibility, passengers, cabin }
 *     from, to        IATA code of an airport OR a metro area (TYO, LON, NYC…).
 *                     A metro means "any airport in this city" — expand it with
 *                     airportsFor() before querying a real API.
 *     earliest, latest 'YYYY-MM-DD' bounds of the travel window
 *     nights          desired trip length
 *     flexibility     0 | 1 | 2 | 3 — days of slack either side of `nights`
 *     passengers      1–9
 *     cabin           'economy' | 'premium' | 'business' | 'first'
 *
 * Output: Promise<Offer[]>, where Offer is
 *   { id, price, currency, airline, airlineCode, originAirport, destAirport,
 *     departDate, returnDate, nights, stops, durationOutbound, durationReturn,
 *     deepLink }
 *     price            number, total for all passengers
 *     originAirport    the SPECIFIC airport flown from — differs from
 *     destAirport      criteria.from/to whenever a metro area was searched
 *     durationOutbound minutes
 *
 * Throws on failure; the UI renders the thrown message.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function searchFlights(criteria) {
  await new Promise((resolve) => setTimeout(resolve, 900))
  return generateMockOffers(criteria)
}

// ─── Everything below is disposable mock data ────────────────────────────────

const AIRLINES = [
  { code: 'LY', name: 'El Al' },
  { code: 'W6', name: 'Wizz Air' },
  { code: 'FR', name: 'Ryanair' },
  { code: 'U2', name: 'easyJet' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'AF', name: 'Air France' },
  { code: 'KL', name: 'KLM' },
  { code: 'TK', name: 'Turkish Airlines' },
  { code: 'BA', name: 'British Airways' },
  { code: 'IB', name: 'Iberia' },
  { code: 'AZ', name: 'ITA Airways' },
  { code: 'A3', name: 'Aegean' },
]

const CABIN_MULTIPLIER = {
  economy: 1,
  premium: 1.6,
  business: 3.1,
  first: 5.2,
}

/**
 * Deterministic PRNG (mulberry32). Seeding off the search criteria means the
 * same route always returns the same prices, so the UI feels like a real
 * backend rather than reshuffling on every submit.
 */
function makeRandom(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function generateMockOffers(criteria) {
  const { from, to, earliest, latest, nights, flexibility, passengers, cabin } = criteria

  const start = fromISODate(earliest)
  const end = fromISODate(latest)
  if (!start || !end) return []

  const random = makeRandom(hashString(`${from}${to}${earliest}${latest}${nights}`))
  const windowDays = daysBetween(start, end) + 1
  const slack = Number(flexibility) || 0
  const pax = Number(passengers) || 1

  // A metro code stands for several airports; each offer flies from exactly one.
  const origins = airportsFor(from)
  const destinations = airportsFor(to)
  if (origins.length === 0 || destinations.length === 0) return []

  // Price and flight time both scale off the real great-circle distance, so the
  // cards agree with the distance and nonstop estimate the route map shows.
  const km = distanceKm(from, to)
  const routeBase = 45 + km * 0.022
  const nonstopMinutes = (km / CRUISE_KMH) * 60 + TAXI_MINUTES
  const cabinMult = CABIN_MULTIPLIER[cabin] ?? 1

  const offers = []
  // Every valid (departure day, trip length) pairing inside the window.
  for (let lengthOffset = -slack; lengthOffset <= slack; lengthOffset++) {
    const tripNights = Number(nights) + lengthOffset
    if (tripNights < 1) continue

    const lastDepartureOffset = windowDays - tripNights - 1
    for (let dayOffset = 0; dayOffset <= lastDepartureOffset; dayOffset++) {
      const departDate = addDays(start, dayOffset)
      const returnDate = addDays(departDate, tripNights)

      // Weekend departures and returns carry a premium.
      const weekendLoad =
        (departDate.getDay() === 5 || departDate.getDay() === 6 ? 0.18 : 0) +
        (returnDate.getDay() === 0 ? 0.12 : 0)

      const stops = random() < 0.55 ? 0 : random() < 0.8 ? 1 : 2
      const stopDiscount = stops === 0 ? 1 : stops === 1 ? 0.82 : 0.71

      const perPerson =
        routeBase * cabinMult * stopDiscount * (1 + weekendLoad) * (0.78 + random() * 0.65)

      const airline = AIRLINES[Math.floor(random() * AIRLINES.length)]
      const originAirport = origins[Math.floor(random() * origins.length)]
      const destAirport = destinations[Math.floor(random() * destinations.length)]

      offers.push({
        id: `${from}-${to}-${toISODate(departDate)}-${tripNights}-${offers.length}`,
        price: Math.round(perPerson * pax),
        currency: 'USD',
        airline: airline.name,
        airlineCode: airline.code,
        originAirport: originAirport.code,
        destAirport: destAirport.code,
        departDate: toISODate(departDate),
        returnDate: toISODate(returnDate),
        nights: tripNights,
        stops,
        durationOutbound: Math.round(nonstopMinutes + stops * STOP_MINUTES + random() * 45),
        durationReturn: Math.round(nonstopMinutes + stops * STOP_MINUTES + random() * 45),
        deepLink: '#',
      })
    }
  }

  // A real API returns a bounded set of the best fares, not every permutation.
  return offers.sort((a, b) => a.price - b.price).slice(0, 24)
}
