/**
 * R.E.L Tours mark.
 *
 * A complete R in the text colour, with a flight path climbing away from its
 * shoulder — solid at the nose, dotted where it has already been. The letter
 * stays fully legible; the climb is the accent.
 */
export default function Logo({ size = 40, showWordmark = true, tagline = true }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="R.E.L Tours"
        className="shrink-0"
      >
        <title>R.E.L Tours</title>
        <defs>
          <linearGradient id="relClimb" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent-2)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>

        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Stem and bowl. */}
          <path
            d="M12 42 V10 h9.5 a7.75 7.75 0 0 1 0 15.5 H12"
            stroke="currentColor"
            strokeWidth="4.5"
          />
          {/* Leg — without this the letter reads as a P. */}
          <path d="M20 25.5 L28 42" stroke="currentColor" strokeWidth="4.5" />

          {/* Trail already flown. */}
          <path
            d="M25.5 20 L31 14.5"
            stroke="url(#relClimb)"
            strokeWidth="2.5"
            strokeDasharray="0.5 4.5"
            opacity="0.8"
          />
          {/* The climb itself. */}
          <path d="M33.5 12 L42.5 5.5" stroke="url(#relClimb)" strokeWidth="4" />
        </g>

        <circle cx="43.5" cy="5" r="3" fill="var(--color-accent)" />
      </svg>

      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.05rem] font-semibold tracking-tight text-text">
            R.E.L <span className="font-medium tracking-[0.22em] text-muted">TOURS</span>
          </span>
          {tagline && (
            <span className="mt-1 text-[0.62rem] tracking-[0.18em] text-muted uppercase">
              find your fare
            </span>
          )}
        </span>
      )}
    </span>
  )
}
