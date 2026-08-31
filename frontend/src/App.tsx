import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  createTransaction,
  getReceipts,
  getTransactions,
  logout as logoutRequest,
  refreshSession,
  signInWithGoogle,
  type Receipt,
  type Session,
  type Transaction,
} from './api'
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
      <main className="flex min-h-screen items-center justify-center bg-slate-900 text-sm text-slate-400">
        Restoring session…
      </main>
    )
  }

  if (state.status === 'anonymous') {
    return (
      <>
        <SignIn onIdToken={onIdToken} />
        {state.error && (
          <p className="fixed inset-x-0 bottom-4 mx-auto max-w-md rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">
            {state.error}
          </p>
        )}
      </>
    )
  }

  return <Dashboard session={state.session} onLogout={onLogout} />
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { accessToken, user } = session
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [r, t] = await Promise.all([getReceipts(accessToken), getTransactions(accessToken)])
      setReceipts(r)
      setTransactions(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [accessToken])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!merchant.trim() || !amount.trim()) return
    try {
      await createTransaction(accessToken, {
        merchantName: merchant.trim(),
        amount: amount.trim(),
        category: 'Uncategorised',
      })
      setMerchant('')
      setAmount('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const receiptFor = (id: number | null) => receipts.find((r) => r.id === id)
  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <main className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              Piggy Tracking
            </h1>
            <p className="text-sm text-slate-400">
              {user.firstName} {user.lastName}{' '}
              <span className="font-mono text-xs text-slate-500">{user.email}</span>
            </p>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Sign out
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-right font-mono text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Add
          </button>
        </form>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <section className="space-y-3">
          <h2 className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Transactions</span>
            <span className="font-mono text-sm normal-case text-slate-300">
              {total.toFixed(2)} total
            </span>
          </h2>
          <ul className="space-y-3">
            {transactions.map((t) => {
              const receipt = receiptFor(t.receiptId)
              return (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-100">{t.merchantName}</h3>
                    <p className="mt-1 text-sm text-slate-400">{t.category}</p>
                    <p className="mt-2 font-mono text-xs text-slate-500">
                      {receipt
                        ? `receipt #${receipt.id} · ${receipt.receiptFileName ?? 'no file'} · ${receipt.date}`
                        : 'no receipt'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-lg tabular-nums text-emerald-300">
                    {t.amount}
                  </span>
                </li>
              )
            })}
            {transactions.length === 0 && !error && (
              <li className="text-sm text-slate-500">No transactions yet.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
