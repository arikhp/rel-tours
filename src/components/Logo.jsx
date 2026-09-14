/**
 * R.E.L Tours brand mark.
 *
 * Hand-authored SVG so it stays crisp at any size and recolors with the theme
 * tokens. `showWordmark={false}` gives just the badge (footer, favicon parity).
 */
export default function Logo({ size = 40, showWordmark = true, tagline = true }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="R.E.L Tours"
        className="shrink-0"
      >
        <title>R.E.L Tours</title>
        <defs>
          <linearGradient id="relBadge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-accent-2)" />
          </linearGradient>
        </defs>

        <rect width="64" height="64" rx="14" fill="url(#relBadge)" />

        {/* Flight path sweeping up through the lower-right corner. */}
        <path
          d="M6 52 C 26 50, 44 38, 58 16"
          fill="none"
          stroke="#070b12"
          strokeOpacity="0.32"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        <text
          x="32"
          y="39"
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontSize="21"
          fontWeight="700"
          letterSpacing="0.5"
          fill="#06121b"
        >
          REL
        </text>
      </svg>

      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.05rem] font-semibold tracking-tight text-text">
            R.E.L{' '}
            <span className="font-medium tracking-[0.22em] text-muted">TOURS</span>
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
