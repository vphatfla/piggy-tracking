import { useId, useState, type RefObject } from 'react'
import type { Category, Merchant } from '../api'
import { usePopoverMenu } from '../hooks/usePopoverMenu'
import { inputClasses } from '../ui'

/** How many suggestions are worth showing. Past this the list is a search
 *  result, not a shortcut, and it starts covering the Add button. */
const MAX_SUGGESTIONS = 5

/** Prefix matches first, then anywhere-matches — someone typing "who" means
 *  Whole Foods before they mean "Tyson Wholesale". Within each group the
 *  server's alphabetical order carries through. */
function matchMerchants(merchants: Merchant[], query: string): Merchant[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  const prefix: Merchant[] = []
  const rest: Merchant[] = []
  for (const m of merchants) {
    const name = m.merchantName.toLowerCase()
    if (name.startsWith(q)) prefix.push(m)
    else if (name.includes(q)) rest.push(m)
  }
  const matches = [...prefix, ...rest]
  // Nothing to offer when the only match is already exactly what's typed.
  if (matches.length === 1 && matches[0].merchantName.toLowerCase() === q) return []
  return matches.slice(0, MAX_SUGGESTIONS)
}

/** The merchant field, with suggestions drawn from everything the household
 *  has ever entered. The app's first real combobox — CategorySelect is a native
 *  <select> on purpose, but there is no native control for "type freely, with
 *  hints", so this one is hand-built to the ARIA pattern.
 *
 *  Accepting a suggestion is always an explicit gesture, a click or Enter on a
 *  highlighted row. Deliberately not on blur: that fires exactly as the user
 *  tabs towards the category picker, which is the most surprising possible
 *  moment to rewrite two fields under them. Each row names the category it
 *  would file the entry under, so the autofill is a stated consequence rather
 *  than something that just happens. */
export function MerchantInput({
  value,
  onChange,
  onAccept,
  merchants,
  categories,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onAccept: (m: Merchant) => void
  merchants: Merchant[]
  categories: Category[]
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const listId = useId()
  const optionId = (i: number) => `${listId}-${i}`
  // usePopoverMenu is here for `open` and its outside-pointerdown dismissal
  // via containerRef. Its Escape branch and `triggerRef` go unused on purpose:
  // the trigger and the container are the same region here, and Escape needs
  // to stop propagating (see onKeyDown) rather than just close.
  const { open, setOpen, containerRef } = usePopoverMenu<HTMLDivElement, HTMLElement>()
  // -1 means nothing is highlighted, which is what keeps Enter meaning
  // "submit the transaction" until the user has actually picked a row.
  const [activeIndex, setActiveIndex] = useState(-1)

  const matches = matchMerchants(merchants, value)
  const expanded = open && matches.length > 0

  function accept(m: Merchant) {
    // The stored spelling wins over the user's casing — half the point of a
    // shared merchant list is that it converges on one name per place.
    onAccept(m)
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Sheet listens for Escape on `document` without checking the target, so
      // without stopping here one press would close this list *and* dismiss the
      // whole sheet. First Escape closes the list; a second falls through.
      if (!expanded) return
      e.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (matches.length === 0) return
      // Otherwise the caret jumps to one end of the text instead.
      e.preventDefault()
      setOpen(true)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      // Modulo over one *more* than the row count, so the highlight wraps back
      // through -1 and returns the user to their own typed text. That is what
      // makes "I meant none of these" recoverable without reaching for Escape.
      setActiveIndex((i) => ((i + delta + matches.length + 2) % (matches.length + 1)) - 1)
      return
    }
    if (e.key === 'Enter' && expanded && activeIndex >= 0) {
      // This Enter means "take that suggestion", not "add the transaction" —
      // the same reasoning as CategorySelect's create-mode input.
      e.preventDefault()
      accept(matches[activeIndex])
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Merchant"
        aria-label="Merchant"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        className={`${inputClasses} w-full`}
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Merchant suggestions"
          // Downward: the sheet rises from the bottom edge and this is its
          // topmost control, so the room is below. Absolute, not fixed and not
          // a portal — the sheet panel is transformed (so `fixed` would resolve
          // against the panel), and a portal would escape the `inert` subtree
          // that makes the closed sheet safe.
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-card bg-surface-raised py-1 shadow-card"
        >
          {matches.map((m, i) => {
            const category = categories.find((c) => c.id === m.categoryId)
            return (
              <li key={m.merchantName} role="option" aria-selected={i === activeIndex}>
                <button
                  id={optionId(i)}
                  // Inside <form onSubmit>, where a bare button submits — this
                  // one picks a merchant.
                  type="button"
                  // Keeps the click from blurring the input first; pointerdown
                  // outside already handles dismissal, so there is no need to
                  // race blur against click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => accept(m)}
                  className={`flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left transition-colors duration-200 ease-out hover:bg-surface ${
                    i === activeIndex ? 'bg-surface' : ''
                  }`}
                >
                  <span className="truncate text-body text-label">{m.merchantName}</span>
                  {category && (
                    <span className="truncate text-footnote text-label-secondary">
                      {category.name}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
