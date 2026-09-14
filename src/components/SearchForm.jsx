import { useId, useState } from 'react'
import AirportInput from './AirportInput.jsx'
import Stepper from './Stepper.jsx'
import { validateSearch, today, toISODate, fromISODate } from '../lib/validation.js'

const FLEX_OPTIONS = [
  { value: 0, label: 'Exact' },
  { value: 1, label: '± 1 day' },
  { value: 2, label: '± 2 days' },
  { value: 3, label: '± 3 days' },
]

const CABINS = [
  { value: 'economy', label: 'Economy' },
  { value: 'premium', label: 'Premium Economy' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First' },
]

function defaultCriteria() {
  const start = new Date(today())
  start.setDate(start.getDate() + 30)
  const end = new Date(start)
  end.setDate(end.getDate() + 90)

  return {
    from: '',
    to: '',
    earliest: toISODate(start),
    latest: toISODate(end),
    nights: 7,
    flexibility: 2,
    passengers: 1,
    cabin: 'economy',
  }
}

function DateField({ label, value, min, onChange, error }) {
  const id = useId()
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-surface-2 px-4 py-3 text-base text-text transition-colors hover:border-accent/40 ${
          error ? 'border-red-500/70' : 'border-line'
        }`}
      />
      <p className={`mt-1.5 text-xs ${error ? 'text-red-400' : 'text-muted'}`}>{error || ' '}</p>
    </div>
  )
}

export default function SearchForm({ onSearch, busy, prefill }) {
  const [criteria, setCriteria] = useState(defaultCriteria)
  const [errors, setErrors] = useState({})

  // A "popular route" chip pushes codes in without remounting the form.
  const [appliedPrefill, setAppliedPrefill] = useState(null)
  if (prefill && prefill !== appliedPrefill) {
    setAppliedPrefill(prefill)
    setCriteria((c) => ({ ...c, from: prefill.from, to: prefill.to }))
    setErrors({})
  }

  function set(patch) {
    setCriteria((c) => ({ ...c, ...patch }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const found = validateSearch(criteria)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    onSearch({
      ...criteria,
      from: criteria.from.toUpperCase(),
      to: criteria.to.toUpperCase(),
      nights: Number(criteria.nights),
      passengers: Number(criteria.passengers),
    })
  }

  function swap() {
    set({ from: criteria.to, to: criteria.from })
    setErrors((e) => ({ ...e, from: undefined, to: undefined }))
  }

  const windowDays = (() => {
    const a = fromISODate(criteria.earliest)
    const b = fromISODate(criteria.latest)
    if (!a || !b || b < a) return null
    return Math.round((b - a) / 86400000) + 1
  })()

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-3xl border border-line bg-surface/90 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7"
    >
      {/* Route */}
      <div className="relative grid gap-4 md:grid-cols-2">
        <AirportInput
          label="From"
          placeholder="Airport code, e.g. TLV"
          value={criteria.from}
          onChange={(v) => set({ from: v })}
          error={errors.from}
        />

        <button
          type="button"
          onClick={swap}
          aria-label="Swap departure and arrival"
          className="absolute top-[4.6rem] left-1/2 z-20 hidden h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:border-accent hover:text-accent md:flex"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 4v13M7 4L4 7m3-3l3 3M17 20V7m0 13l3-3m-3 3l-3-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <AirportInput
          label="To"
          placeholder="Airport code, e.g. BCN"
          value={criteria.to}
          onChange={(v) => set({ to: v })}
          error={errors.to}
        />
      </div>

      <div className="my-5 h-px bg-line" />

      {/* Window, duration, party */}
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Travel window and trip details</legend>

        <DateField
          label="Travel between"
          value={criteria.earliest}
          min={toISODate(today())}
          onChange={(v) =>
            set({ earliest: v, latest: criteria.latest < v ? v : criteria.latest })
          }
          error={errors.earliest}
        />
        <DateField
          label="and"
          value={criteria.latest}
          min={criteria.earliest || toISODate(today())}
          onChange={(v) => set({ latest: v })}
          error={errors.latest}
        />
        <Stepper
          label="Trip length"
          suffix="nights"
          value={criteria.nights}
          min={1}
          max={60}
          onChange={(v) => set({ nights: v })}
          error={errors.nights}
        />
        <Stepper
          label="Passengers"
          value={criteria.passengers}
          min={1}
          max={9}
          onChange={(v) => set({ passengers: v })}
          error={errors.passengers}
        />
      </fieldset>

      {/* Flexibility + cabin + submit */}
      <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div>
            <span
              id="flex-label"
              className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase"
            >
              Date flexibility
            </span>
            <div role="group" aria-labelledby="flex-label" className="flex flex-wrap gap-2">
              {FLEX_OPTIONS.map((opt) => {
                const active = criteria.flexibility === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ flexibility: opt.value })}
                    className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                      active
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-text'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="cabin"
              className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase"
            >
              Cabin
            </label>
            <select
              id="cabin"
              value={criteria.cabin}
              onChange={(e) => set({ cabin: e.target.value })}
              className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-text transition-colors hover:border-accent/40"
            >
              {CABINS.map((c) => (
                <option key={c.value} value={c.value} className="bg-surface">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-linear-to-r from-accent to-accent-2 px-8 py-3.5 font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
        >
          {busy ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Searching…
            </>
          ) : (
            'Find cheap flights'
          )}
        </button>
      </div>

      {windowDays && (
        <p className="mt-4 text-xs text-muted">
          Scanning <span className="text-text tnum">{windowDays}</span> days for a{' '}
          <span className="text-text tnum">{criteria.nights}</span>-night trip
          {criteria.flexibility > 0 && <> (± {criteria.flexibility})</>}.
        </p>
      )}
    </form>
  )
}
