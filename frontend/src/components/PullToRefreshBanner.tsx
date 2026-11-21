import type { PullStatus } from '../hooks/usePullToRefresh'
import { CheckIcon, ReloadIcon } from './icons'

/** Sits just under the title row, hidden until a pull-to-refresh gesture is
 *  in progress. Tracks the drag by `pullDistance` while `'pulling'`, pins at
 *  a fixed offset while the fetch runs, then swaps to a green "Reloaded"
 *  sticker before fading back out — see usePullToRefresh for the state
 *  machine driving this. */
export function PullToRefreshBanner({ status, pullDistance }: { status: PullStatus; pullDistance: number }) {
  if (status === 'idle' && pullDistance === 0) return null

  const offset = status === 'pulling' ? pullDistance : 48

  return (
    <div
      className="-mt-1 mb-1 flex justify-center overflow-hidden transition-[height] duration-200 ease-out"
      style={{ height: offset }}
      aria-hidden={status === 'pulling'}
    >
      {/* Seen via the pill below; announced here, since the icon swap and
          colour alone carry nothing to a screen reader. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status === 'success' ? 'Reloaded' : ''}
      </p>
      <div className="flex items-center gap-1.5 self-end pb-1">
        {status === 'success' ? (
          <span className="flex items-center gap-1.5 text-footnote font-semibold text-success motion-safe:animate-pop">
            <CheckIcon />
            Reloaded
          </span>
        ) : (
          <span
            className={`text-label-tertiary ${status === 'refreshing' ? 'motion-safe:animate-spin' : ''}`}
          >
            <ReloadIcon />
          </span>
        )}
      </div>
    </div>
  )
}
