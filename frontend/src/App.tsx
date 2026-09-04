import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  createCategory,
  createTransaction,
  deleteBudget,
  deleteTransaction,
  getBudgets,
  getCategories,
  getReceipts,
  getTransactions,
  logout as logoutRequest,
  putBudget,
  refreshSession,
  signInWithGoogle,
  updateTransaction,
  type Budget,
  type Category,
  type Receipt,
  type Session,
  type Transaction,
  type UserProfile,
} from './api'
import { formatDate, formatMoney, sumMoney, todayIso } from './format'
import { addMonths, currentMonth, formatMonthLabel, monthBounds } from './month'
import { SignIn } from './SignIn'
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from './theme'

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

/** Notice styling is shared by the error and empty states so a message never
 *  relies on colour alone to read as one. */
function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-card bg-danger/10 px-4 py-3 text-subheadline text-danger-text"
    >
      <span className="font-semibold">Error. </span>
      {children}
    </p>
  )
}

// min-h-11 is the HIG's 44px floor — py-2.5 alone lands at 42.
const inputClasses =
  'min-w-0 min-h-11 rounded-control bg-surface-raised px-3 py-2.5 text-body text-label outline-none transition-shadow duration-200 ease-out placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent'

type SortKey = 'date' | 'amount'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

const cents = (value: string) => Math.round(Number(value) * 100)

/** Sorting is done here rather than on the server: the list is already bounded
 *  to one month, so reordering is instant and costs no round trip, and the API
 *  keeps exactly one canonical order. **Move this server-side the day a month's
 *  rows get paginated** — nothing else in the code will hint at that. */
function sortTransactions(list: Transaction[], sort: Sort) {
  const direction = sort.dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const primary =
      sort.key === 'amount' ? cents(a.amount) - cents(b.amount) : a.date.localeCompare(b.date)
    // Ties break on id descending, matching the server's order, so equal rows
    // do not shuffle between renders.
    return primary !== 0 ? primary * direction : b.id - a.id
  })
}

