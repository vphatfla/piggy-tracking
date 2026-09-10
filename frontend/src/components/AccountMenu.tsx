import type { UserProfile } from '../api'
import { usePopoverMenu } from '../hooks/usePopoverMenu'
import type { ThemePreference } from '../theme'
import { CheckIcon } from './icons'

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Top-right account menu: identity, appearance, sign-out. Replaces the old
 *  bare name-text-plus-"Sign out"-button header. There is no router in this
 *  app, so "account setting" here is deliberately just the read-only name/
 *  email header below — not a screen to navigate to. */
export function AccountMenu({
  user,
  themePref,
  onThemeChange,
  onLogout,
}: {
  user: UserProfile
  themePref: ThemePreference
  onThemeChange: (pref: ThemePreference) => void
  onLogout: () => void
}) {
  const { open, setOpen, containerRef, triggerRef } = usePopoverMenu<HTMLDivElement, HTMLButtonElement>()

  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/12 text-headline font-semibold text-accent-text transition-opacity duration-200 ease-out hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {initials || '?'}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute top-full right-0 z-10 mt-2 w-64 origin-top-right rounded-card bg-surface-raised py-2 shadow-card transition-opacity duration-200 ease-out"
        >
          <div className="px-4 py-2">
            <p className="truncate text-headline font-semibold text-label">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-footnote text-label-secondary">{user.email}</p>
          </div>

          <div className="mx-2 my-1 border-t border-separator" />

          <p className="px-4 pt-1 pb-0.5 text-footnote font-semibold tracking-wide text-label-secondary uppercase">
            Appearance
          </p>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={themePref === opt.value}
              onClick={() => onThemeChange(opt.value)}
              className="flex min-h-11 w-full items-center justify-between px-4 text-body text-label transition-colors duration-200 ease-out hover:bg-surface"
            >
              {opt.label}
              {themePref === opt.value ? <span className="text-accent-text"><CheckIcon /></span> : null}
            </button>
          ))}

          <div className="mx-2 my-1 border-t border-separator" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex min-h-11 w-full items-center px-4 text-body text-danger-text transition-colors duration-200 ease-out hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
