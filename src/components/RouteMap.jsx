import { useEffect, useMemo, useState } from 'react'
import { geoOrthographic, geoPath, geoGraticule, geoInterpolate, geoDistance } from 'd3-geo'
import { findPlace } from '../data/airports.js'

const SIZE = 260 // viewBox is square; the globe is inscribed in it
const R = SIZE / 2 - 6

const EARTH_RADIUS_KM = 6371
const CRUISE_KMH = 850 // rough jet cruise, for the flight-time estimate
const TAXI_MINUTES = 35 // ground time either end, so short hops aren't understated

/**
 * The world outline is ~100 KB and is only needed once a search has run, so it
 * loads as its own chunk the first time this component mounts rather than
 * riding along with the initial page.
 */
let worldPromise = null
function loadWorld() {
  worldPromise ||= Promise.all([
    import('world-atlas/countries-110m.json'),
    import('topojson-client'),
  ]).then(([topo, { feature }]) => {
    const world = topo.default ?? topo
    return feature(world, world.objects.countries)
  })
  return worldPromise
}

/** Initial great-circle bearing from a to b, in degrees clockwise from north. */
function bearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180
  const φ1 = lat1 * toRad
  const φ2 = lat2 * toRad
  const Δλ = (lon2 - lon1) * toRad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) / toRad + 360) % 360
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const compassPoint = (deg) => COMPASS[Math.round(deg / 22.5) % 16]

function formatFlightTime(minutes) {
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-text tnum">
        {value}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted">{sub}</span>}
      </dd>
    </div>
  )
}

