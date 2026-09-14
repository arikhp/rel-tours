import { useState } from 'react'
import Logo from './Logo.jsx'

const NAV = ['Flights', 'Deals', 'About', 'Contact']

export default function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <a href="#top" className="shrink-0">
          <Logo size={40} />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item}
              href="#"
              className="text-sm text-muted transition-colors hover:text-text"
            >
              {item}
            </a>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-line p-2.5 text-muted transition-colors hover:text-text md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d={open ? 'M6 6l12 12M18 6L6 18' : 'M3 6h18M3 12h18M3 18h18'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <nav aria-label="Mobile" className="border-t border-line px-4 py-3 md:hidden">
          {NAV.map((item) => (
            <a
              key={item}
              href="#"
              onClick={() => setOpen(false)}
              className="block py-2.5 text-sm text-muted transition-colors hover:text-text"
            >
              {item}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
