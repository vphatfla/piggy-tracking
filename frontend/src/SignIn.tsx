import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from './google'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Google renders its own button and cannot read our CSS tokens, so its theme
 *  is the one thing that has to follow the OS appearance in JS rather than in
 *  the stylesheet. useSyncExternalStore keeps it in step live, without the
 *  set-state-in-effect dance. */
function usePrefersDark() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = darkQuery()
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => darkQuery().matches,
  )
}

/** Renders Google's own sign-in button and hands the resulting ID token up.
 *  The ID token is never trusted here — the backend verifies its signature and
 *  audience before it means anything. */
export function SignIn({ onIdToken }: { onIdToken: (idToken: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const prefersDark = usePrefersDark()

  // The callback is read through a ref so re-renders never re-initialise the
  // Google client, which would render a second button. Assigned in an effect
  // rather than during render, which React forbids.
  const callbackRef = useRef(onIdToken)
  useEffect(() => {
    callbackRef.current = onIdToken
  }, [onIdToken])

  // Re-runs only when the OS appearance actually flips, which is the one case
  // where the button genuinely has to be drawn again.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false

    void loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !buttonRef.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => callbackRef.current(response.credential),
        })
        buttonRef.current.replaceChildren()
        google.accounts.id.renderButton(buttonRef.current, {
          theme: prefersDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
        })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
  }, [prefersDark])

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-title-lg font-bold tracking-tight text-label">Piggy Tracking</h1>
        <p className="mt-2 text-subheadline text-label-secondary">
          Sign in to see your receipts and spending.
        </p>

        {GOOGLE_CLIENT_ID ? (
          <div ref={buttonRef} className="mt-8 flex justify-center" />
        ) : (
          <p className="mt-8 rounded-card bg-surface-raised px-4 py-3 text-left text-footnote text-label-secondary">
            <span className="font-semibold text-label">Not configured. </span>
            <code>VITE_GOOGLE_CLIENT_ID</code> is not set. Copy <code>.env.example</code> to{' '}
            <code>.env.local</code> and put your Google OAuth client ID in it, then restart{' '}
            <code>npm run dev</code>.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-card bg-danger/10 px-4 py-3 text-left text-footnote text-danger-text"
          >
            <span className="font-semibold">Sign-in failed. </span>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
