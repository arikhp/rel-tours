const POINTS = [
  { title: 'Search a window', body: 'Not one day — a whole range you could travel in.' },
  { title: 'Set your trip length', body: 'Tell us the nights; we find where they fit cheapest.' },
  { title: 'Compare every date', body: 'One search scans every departure in your window.' },
]

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-8 sm:pt-24">
      {/* Cyan glow behind the headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[64rem] max-w-[140vw] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(34,211,238,0.28), rgba(59,130,246,0.14) 55%, transparent)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-1.5 text-xs tracking-wide text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Flexible-date fare search
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Cheap flights,{' '}
          <span className="bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            found for you
          </span>
          .
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Enter your airports, the window you could travel in, and how long you want to stay.
          R.E.L Tours checks every date combination and surfaces the cheapest.
        </p>

        <ul className="mx-auto mt-10 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
          {POINTS.map((point, i) => (
            <li key={point.title} className="rounded-2xl border border-line bg-surface/60 p-4">
              <span className="text-xs font-semibold text-accent tnum">0{i + 1}</span>
              <h2 className="mt-1.5 text-sm font-semibold text-text">{point.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">{point.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
