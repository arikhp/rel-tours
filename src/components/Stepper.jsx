import { useId } from 'react'

/** A labelled number field with −/+ buttons, used for nights and passengers. */
export default function Stepper({ label, value, onChange, min = 1, max = 99, suffix, error }) {
  const id = useId()
  const clamp = (n) => Math.min(max, Math.max(min, n))

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase"
      >
        {label}
      </label>

      <div
        className={`flex items-center rounded-xl border bg-surface-2 transition-colors hover:border-accent/40 ${
          error ? 'border-red-500/70' : 'border-line'
        }`}
      >
        <button
          type="button"
          onClick={() => onChange(clamp(Number(value) - 1))}
          disabled={Number(value) <= min}
          aria-label={`Decrease ${label}`}
          className="px-3.5 py-3 text-xl leading-none text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>

        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={(e) => onChange(clamp(Number(e.target.value) || min))}
          className="w-full min-w-0 bg-transparent py-3 text-center text-lg font-semibold text-text tnum"
        />

        {suffix && <span className="pr-1 text-sm text-muted">{suffix}</span>}

        <button
          type="button"
          onClick={() => onChange(clamp(Number(value) + 1))}
          disabled={Number(value) >= max}
          aria-label={`Increase ${label}`}
          className="px-3.5 py-3 text-xl leading-none text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>

      <p className={`mt-1.5 text-xs ${error ? 'text-red-400' : 'text-muted'}`}>{error || ' '}</p>
    </div>
  )
}
