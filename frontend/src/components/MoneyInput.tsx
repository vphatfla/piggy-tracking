import { useEffect, useRef, useState } from 'react'
import { cents as parseCents } from '../format'

// Defensive ceiling only — stops a runaway paste from producing an absurd
// number, not a product-meaningful limit.
const MAX_CENTS = 99_999_999_999

function centsToAmountString(totalCents: number): string {
  const whole = Math.floor(totalCents / 100)
  const frac = totalCents % 100
  return `${whole}.${String(frac).padStart(2, '0')}`
}

function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  return digits ? Math.min(Number(digits), MAX_CENTS) : 0
}

/** A keypad-style money input: typing "1","2","3" produces "1.23", like a
 *  banking app — there is no decimal key, digits shift in from the right.
 *  Driven entirely off `onChange` (not `onKeyDown`/`onPaste`) so it behaves
 *  the same with a mobile virtual keyboard, a paste, or a physical keyboard:
 *  every change strips non-digits from the raw field value and treats what's
 *  left as the new total cents, then reformats. Callers still pass/receive
 *  the same canonical decimal string ("1.23") the rest of the app expects. */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
  'aria-label': ariaLabel,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  'aria-label': string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const lastEmitted = useRef(value)
  const [cents, setCents] = useState(() => (value ? parseCents(value) : 0))

  // Resync when the parent changes `value` out from under us (reset after
  // submit, seeding a different row) — but not from our own echo, or the
  // formatting would fight itself on every keystroke.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setCents(value ? parseCents(value) : 0)
      lastEmitted.current = value
    }
  }, [value])

  const display = cents === 0 ? '' : centsToAmountString(cents)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = digitsToCents(e.target.value)
    setCents(next)
    const str = next === 0 ? '' : centsToAmountString(next)
    lastEmitted.current = str
    onChange(str)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onFocus={() => {
        // Keypad semantics: typing always appends/removes at the end, so the
        // caret can't be left mid-string from a click.
        const el = inputRef.current
        if (el) requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  )
}