export default function RouteMap({ from, to }) {
  const [world, setWorld] = useState(null)

  useEffect(() => {
    let alive = true
    loadWorld().then((w) => alive && setWorld(w))
    return () => {
      alive = false
    }
  }, [])

  const origin = findPlace(from)
  const destination = findPlace(to)

  const geometry = useMemo(() => {
    if (!origin || !destination) return null

    const a = [origin.lon, origin.lat]
    const b = [destination.lon, destination.lat]
    const interpolate = geoInterpolate(a, b)

    const radiansApart = geoDistance(a, b)
    const mid = interpolate(0.5)
    const halfRouteDeg = (radiansApart * 180) / Math.PI / 2

    // Zoom so the route fills the disc rather than vanishing into it: a 340 km
    // hop on a whole-earth globe is two dots on top of each other. Scale beyond
    // R shows a regional view (the globe is clipped to the disc); never zoom out
    // past the full globe, and cap the zoom so a city pair still has context.
    const halfAngle = Math.max(radiansApart / 2, 1e-6)
    const scale = Math.min(12 * R, Math.max(R, (0.45 * R) / Math.sin(halfAngle)))

    // A great circle through the centre of an orthographic projection draws as a
    // dead straight line, so nudge the centre off the route to make it bow. Keep
    // the nudge proportional to the route — at high zoom a fixed tilt would push
    // the whole route out of view — and inside the visible hemisphere.
    const tilt = Math.max(0, Math.min(22, halfRouteDeg * 0.55, 86 - halfRouteDeg))

    const projection = geoOrthographic()
      .scale(scale)
      .translate([SIZE / 2, SIZE / 2])
      .rotate([-mid[0], -(mid[1] - tilt)])
      .clipAngle(90)

    const path = geoPath(projection)
    const arcPoints = Array.from({ length: 129 }, (_, i) => interpolate(i / 128))

    // Graticule spacing follows the zoom, so a regional view isn't left with a
    // single stray line and the whole globe isn't a dense mesh.
    const visibleDeg = (Math.asin(Math.min(1, R / scale)) * 180) / Math.PI
    const step = visibleDeg > 60 ? 15 : visibleDeg > 25 ? 10 : visibleDeg > 10 ? 5 : 2

    const km = radiansApart * EARTH_RADIUS_KM

    return {
      projection,
      path,
      graticule: path(geoGraticule().step([step, step])()),
      arc: path({ type: 'LineString', coordinates: arcPoints }),
      pa: projection(a),
      pb: projection(b),
      km,
      bearingDeg: bearing(a, b),
      minutes: (km / CRUISE_KMH) * 60 + TAXI_MINUTES,
    }
  }, [origin, destination])

  if (!origin || !destination || !geometry) return null

  const { path, pa, pb, km, bearingDeg, minutes } = geometry
  const miles = km * 0.621371

  // An endpoint on the far side of the globe projects to null.
  const visible = (p) => Array.isArray(p) && Number.isFinite(p[0])

  const label = (place, point, anchor) =>
    visible(point) && (
      <g>
        <circle cx={point[0]} cy={point[1]} r="4.5" fill="var(--color-accent)" />
        <circle
          cx={point[0]}
          cy={point[1]}
          r="9"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1"
          opacity="0.45"
        />
        <text
          x={point[0] + (anchor === 'end' ? -14 : 14)}
          y={point[1] + 4}
          textAnchor={anchor}
          className="fill-text text-[11px] font-semibold"
          style={{ paintOrder: 'stroke', stroke: 'var(--color-ink)', strokeWidth: 3 }}
        >
          {place.code}
        </text>
      </g>
    )

  return (
    <section
      aria-label={`Route from ${origin.city} to ${destination.city}`}
      className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="flex flex-col items-center gap-6 p-5 sm:p-6 lg:flex-row lg:gap-10">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[220px] w-[220px] shrink-0 sm:h-[260px] sm:w-[260px]"
          role="img"
          aria-label={`Globe showing the great-circle route from ${origin.code} to ${destination.code}`}
        >
          <defs>
            <radialGradient id="globeFill" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#16202e" />
              <stop offset="100%" stopColor="#0b111a" />
            </radialGradient>
            <linearGradient id="arcStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-accent-2)" />
              <stop offset="100%" stopColor="var(--color-accent)" />
            </linearGradient>
            {/* Short routes zoom past the disc; clip so nothing spills out. */}
            <clipPath id="globeClip">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} />
            </clipPath>
          </defs>

          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#globeFill)" />

          <g clipPath="url(#globeClip)">
            <path
              d={geometry.graticule}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="0.5"
              opacity="0.8"
            />

            {world && (
              <path
                d={path(world)}
                fill="var(--color-surface-2)"
                stroke="var(--color-line)"
                strokeWidth="0.5"
              />
            )}

            <path
              d={geometry.arc}
              fill="none"
              stroke="url(#arcStroke)"
              strokeWidth="2.25"
              strokeLinecap="round"
              className="route-arc"
            />
          </g>

          {/* Limb of the disc, drawn last so the edge stays crisp. */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-line)" strokeWidth="1" />

          {label(origin, pa, 'end')}
          {label(destination, pb, 'start')}
        </svg>

        <div className="min-w-0 flex-1 text-center lg:text-left">
          <h3 className="text-lg font-semibold text-text">
            {origin.city}{' '}
            <span className="font-normal tracking-wider text-muted">({origin.code})</span>
            <span className="mx-2 text-accent">→</span>
            {destination.city}{' '}
            <span className="font-normal tracking-wider text-muted">({destination.code})</span>
          </h3>
          <p className="mt-1 text-sm text-muted">
            {origin.isMetro || destination.isMetro
              ? 'Searching every airport in the selected cities.'
              : 'Great-circle route — the shortest path over the earth.'}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Stat
              label="Distance"
              value={Math.round(km).toLocaleString()}
              sub={`km · ${Math.round(miles).toLocaleString()} mi`}
            />
            <Stat label="Nonstop time" value={formatFlightTime(minutes)} sub="approx" />
            <Stat
              label="Heading"
              value={`${Math.round(bearingDeg)}°`}
              sub={compassPoint(bearingDeg)}
            />
          </dl>
        </div>
      </div>
    </section>
  )
}
