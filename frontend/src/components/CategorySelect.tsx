import { useState } from 'react'
import type { Category } from '../api'
import { useCategoryOwners } from '../categoryOwners'
import { inputClasses } from '../ui'
import { ChevronDown } from './icons'

/** Sentinel option value. A string, because that is all a <select> carries, and
 *  one that cannot collide with a numeric id. */
const NEW_CATEGORY = 'new'

/** A native <select> rather than a custom listbox: on iOS this is the system
 *  wheel picker, which is the HIG-correct control and brings keyboard and
 *  VoiceOver support for free. The chevron is drawn by us because Tailwind's
 *  reset strips the platform one. */
export function CategorySelect({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number) => void
  onCreate: (name: string) => Promise<Category>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { labelFor, budgetOwnerId } = useCategoryOwners()

  // Collapse same-named categories (both members tend to have a "Groceries")
  // into one option. The representative is whichever sibling is already
  // selected — so an in-flight pick (e.g. from merchant autocomplete, which
  // can hand back either duplicate's id) never goes blank — otherwise the
  // budget owner's copy, since that's what "+ New category" always resolves
  // to from here on. Unshared or showing one member's set, every name-group
  // has exactly one row, so this is a no-op.
  const byName = new Map<string, Category[]>()
  for (const c of categories) {
    const key = c.name.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), c])
  }
  const merged = [...byName.values()].map(
    (group) => group.find((c) => c.id === value) ?? group.find((c) => c.userId === budgetOwnerId) ?? group[0],
  )

  // Only populated while a share shows both members' categories; otherwise
  // every label is null and the list stays flat, exactly as before.
  const groups = new Map<string, Category[]>()
  for (const c of merged) {
    const label = labelFor(c) ?? ''
    groups.set(label, [...(groups.get(label) ?? []), c])
  }

  async function save() {
    const name = draft?.trim()
    // An empty save is a cancel: there is nothing to create, and refusing with
    // an error would be pedantic about a field the user clearly abandoned.
    if (!name) {
      setDraft(null)
      return
    }
    setSaving(true)
    try {
      // The component selects the result itself rather than leaving that to the
      // parent: this select is used both by the add form and by an edit panel,
      // and only one of them wants the add form's selection to move.
      onChange((await onCreate(name)).id)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  if (draft !== null) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraft(null)
            if (e.key === 'Enter') {
              // The form's own submit would post a transaction; this Enter
              // means "save the category".
              e.preventDefault()
              void save()
            }
          }}
          placeholder="New category"
          aria-label="New category name"
          className={`${inputClasses} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex min-h-11 shrink-0 items-center rounded-control px-3 text-body font-semibold text-accent-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="flex min-h-11 shrink-0 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY) setDraft('')
          else onChange(Number(e.target.value))
        }}
        aria-label="Category"
        className={`${inputClasses} min-h-11 w-full appearance-none pr-9`}
      >
        {value === null && <option value="">Category</option>}
        {[...groups].map(([label, group]) => {
          const options = group.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
          return label ? (
            <optgroup key={label} label={label}>
              {options}
            </optgroup>
          ) : (
            options
          )
        })}
        <option value={NEW_CATEGORY}>+ New category…</option>
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-label-tertiary">
        <ChevronDown />
      </span>
    </div>
  )
}
