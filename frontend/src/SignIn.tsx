import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from './google'

/** Renders Google's own sign-in button and hands the resulting ID token up.
 *  The ID token is never trusted here — the backend verifies its signature and
 *  audience before it means anything. */
export function SignIn({ onIdToken }: { onIdToken: (idToken: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  // The callback is read through a ref so re-renders never re-initialise the
  // Google client, which would render a second button. Assigned in an effect
  // rather than during render, which React forbids.
  const callbackRef = useRef(onIdToken)
  useEffect(() => {
    callbackRef.current = onIdToken
  }, [onIdToken])

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
          theme: 'filled_black',
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
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-slate-100">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          Piggy Tracking
        </h1>
        <p className="text-sm text-slate-400">Sign in to see your receipts and spending.</p>

        {GOOGLE_CLIENT_ID ? (
          <div ref={buttonRef} className="flex justify-center" />
        ) : (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-200">
            <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> is not set. Copy{' '}
            <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code> and put your Google OAuth client ID in it,
            then restart <code className="font-mono">npm run dev</code>.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
