import { useMemo, useState } from 'react'
import FlightCard from './FlightCard.jsx'
import SkeletonCard from './SkeletonCard.jsx'
import { findAirport } from '../data/airports.js'

const SORTS = [
  { value: 'price', label: 'Cheapest' },
  { value: 'duration', label: 'Shortest' },
  { value: 'date', label: 'Earliest departure' },
]

const POPULAR_ROUTES = [
  { from: 'TLV', to: 'BCN' },
  { from: 'TLV', to: 'ATH' },
  { from: 'TLV', to: 'LHR' },
  { from: 'TLV', to: 'FCO' },
  { from: 'TLV', to: 'BKK' },
  { from: 'TLV', to: 'JFK' },
]

function Panel({ children }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center">{children}</div>
  )
}

export default function ResultsSection({ status, results, criteria, error, onRetry, onPickRoute }) {
  const [sort, setSort] = useState('price')

  const cheapestId = useMemo(() => {
    if (!results?.length) return null
    return results.reduce((min, o) => (o.price < min.price ? o : min)).id
  }, [results])

  const sorted = useMemo(() => {
    if (!results?.length) return []
    const copy = [...results]
    if (sort === 'price') copy.sort((a, b) => a.price - b.price)
    else if (sort === 'duration')
      copy.sort(
        (a, b) =>
          a.durationOutbound + a.durationReturn - (b.durationOutbound + b.durationReturn),
      )
    else copy.sort((a, b) => a.departDate.localeCompare(b.departDate))
    return copy
  }, [results, sort])

  return (
    <section
      id="results"
      aria-label="Flight results"
      /* scroll-mt clears the sticky header when scrolled into view */
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6"
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === 'loading' && 'Searching for flights'}
        {status === 'success' && `${results.length} fares found`}
        {status === 'error' && 'Search failed'}
      </div>

      {status === 'idle' && (
        <div className="text-center">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
            Popular from Tel Aviv
          </h2>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {POPULAR_ROUTES.map((route) => {
              const dest = findAirport(route.to)
              return (
                <button
                  key={`${route.from}-${route.to}`}
                  type="button"
                  onClick={() => onPickRoute(route)}
                  className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-muted transition-colors hover:border-accent/60 hover:text-text"
                >
                  <span className="font-semibold tracking-wider text-accent">{route.to}</span>{' '}
                  {dest?.city}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {status === 'error' && (
        <Panel>
          <p className="text-lg font-medium text-text">We couldn’t complete that search.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-xl border border-accent/60 px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-ink"
          >
            Try again
          </button>
        </Panel>
      )}

      {status === 'success' && results.length === 0 && (
        <Panel>
          <p className="text-lg font-medium text-text">No fares in that window.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Try widening your travel dates, shortening the trip, or adding a day or two of
            flexibility.
          </p>
        </Panel>
      )}

      {status === 'success' && results.length > 0 && (
        <>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text">
                {findAirport(criteria.from)?.city} → {findAirport(criteria.to)?.city}
              </h2>
              <p className="mt-1 text-sm text-muted">
                <span className="tnum">{results.length}</span> fares ·{' '}
                <span className="tnum">{criteria.nights}</span> nights
                {criteria.flexibility > 0 && <> ± {criteria.flexibility}</>} ·{' '}
                <span className="tnum">{criteria.passengers}</span>{' '}
                {criteria.passengers === 1 ? 'traveller' : 'travellers'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span id="sort-label" className="text-xs tracking-wide text-muted uppercase">
                Sort
              </span>
              <div role="group" aria-labelledby="sort-label" className="flex flex-wrap gap-2">
                {SORTS.map((option) => {
                  const active = sort === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSort(option.value)}
                      className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                        active
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-text'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {sorted.map((offer) => (
              <FlightCard
                key={offer.id}
                offer={offer}
                from={criteria.from}
                to={criteria.to}
                passengers={criteria.passengers}
                isCheapest={offer.id === cheapestId}
              />
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-muted">
            Prices are sample data — live fares arrive when the booking API is connected.
          </p>
        </>
      )}
    </section>
  )
}
