import type { ReactNode } from 'react'
import { formatMoney } from '../format'
import { ChevronDown } from './icons'

/** One category's line: what was spent, against the limit if there is one.
 *  `limit` in cents; null means no limit has ever been set for this category,
 *  which is deliberately shown as "No limit" rather than as 0 spent of 0.
 *
 *  Interactive only when there's something to drill into: a row with a limit
 *  but no spend this month has no transactions behind it, so it stays a
 *  plain, non-tappable line — no dead-end tap into an empty list. `children`
 *  is the drill-down content (a list of this category's transactions),
 *  rendered by the caller and shown only while `expanded`. */
export function BudgetRow({
  name,
  spent,
  limit,
  inherited,
  first,
  expanded,
  onToggle,
  children,
}: {
  name: string
  spent: number
  limit: number | null
  inherited: boolean
  first: boolean
  expanded: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  const over = limit !== null && spent > limit
  // Clamped so a 300%-of-budget row does not render a bar out of its track;
  // the number above it already says how far over it is.
  const pct = limit !== null && limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
  const interactive = spent > 0

  const summary = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-subheadline font-semibold text-label">{name}</p>
        <p className="flex shrink-0 items-center gap-1.5 text-subheadline tabular-nums text-label-secondary">
          <span>
            <span className={over ? 'font-semibold text-danger-text' : 'text-label'}>
              {formatMoney(spent / 100)}
            </span>
            {limit !== null && ` of ${formatMoney(limit / 100)}`}
          </span>
          {interactive && (
            <span
              className={`text-label-tertiary transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <ChevronDown />
            </span>
          )}
        </p>
      </div>

      {limit === null ? (
        <p className="mt-1 text-caption text-label-tertiary">No limit set</p>
      ) : (
        <>
          {/* aria-hidden: the bar is a redraw of the numbers directly above it,
              so announcing it again is noise, not information. */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                over ? 'bg-danger' : 'bg-accent'
              }`}
              style={{ width: `${over ? 100 : pct}%` }}
            />
          </div>
          <p className="mt-1 text-caption text-label-tertiary">
            {over
              ? `${formatMoney((spent - limit) / 100)} over`
              : `${formatMoney((limit - spent) / 100)} left`}
            {inherited && ' · carried over'}
          </p>
        </>
      )}
    </>
  )

  return (
    <li className={first ? '' : 'border-t border-separator'}>
      {interactive ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="w-full px-4 py-3 text-left transition-colors duration-150 ease-out active:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {summary}
        </button>
      ) : (
        <div className="px-4 py-3">{summary}</div>
      )}

      {/* Recessed rather than another card stacked on top: a colour change,
          not a border, reads as content set *into* the row above it. */}
      {expanded && <div className="border-t border-separator bg-bg-grouped">{children}</div>}
    </li>
  )
}
