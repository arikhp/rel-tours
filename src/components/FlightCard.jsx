import { formatDate } from '../lib/validation.js'

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

function stopsLabel(stops) {
  if (stops === 0) return 'Direct'
  return stops === 1 ? '1 stop' : `${stops} stops`
}

/** Airline colour derived from its code, so each carrier is visually stable. */
function avatarHue(code) {
  let h = 0
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function Leg({ from, to, date, duration, stops }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0">
        <div className="text-sm font-medium text-text">{formatDate(date, { day: 'numeric', month: 'short' })}</div>
        <div className="text-xs text-muted">
          {formatDate(date, { weekday: 'short' })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-sm font-semibold tracking-wider text-text">{from}</span>
        <span className="relative flex-1">
          <span className="block h-px bg-line" />
          {stops > 0 && (
            <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
          )}
        </span>
        <span className="text-sm font-semibold tracking-wider text-text">{to}</span>
      </div>

      <div className="w-28 shrink-0 text-right">
        <div className="text-xs text-muted tnum">{formatDuration(duration)}</div>
        <div className={`text-xs ${stops === 0 ? 'text-good' : 'text-muted'}`}>
          {stopsLabel(stops)}
        </div>
      </div>
    </div>
  )
}

export default function FlightCard({ offer, from, to, isCheapest, passengers }) {
  const hue = avatarHue(offer.airlineCode)
  const price = offer.price.toLocaleString(undefined, {
    style: 'currency',
    currency: offer.currency,
    maximumFractionDigits: 0,
  })

  return (
    <article
      className={`animate-rise rounded-2xl border bg-surface p-4 transition-colors hover:bg-surface-2 sm:p-5 ${
        isCheapest ? 'border-accent/70 ring-1 ring-accent/25' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* Airline */}
        <div className="flex w-full items-center gap-3 lg:w-52 lg:shrink-0">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink"
            style={{ backgroundColor: `hsl(${hue} 65% 62%)` }}
          >
            {offer.airlineCode}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text">{offer.airline}</div>
            <div className="text-xs text-muted tnum">{offer.nights} nights</div>
          </div>
          {isCheapest && (
            <span className="ml-auto rounded-full bg-good/15 px-2.5 py-1 text-xs font-semibold text-good lg:hidden">
              Cheapest
            </span>
          )}
        </div>

        {/* Legs */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Leg
            from={from}
            to={to}
            date={offer.departDate}
            duration={offer.durationOutbound}
            stops={offer.stops}
          />
          <Leg
            from={to}
            to={from}
            date={offer.returnDate}
            duration={offer.durationReturn}
            stops={offer.stops}
          />
        </div>

        {/* Price */}
        <div className="flex items-center justify-between gap-4 border-t border-line pt-4 lg:w-44 lg:shrink-0 lg:flex-col lg:items-end lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <div className="text-right">
            {isCheapest && (
              <span className="mb-1 hidden rounded-full bg-good/15 px-2.5 py-1 text-xs font-semibold text-good lg:inline-block">
                Cheapest
              </span>
            )}
            <div className="text-2xl font-bold text-text tnum">{price}</div>
            <div className="text-xs text-muted">
              total{passengers > 1 && <> · {passengers} travellers</>}
            </div>
          </div>
          <a
            href={offer.deepLink}
            className="rounded-xl border border-accent/60 px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-ink"
          >
            View deal
          </a>
        </div>
      </div>
    </article>
  )
}
