import type { Sort } from '../sort'

export function SortChip({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: Sort['dir']
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 items-center gap-1 rounded-full px-3 text-footnote font-semibold tracking-normal normal-case transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
        active ? 'bg-accent/12 text-accent-text' : 'text-label-secondary hover:text-label'
      }`}
    >
      {label}
      {active && <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )
}
