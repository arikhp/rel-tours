import Logo from './Logo.jsx'

const COLUMNS = [
  { title: 'Explore', links: ['Flight deals', 'Destinations', 'Flexible dates', 'Airlines'] },
  { title: 'Company', links: ['About R.E.L', 'Careers', 'Press', 'Contact'] },
  { title: 'Support', links: ['Help centre', 'Booking terms', 'Privacy', 'Cookies'] },
]

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={44} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Flexible-date flight search. Tell us roughly when and for how long — we find the
              cheapest way to make it happen.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold tracking-wider text-text uppercase">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted transition-colors hover:text-accent">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-line pt-6 text-xs text-muted">
          © {new Date().getFullYear()} R.E.L Tours. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
