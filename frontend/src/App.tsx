import { useEffect, useRef, useState } from 'react'
import { ApiError, logout as logoutRequest, refreshSession, signInWithGoogle, type Session } from './api'
import { Dashboard } from './components/Dashboard'
import { SignIn } from './SignIn'

type SessionState =
  | { status: 'restoring' }
  | { status: 'anonymous'; error?: string }
  | { status: 'authenticated'; session: Session }

export default function App() {
  const [state, setState] = useState<SessionState>({ status: 'restoring' })

  // Silent login. The ref guard matters: StrictMode invokes effects twice in
  // dev, and because refreshing *rotates* the token, a second concurrent call
  // would present the already-revoked cookie and get a 401.
  const restoreStarted = useRef(false)
  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true

    refreshSession()
      .then((session) => setState({ status: 'authenticated', session }))
      .catch((e: unknown) => {
        // A 401 is the normal "no session to restore" answer, not a failure.
        const error = e instanceof ApiError && e.status === 401 ? undefined : String(e)
        setState({ status: 'anonymous', error })
      })
  }, [])

  async function onIdToken(idToken: string) {
    try {
      setState({ status: 'authenticated', session: await signInWithGoogle(idToken) })
    } catch (e) {
      setState({ status: 'anonymous', error: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onLogout() {
    // Drop the in-memory token even if the request fails — the client half of
    // the session ends either way.
    try {
      await logoutRequest()
    } finally {
      window.google?.accounts.id.disableAutoSelect()
      setState({ status: 'anonymous' })
    }
  }

  if (state.status === 'restoring') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg text-footnote text-label-secondary">
        Restoring session…
      </main>
    )
  }

  if (state.status === 'anonymous') {
    return (
      <>
        <SignIn onIdToken={onIdToken} />
        {state.error && (
          <p
            role="alert"
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto max-w-md rounded-card bg-danger/10 px-4 py-3 text-center text-footnote text-danger-text"
          >
            <span className="font-semibold">Something went wrong. </span>
            {state.error}
          </p>
        )}
      </>
    )
  }

  return <Dashboard session={state.session} onLogout={onLogout} />
}