function SortChip({
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

/** Sentinel option value. A string, because that is all a <select> carries, and
 *  one that cannot collide with a numeric id. */
const NEW_CATEGORY = 'new'

/** A native <select> rather than a custom listbox: on iOS this is the system
 *  wheel picker, which is the HIG-correct control and brings keyboard and
 *  VoiceOver support for free. The chevron is drawn by us because Tailwind's
 *  reset strips the platform one. */
function CategorySelect({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number) => void
  onCreate: (name: string) => Promise<Category>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const name = draft?.trim()
    // An empty save is a cancel: there is nothing to create, and refusing with
    // an error would be pedantic about a field the user clearly abandoned.
    if (!name) {
      setDraft(null)
      return
    }
    setSaving(true)
    try {
      // The component selects the result itself rather than leaving that to the
      // parent: this select is used both by the add form and by an edit panel,
      // and only one of them wants the add form's selection to move.
      onChange((await onCreate(name)).id)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  if (draft !== null) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraft(null)
            if (e.key === 'Enter') {
              // The form's own submit would post a transaction; this Enter
              // means "save the category".
              e.preventDefault()
              void save()
            }
          }}
          placeholder="New category"
          aria-label="New category name"
          className={`${inputClasses} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex min-h-11 shrink-0 items-center rounded-control px-3 text-body font-semibold text-accent-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="flex min-h-11 shrink-0 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY) setDraft('')
          else onChange(Number(e.target.value))
        }}
        aria-label="Category"
        className={`${inputClasses} min-h-11 w-full appearance-none pr-9`}
      >
        {value === null && <option value="">Category</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CATEGORY}>+ New category…</option>
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-label-tertiary"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 10l5 5 5-5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full text-accent-text transition-colors duration-200 ease-out hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path
      d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path
      d="M4 8h10M18 8h2M4 16h4M12 16h8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="16" cy="8" r="2.25" stroke="currentColor" strokeWidth="2" />
    <circle cx="10" cy="16" r="2.25" stroke="currentColor" strokeWidth="2" />
  </svg>
)

/** Spending per category for the month in view, in integer cents, from rows
 *  already in memory — one month's transactions are all here, so a round trip
 *  to aggregate them would buy nothing.
 *
 *  The NULL key is not an oversight: rows whose category was deleted sit
 *  outside every budget line, and dropping them would make the per-category
 *  numbers quietly fail to sum to the month total. **Move this to
 *  GET /api/transactions/summary the day a month's rows get paginated** — the
 *  same day sortTransactions has to move server-side, and for the same reason. */
function spendByCategory(transactions: Transaction[]) {
  const spent = new Map<number | null, number>()
  for (const t of transactions) {
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + cents(t.amount))
  }
  return spent
}

/** One category's line: what was spent, against the limit if there is one.
 *  `limit` in cents; null means no limit has ever been set for this category,
 *  which is deliberately shown as "No limit" rather than as 0 spent of 0. */
function BudgetRow({
  name,
  spent,
  limit,
  inherited,
  first,
}: {
  name: string
  spent: number
  limit: number | null
  inherited: boolean
  first: boolean
}) {
  const over = limit !== null && spent > limit
  // Clamped so a 300%-of-budget row does not render a bar out of its track;
  // the number above it already says how far over it is.
  const pct = limit !== null && limit > 0 ? Math.min(100, (spent / limit) * 100) : 0

  return (
    <li className={`px-4 py-3 ${first ? '' : 'border-t border-separator'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-subheadline font-semibold text-label">{name}</p>
        <p className="shrink-0 text-subheadline tabular-nums text-label-secondary">
          <span className={over ? 'font-semibold text-danger-text' : 'text-label'}>
            {formatMoney(spent / 100)}
          </span>
          {limit !== null && ` of ${formatMoney(limit / 100)}`}
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
    </li>
  )
}

/** The edit mode of the budgets section. Every category gets a field, including
 *  ones with no limit — this is the only place a budget is set, so a category
 *  missing from the list would be a limit you cannot add. */
function BudgetEditor({
  token,
  month,
  categories,
  budgets,
  onSaved,
  onCancel,
}: {
  token: string
  month: string
  categories: Category[]
  budgets: Budget[]
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  // Initialised on mount, so Cancel discards edits for free — same trick as
  // EditPanel. An inherited limit is seeded as a real value rather than a
  // placeholder: it *is* the number in force, and it should read as one.
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      categories.map((c) => [c.id, budgets.find((b) => b.categoryId === c.id)?.amount ?? '']),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // Sequential rather than Promise.all: this is at most a handful of rows,
      // and a failure half way through leaves a partial save that the refetch
      // below reports honestly instead of a pile of parallel rejections.
      for (const c of categories) {
        const current = budgets.find((b) => b.categoryId === c.id)
        const draft = (drafts[c.id] ?? '').trim()

        if (draft === '') {
          // Clearing removes the row set for *this* month only. Blanking an
          // inherited value has nothing here to delete — that limit lives in an
          // earlier month, and a blank field is not a request to erase history.
          if (current && !current.inherited) await deleteBudget(token, c.id, month)
          continue
        }
        // Untouched values are not rewritten. That matters most for an
        // inherited one: re-saving it would pin the number to this month and
        // silently break the chain it was inheriting through.
        if (current && cents(current.amount) === cents(draft)) continue

        await putBudget(token, { categoryId: c.id, month, amount: draft })
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 rounded-card bg-surface p-2 shadow-card">
      <ul>
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-2 py-1">
            <label htmlFor={`budget-${c.id}`} className="min-w-0 flex-1 truncate text-body text-label">
              {c.name}
            </label>
            <input
              id={`budget-${c.id}`}
              value={drafts[c.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
              placeholder="No limit"
              inputMode="decimal"
              className={`${inputClasses} w-28 shrink-0 text-right tabular-nums`}
            />
          </li>
        ))}
        {categories.length === 0 && (
          <li className="px-2 py-3 text-center text-subheadline text-label-secondary">
            Add a category first — budgets are set per category.
          </li>
        )}
      </ul>

      {error && (
        <p role="alert" className="mx-2 mt-2 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
          {error}
        </p>
      )}

      <div className="mt-1 flex items-center justify-end gap-1 px-2 pb-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex min-h-11 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/** The expanded editor. Rendered only while open, so mounting is what
 *  initialises the drafts from the transaction — which means Cancel, and
 *  closing the row, discard edits for free with no reset logic. */
function EditPanel({
  token,
  transaction,
  categories,
  onAddCategory,
  onSaved,
  onDeleted,
  onCancel,
  id,
}: {
  token: string
  transaction: Transaction
  categories: Category[]
  onAddCategory: (name: string) => Promise<Category>
  onSaved: (updated: Transaction) => void
  onDeleted: (id: number) => void
  onCancel: () => void
  id: string
}) {
  const [merchant, setMerchant] = useState(transaction.merchantName)
  const [amount, setAmount] = useState(transaction.amount)
  const [date, setDate] = useState(transaction.date)
  const [categoryId, setCategoryId] = useState<number | null>(transaction.categoryId)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening a row near the bottom of the list would otherwise put its fields
  // below the fold. Runs once, on mount, because the panel only exists while
  // the row is open.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  async function onSave() {
    const patch: Parameters<typeof updateTransaction>[2] = {}
    if (merchant.trim() && merchant.trim() !== transaction.merchantName) {
      patch.merchantName = merchant.trim()
    }
    if (date && date !== transaction.date) patch.date = date
    if (categoryId !== transaction.categoryId) patch.categoryId = categoryId
    // Compared as cents, not strings, so retyping "9988" over "9988.00" is not
    // treated as an edit. A NaN falls through as a change on purpose — the
    // server owns the error message for a malformed amount.
    const next = cents(amount)
    if (Number.isNaN(next) || next !== cents(transaction.amount)) patch.amount = amount.trim()

    // Nothing changed: closing is not a write.
    if (Object.keys(patch).length === 0) {
      onCancel()
      return
    }

    setBusy(true)
    setError(null)
    try {
      // State is updated only once the server has confirmed. Updating
      // optimistically and then never refetching would leave a wrong value on
      // screen that looks saved and has nothing to correct it.
      onSaved(await updateTransaction(token, transaction.id, patch))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function onDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteTransaction(token, transaction.id)
      onDeleted(transaction.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      id={id}
      ref={panelRef}
      className="space-y-2 border-t border-separator py-3 pr-4"
    >
      <input
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        aria-label="Merchant"
        className={`${inputClasses} w-full`}
      />
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        onCreate={onAddCategory}
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={`${inputClasses} flex-1`}
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          inputMode="decimal"
          className={`${inputClasses} w-24 text-right tabular-nums`}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger-text">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* Two-step rather than window.confirm: a native modal blocks the page,
            and a destructive action wants a deliberate second tap, not an OK. */}
        <button
          type="button"
          onClick={() => (armed ? void onDelete() : setArmed(true))}
          onBlur={() => setArmed(false)}
          disabled={busy}
          className="flex min-h-11 items-center rounded-control px-3 text-body font-semibold text-danger-text transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {armed ? 'Confirm delete?' : 'Delete'}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex min-h-11 items-center rounded-control px-3 text-body text-label-secondary transition-opacity duration-200 ease-out hover:opacity-70 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={busy}
            className="flex min-h-11 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4 text-accent-text" fill="none" aria-hidden>
    <path d="M5 13l4 4 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Open state plus the outside-click/Escape dismissal every popover menu in
 *  this file needs — first written for AccountMenu, now shared with
 *  AddTransactionMenu rather than copied. Both listeners exist only while
 *  `open` is true, matching the "no listener while closed" shape used
 *  elsewhere; Escape returns focus to the trigger rather than dropping it. */
function usePopoverMenu<TContainer extends HTMLElement, TTrigger extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<TContainer>(null)
  const triggerRef = useRef<TTrigger>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, containerRef, triggerRef }
}

/** Top-right account menu: identity, appearance, sign-out. Replaces the old
 *  bare name-text-plus-"Sign out"-button header. There is no router in this
 *  app, so "account setting" here is deliberately just the read-only name/
 *  email header below — not a screen to navigate to. */
function AccountMenu({
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
              {themePref === opt.value ? <CheckIcon /> : null}
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

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-accent-text" fill="none" aria-hidden>
    <path
      d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-label-tertiary" fill="none" aria-hidden>
    <path
      d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.5" r="3.25" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-label-tertiary" fill="none" aria-hidden>
    <path
      d="M12 15V4m0 0 4 4m-4-4-4 4M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** The "+" beside the month total: the one place a transaction can be
 *  started. Three ways to get a transaction in are named up front — manual,
 *  scan, upload — because that is the real shape of the feature even though
 *  only manual is built; a plain "Add" button would have had to silently
 *  become this menu later; more scope up front so nothing does. Scan and
 *  Upload are visibly future work (a "Soon" tag, no handler) rather than
 *  hidden, so the roadmap is honest about what is coming without pretending
 *  it works today. */
function AddTransactionMenu({ onManual }: { onManual: () => void }) {
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
        className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
          open ? 'bg-accent text-on-accent' : 'bg-accent/12 text-accent-text hover:bg-accent/20'
        }`}
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

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { accessToken, user } = session
  const [month, setMonth] = useState(currentMonth())
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  // The render order, pinned as ids. Sorting cannot stay derived from
  // `transactions`: editing a row would re-sort it and the row would jump out
  // from under the finger. This is only recomputed on a fetch or a sort press,
  // so saving an edit leaves every row exactly where it was.
  const [order, setOrder] = useState<number[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [editingBudgets, setEditingBudgets] = useState(false)
  // Seeded from localStorage (via the inline index.html script, which already
  // applied it before first paint) so this state and the DOM start in
  // agreement — applyThemePreference is the only thing that touches either
  // afterward. See src/theme.ts.
  const [themePref, setThemePref] = useState<ThemePreference>(() => getStoredThemePreference())
  // The manual-entry form is closed by default now that it's one of three
  // named ways to add a transaction, chosen from AddTransactionMenu, rather
  // than the only thing that could ever sit here.
  const [addingTransaction, setAddingTransaction] = useState(false)
  const merchantInputRef = useRef<HTMLInputElement>(null)
  // null means "nothing picked yet, follow the default" — see selectedCategory.
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  // Today per the *user's* clock — the server's today is a timezone guess.
  const [date, setDate] = useState(todayIso())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Stepping months quickly can land responses out of order; only the newest
  // request is allowed to write state.
  const requestId = useRef(0)

  // Mirrors `sort` so refresh() can read it without taking it as a dependency —
  // that would make pressing a sort chip refetch the month, which M2
  // deliberately avoids. Kept in step by onSortPress, the only writer of `sort`,
  // so it is never assigned during render.
  const sortRef = useRef(sort)

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      // Budgets ride along with the month rather than being fetched once like
      // categories: the limit in force genuinely differs month to month, and in
      // parallel it costs no extra latency.
      const [r, t, b] = await Promise.all([
        getReceipts(accessToken),
        getTransactions(accessToken, monthBounds(month)),
        getBudgets(accessToken, month),
      ])
      if (id !== requestId.current) return
      setReceipts(r)
      setTransactions(t)
      setBudgets(b)
      setOrder(sortTransactions(t, sortRef.current).map((x) => x.id))
      setExpandedId(null)
    } catch (e) {
      if (id !== requestId.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [accessToken, month])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Not refresh(): re-reading the whole month would reshuffle the pinned row
  // order and collapse an open editor, and a budget write cannot change a
  // transaction anyway.
  const refreshBudgets = useCallback(async () => {
    setBudgets(await getBudgets(accessToken, month))
  }, [accessToken, month])

  // Categories are fetched once per session, not inside refresh(): they do not
  // change when the month does, and folding them in would put a third request
  // behind every press of the month stepper.
  useEffect(() => {
    getCategories(accessToken)
      .then(setCategories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [accessToken])

  // Returns the row so the caller decides what to select — the add form and an
  // edit panel both create categories, but only one of them owns the add form's
  // selection.
  async function onAddCategory(name: string) {
    // Find-or-create: an existing name (in any case) comes back as itself, so
    // this both creates and selects without a second round trip.
    const category = await createCategory(accessToken, name)
    setCategories((cs) =>
      cs.some((c) => c.id === category.id)
        ? cs
        : [...cs, category].sort((a, b) => a.name.localeCompare(b.name)),
    )
    return category
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!merchant.trim() || !amount.trim() || !date || selectedCategory === null) return
    try {
      await createTransaction(accessToken, {
        merchantName: merchant.trim(),
        amount: amount.trim(),
        categoryId: selectedCategory,
        date,
      })
      setMerchant('')
      setAmount('')
      // The category is deliberately *not* reset: consecutive entries are
      // usually the same kind of spending, and re-picking every time is the
      // friction that makes people stop logging.
      setCategoryId(selectedCategory)
      // Back to today, not to the viewed month: entering into September while
      // looking at June is a mistake, not a feature.
      setDate(todayIso())
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onSortPress(key: SortKey) {
    // Pressing the inactive chip switches field; pressing the active one flips
    // direction.
    const next: Sort =
      sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    setSort(next)
    sortRef.current = next
    // Reordering happens here, not during render — still no refetch.
    setOrder(sortTransactions(transactions, next).map((t) => t.id))
    setExpandedId(null)
  }

  // No refetch after a write, on purpose: the list must not reshuffle under the
  // user. A reload, or stepping to another month and back, picks up the truth.
  function onSaved(updated: Transaction) {
    setTransactions((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
    setExpandedId(null)
  }

  function onDeleted(id: number) {
    setTransactions((ts) => ts.filter((t) => t.id !== id))
    setOrder((o) => o.filter((x) => x !== id))
    setExpandedId(null)
  }

  // The default is derived rather than pushed into state by an effect: an
  // explicit pick wins, otherwise the most recent categorised transaction,
  // otherwise the first category alphabetically. All of it from data already in
  // memory — no extra column, no extra request.
  // Plain function, not useMemo: it scans a handful of rows, and memoising it
  // costs more than it saves.
  const selectedCategory = ((): number | null => {
    if (categoryId !== null && categories.some((c) => c.id === categoryId)) return categoryId
    const lastUsed = transactions.find((t) => t.categoryId !== null)?.categoryId
    if (lastUsed !== undefined && categories.some((c) => c.id === lastUsed)) return lastUsed
    return categories[0]?.id ?? null
  })()

  const spent = spendByCategory(transactions)
  // Shown for a category with a limit or with spending — one with neither is
  // noise in a month it played no part in. Ordered by spend, because the
  // question this list answers is where the money went.
  const budgetRows = categories
    .map((c) => ({ category: c, spent: spent.get(c.id) ?? 0, budget: budgets.find((b) => b.categoryId === c.id) }))
    .filter((r) => r.spent > 0 || r.budget)
    .sort((a, b) => b.spent - a.spent || a.category.name.localeCompare(b.category.name))
  // Spending whose category was deleted. Surfaced rather than dropped: it is
  // real money, it sits outside every budget line, and without it the rows
  // above visibly fail to add up to the month total.
  const uncategorised = spent.get(null) ?? 0

  const receiptFor = (id: number | null) => receipts.find((r) => r.id === id)
  const total = sumMoney(transactions.map((t) => t.amount))
  const byId = new Map(transactions.map((t) => [t.id, t]))
  const rows = order.flatMap((id) => byId.get(id) ?? [])
  const dim = loading ? 'opacity-40' : ''

  return (
    <main className="min-h-screen bg-bg-grouped">
      <div className="mx-auto w-full max-w-xl space-y-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-5">
        <header>
          <div className="flex items-center justify-between gap-3">
            {/* 17pt semibold is Apple's own compact nav-bar title size — this
                sits at that weight rather than the Large Title size used below
                for the month, on purpose: the brand mark is a quiet anchor,
                not the loudest thing on screen (that's the money). */}
            <p className="min-w-0 truncate text-headline font-semibold text-label">Piggy Tracking</p>
            <AccountMenu
              user={user}
              themePref={themePref}
              onThemeChange={(pref) => {
                applyThemePreference(pref)
                setThemePref(pref)
              }}
              onLogout={onLogout}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-title-2 font-semibold text-label">
              {formatMonthLabel(month)}
            </h1>
            <div className="-mr-3 flex shrink-0 items-center">
              <StepButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                <Chevron dir="left" />
              </StepButton>
              {/* Not disabled at the current month: future-dated transactions
                  are legal, so a month that can hold rows must be reachable. */}
              <StepButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                <Chevron dir="right" />
              </StepButton>
            </div>
          </div>

          <div className={`mt-2 flex items-start justify-between gap-2 transition-opacity duration-200 ease-out ${dim}`}>
            <div className="min-w-0">
              <p className="text-footnote text-label-secondary">Total spent</p>
              <p className="text-title-lg font-bold tracking-tight tabular-nums text-label">
                {formatMoney(total)}
              </p>
              <p className="mt-1 text-footnote text-label-tertiary">
                {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
              </p>
            </div>
            {/* Immediately beside the total, not buried below the fold in the
                transaction list: this is the one action every visit to the
                dashboard exists to support. */}
            <AddTransactionMenu
              onManual={() => {
                setAddingTransaction(true)
                requestAnimationFrame(() => merchantInputRef.current?.focus())
              }}
            />
          </div>
        </header>

        <section>
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 className="px-1 text-footnote font-semibold tracking-wide text-label-secondary uppercase">
              Budgets
            </h2>
            {/* One icon for the whole section rather than an edit control per
                row: setting limits is a thing done occasionally, and it wants
                one screen where every category is visible at once. */}
            <button
              type="button"
              onClick={() => setEditingBudgets((e) => !e)}
              aria-label={editingBudgets ? 'Close budget editor' : 'Edit budgets'}
              aria-expanded={editingBudgets}
              className={`-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                editingBudgets ? 'bg-accent/12 text-accent-text' : 'text-accent-text hover:bg-surface-raised'
              }`}
            >
              <SlidersIcon />
            </button>
          </div>

          {editingBudgets ? (
            // Keyed by month so stepping months while it is open re-seeds the
            // drafts from that month's limits instead of keeping the old ones.
            <BudgetEditor
              key={month}
              token={accessToken}
              month={month}
              categories={categories}
              budgets={budgets}
              onSaved={async () => {
                await refreshBudgets()
                setEditingBudgets(false)
              }}
              onCancel={() => setEditingBudgets(false)}
            />
          ) : (
            <ul
              className={`mt-1 overflow-hidden rounded-card bg-surface shadow-card transition-opacity duration-200 ease-out ${dim}`}
            >
              {budgetRows.map((r, i) => (
                <BudgetRow
                  key={r.category.id}
                  name={r.category.name}
                  spent={r.spent}
                  limit={r.budget ? cents(r.budget.amount) : null}
                  inherited={r.budget?.inherited ?? false}
                  first={i === 0}
                />
              ))}
              {uncategorised > 0 && (
                <BudgetRow
                  name="Uncategorised"
                  spent={uncategorised}
                  limit={null}
                  inherited={false}
                  first={budgetRows.length === 0}
                />
              )}
              {budgetRows.length === 0 && uncategorised === 0 && (
                <li className="px-4 py-8 text-center text-subheadline text-label-secondary">
                  No budgets set for {formatMonthLabel(month)}.
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Disclosure, not a modal — same reasoning as EditPanel and
            BudgetEditor: one more overlay primitive isn't worth it for a form
            that already lives inline. Chosen from AddTransactionMenu; closing
            it (Cancel or the ×) discards nothing that matters since the last
            successful add already cleared the fields. */}
        {addingTransaction && (
          <form onSubmit={onSubmit} className="space-y-2 rounded-card bg-surface p-2 shadow-card">
            <div className="flex items-center justify-between px-1 pt-1">
              <h2 className="text-footnote font-semibold tracking-wide text-label-secondary uppercase">
                Add transaction
              </h2>
              <button
                type="button"
                onClick={() => setAddingTransaction(false)}
                aria-label="Close"
                className="-mr-1.5 flex size-8 items-center justify-center rounded-full text-label-tertiary transition-colors duration-200 ease-out hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <CloseIcon />
              </button>
            </div>
            <input
              ref={merchantInputRef}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Merchant"
              aria-label="Merchant"
              className={`${inputClasses} w-full`}
            />
            <CategorySelect
              categories={categories}
              value={selectedCategory}
              onChange={setCategoryId}
              onCreate={onAddCategory}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
                className={`${inputClasses} flex-1`}
              />
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-label="Amount"
                inputMode="decimal"
                className={`${inputClasses} w-24 text-right tabular-nums`}
              />
              <button
                type="submit"
                className="flex min-h-11 shrink-0 items-center rounded-full bg-accent px-5 text-headline font-semibold text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 active:opacity-75 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
              >
                Add
              </button>
            </div>
          </form>
        )}

        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section>
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 className="px-1 text-footnote font-semibold tracking-wide text-label-secondary uppercase">
              Transactions
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <SortChip
                label="Date"
                active={sort.key === 'date'}
                dir={sort.dir}
                onClick={() => onSortPress('date')}
              />
              <SortChip
                label="Amount"
                active={sort.key === 'amount'}
                dir={sort.dir}
                onClick={() => onSortPress('amount')}
              />
            </div>
          </div>

          <ul
            className={`mt-1 overflow-hidden rounded-card bg-surface shadow-card transition-opacity duration-200 ease-out ${dim}`}
          >
            {rows.map((t, i) => {
              const receipt = receiptFor(t.receiptId)
              const open = expandedId === t.id
              const panelId = `txn-${t.id}-editor`
              return (
                // The separator sits on the inner row, not the <li>, so it is
                // inset to the text the way a grouped list is on iOS.
                <li key={t.id} className="pl-4">
                  {/* A real <button>, not a div with onClick: Enter and Space
                      then work with no extra code, and the row announces itself
                      as expandable. There is no edit icon on purpose, so the
                      press highlight is the only thing saying it is tappable. */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : t.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className={`flex min-h-15 w-full items-center gap-4 py-3 pr-4 text-left transition-colors duration-150 ease-out active:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                      i === 0 ? '' : 'border-t border-separator'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-headline font-semibold text-label">
                        {t.merchantName}
                      </p>
                      <p className="mt-0.5 truncate text-subheadline text-label-secondary">
                        {formatDate(t.date)} · {t.category ?? 'Uncategorised'}
                        {receipt && ' · Receipt'}
                      </p>
                    </div>
                    <span className="shrink-0 text-headline tabular-nums text-label">
                      {formatMoney(t.amount)}
                    </span>
                  </button>

                  {open && (
                    <EditPanel
                      id={panelId}
                      token={accessToken}
                      transaction={t}
                      categories={categories}
                      onAddCategory={onAddCategory}
                      onSaved={onSaved}
                      onDeleted={onDeleted}
                      onCancel={() => setExpandedId(null)}
                    />
                  )}
                </li>
              )
            })}

            {rows.length === 0 && !error && (
              <li className="px-4 py-10 text-center text-subheadline text-label-secondary">
                No transactions in {formatMonthLabel(month)}.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
