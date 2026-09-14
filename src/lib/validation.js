import { findPlace } from '../data/airports.js'

/** Today at local midnight — the earliest date a user may pick. */
export function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** `YYYY-MM-DD` for the value of a native date input. */
export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parse a `YYYY-MM-DD` input value as a LOCAL date (`new Date(str)` is UTC). */
export function fromISODate(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Whole days from `a` to `b`, inclusive of both endpoints. */
export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000)
}

export function formatDate(value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const date = typeof value === 'string' ? fromISODate(value) : value
  if (!date) return ''
  return date.toLocaleDateString(undefined, opts)
}

/**
 * Validate the search form. Returns a `{ fieldName: message }` map so each
 * message can render under the field it belongs to. An empty object means valid.
 */
export function validateSearch(criteria) {
  const errors = {}
  const { from, to, earliest, latest, nights, flexibility, passengers } = criteria

  // --- Airports ---
  if (!from?.trim()) {
    errors.from = 'Enter a departure airport code.'
  } else if (!/^[A-Za-z]{3}$/.test(from.trim())) {
    errors.from = 'Codes are exactly 3 letters, e.g. TLV.'
  } else if (!findPlace(from)) {
    errors.from = `We don’t recognise “${from.toUpperCase()}”.`
  }

  if (!to?.trim()) {
    errors.to = 'Enter an arrival airport code.'
  } else if (!/^[A-Za-z]{3}$/.test(to.trim())) {
    errors.to = 'Codes are exactly 3 letters, e.g. BCN.'
  } else if (!findPlace(to)) {
    errors.to = `We don’t recognise “${to.toUpperCase()}”.`
  }

  if (!errors.from && !errors.to && from.toUpperCase() === to.toUpperCase()) {
    errors.to = 'Departure and arrival must be different.'
  }

  // --- Date window ---
  const start = fromISODate(earliest)
  const end = fromISODate(latest)

  if (!start) errors.earliest = 'Pick the earliest date you could leave.'
  else if (start < today()) errors.earliest = 'That date is in the past.'

  if (!end) errors.latest = 'Pick the latest date you could return.'
  else if (start && end < start) errors.latest = 'Must be on or after the earliest date.'

  // --- Duration fits the window ---
  const n = Number(nights)
  if (!Number.isFinite(n) || n < 1) {
    errors.nights = 'Trip length must be at least 1 night.'
  } else if (n > 60) {
    errors.nights = 'Trip length is capped at 60 nights.'
  } else if (start && end && end >= start) {
    const windowDays = daysBetween(start, end) + 1
    const shortestTrip = Math.max(1, n - Number(flexibility || 0)) + 1
    if (shortestTrip > windowDays) {
      errors.nights = `A ${n}-night trip doesn’t fit in a ${windowDays}-day window — widen the dates or shorten the trip.`
    }
  }

  // --- Passengers ---
  const pax = Number(passengers)
  if (!Number.isFinite(pax) || pax < 1 || pax > 9) {
    errors.passengers = 'Between 1 and 9 passengers.'
  }

  return errors
}
