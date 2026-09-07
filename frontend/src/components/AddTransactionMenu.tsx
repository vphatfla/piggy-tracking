import { usePopoverMenu } from '../hooks/usePopoverMenu'
import { CameraIcon, PencilIcon, PlusIcon, UploadIcon } from './icons'

/** The "+" beside the month total: the one place a transaction can be
 *  started. Three ways to get a transaction in are named up front — manual,
 *  scan, upload — because that is the real shape of the feature even though
 *  only manual is built; a plain "Add" button would have had to silently
 *  become this menu later; more scope up front so nothing does. Scan and
 *  Upload are visibly future work (a "Soon" tag, no handler) rather than
 *  hidden, so the roadmap is honest about what is coming without pretending
 *  it works today. */
export function AddTransactionMenu({ onManual }: { onManual: () => void }) {
  const { open, setOpen, containerRef, triggerRef } = usePopoverMenu<HTMLDivElement, HTMLButtonElement>()

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add a transaction"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
      >
        <PlusIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Add a transaction"
          className="absolute top-full right-0 z-10 mt-2 w-64 origin-top-right rounded-card bg-surface-raised py-2 shadow-card transition-opacity duration-200 ease-out"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onManual()
            }}
            className="flex min-h-11 w-full items-center gap-3 px-4 text-body text-label transition-colors duration-200 ease-out hover:bg-surface"
          >
            <PencilIcon />
            Add manually
          </button>

          {/* Named and visible rather than omitted, so the menu describes the
              real three-way shape of the feature — see the component doc
              comment. Not real <button disabled> elements: a disabled control
              is skipped by VoiceOver's rotor as if it weren't there, which
              would hide the "Soon" label along with it. role="menuitem" with
              aria-disabled keeps it announced, just not actionable. */}
          <div
            role="menuitem"
            aria-disabled="true"
            className="flex min-h-11 w-full items-center gap-3 px-4 text-body text-label-tertiary"
          >
            <CameraIcon />
            <span className="flex-1">Scan a receipt</span>
            <span className="text-caption font-semibold tracking-wide text-label-tertiary uppercase">Soon</span>
          </div>
          <div
            role="menuitem"
            aria-disabled="true"
            className="flex min-h-11 w-full items-center gap-3 px-4 text-body text-label-tertiary"
          >
            <UploadIcon />
            <span className="flex-1">Upload a receipt</span>
            <span className="text-caption font-semibold tracking-wide text-label-tertiary uppercase">Soon</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
