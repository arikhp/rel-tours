import { useEffect, useId, useRef, useState } from 'react'
import { findPlace, searchPlaces } from '../data/airports.js'

/**
 * A 3-letter IATA code field with type-ahead. Accepts city names too — typing
 * "barce" resolves to BCN — but the committed value is always the code.
 */
export default function AirportInput({ label, value, onChange, error, placeholder }) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)

  // While the dropdown is open the user is typing freely (possibly a city
  // name); otherwise the field mirrors the committed code.
  const shown = open ? query : value
  const suggestions = open ? searchPlaces(query) : []
  const resolved = findPlace(value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function commit(airport) {
    onChange(airport.code)
    setQuery('')
    setOpen(false)
  }

  function handleChange(event) {
    const next = event.target.value
    setQuery(next)
    setHighlight(0)
    setOpen(true)
    // A bare 3-letter code is committed as you type so the caption updates live.
    onChange(/^[A-Za-z]{3}$/.test(next.trim()) ? next.trim().toUpperCase() : next.trim())
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || suggestions.length === 0) {
      if (event.key === 'ArrowDown') setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      // Only intercept Enter while a suggestion is highlighted, so the form can
      // still be submitted from a field with the list closed.
      event.preventDefault()
      commit(suggestions[highlight])
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase"
      >
        {label}
      </label>

      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && suggestions.length > 0 ? `${listId}-${highlight}` : undefined
        }
        aria-invalid={Boolean(error)}
        aria-errormessage={error ? `${id}-error` : undefined}
        autoComplete="off"
        spellCheck="false"
        placeholder={placeholder}
        value={shown}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-xl border bg-surface-2 px-4 py-3 text-lg font-semibold tracking-[0.12em] text-text uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-muted/60 transition-colors hover:border-accent/40 ${
          error ? 'border-red-500/70' : 'border-line'
        }`}
      />

      {/* Caption: the error, or confirmation of which airport the code resolved to.
          Right padding below md keeps the text clear of the swap button, which
          floats over this row while the fields are stacked. */}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 pr-12 text-xs text-red-400 md:pr-0">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 truncate pr-12 text-xs text-muted md:pr-0">
          {resolved ? `${resolved.city}, ${resolved.country} · ${resolved.name}` : ' '}
        </p>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/60"
        >
          {suggestions.map((airport, index) => (
            <li
              key={airport.code}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => {
                // mousedown, not click — the outside-click handler fires first otherwise.
                event.preventDefault()
                commit(airport)
              }}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                index === highlight ? 'bg-accent/15' : ''
              }`}
            >
              <span className="w-10 shrink-0 font-semibold tracking-wider text-accent">
                {airport.code}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-text">{airport.city}</span>
                <span className="text-muted">
                  , {airport.country} · {airport.name}
                </span>
              </span>
              {airport.isMetro && (
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-accent uppercase">
                  {airport.airports.length} airports
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
