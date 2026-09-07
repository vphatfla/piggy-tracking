export type View = 'budgets' | 'list'

const OPTIONS: { value: View; label: string }[] = [
  { value: 'budgets', label: 'Budgets' },
  { value: 'list', label: 'List' },
]

/** The dashboard's own section header, not a settings control — same
 *  role="radiogroup"/role="radio" pattern AccountMenu's theme picker already
 *  uses, reused rather than inventing a tabs pattern nothing else here has.
 *  Replaces the old "BUDGETS"/"TRANSACTIONS" eyebrow captions: the toggle
 *  names the section itself, so a separate label would be redundant. */
export function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="inline-flex items-center gap-0.5 rounded-full bg-surface-raised p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`min-h-11 rounded-full px-4 text-subheadline font-semibold transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
            value === opt.value ? 'bg-surface text-label shadow-card' : 'text-label-secondary hover:text-label'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
