import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createCategory,
  createTransaction,
  getBudgets,
  getBudgetsExist,
  getCategories,
  getReceipts,
  getTransactions,
  type Budget,
  type Category,
  type Receipt,
  type Session,
  type Transaction,
} from '../api'
import { spendByCategory } from '../budgetCalc'
import type { View } from '../components/ViewToggle'
import { cents, sumMoney, todayIso } from '../format'
import { addMonths, currentMonth, monthBounds } from '../month'
import { sortTransactions, type Sort, type SortKey } from '../sort'
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from '../theme'

/** All of Dashboard's state, effects, and derived data, kept out of the
 *  component so the JSX in Dashboard.tsx is rendering only. Every ref-based
 *  guard here (`requestId`, `sortRef`) is load-bearing — see the comments on
 *  each — and was not simplified in the move out of App.tsx. */
export function useDashboard(session: Session) {
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
  // Budgets is the default view; List is a toggle away. Not persisted like
  // theme — it resets on every month change, same as expandedId does on
  // every refetch, so "Budget is the default" stays literally true.
  const [view, setView] = useState<View>('budgets')
  // Which budget row's drill-down (its transactions for the month) is open.
  // 'uncategorised' is a sentinel since that bucket has no real category id.
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | 'uncategorised' | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [editingBudgets, setEditingBudgets] = useState(false)
  // Whether this user has ever set a budget, at all — not whether the viewed
  // month has one, which is a normal, unrelated empty state. Fetched once
  // (like categories) rather than derived from `budgets`, which only ever
  // holds one month's effective limits. Flipped locally on a successful save
  // instead of re-fetched, since a save is proof enough.
  const [hasAnyBudgets, setHasAnyBudgets] = useState(true)
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

  // The month stepper's own handler, not a raw setMonth + a useEffect keyed
  // on month: resetting view/drill-down state from the event that changes
  // the month (rather than reacting to the change afterward) is a state
  // update, not a synchronization with an external system, so it belongs
  // here and not in an effect.
  function changeMonth(delta: number) {
    setMonth((m) => addMonths(m, delta))
    setView('budgets')
    setExpandedCategoryId(null)
  }

  // Not refresh(): re-reading the whole month would reshuffle the pinned row
  // order and collapse an open editor, and a budget write cannot change a
  // transaction anyway.
  const refreshBudgets = useCallback(async () => {
    setBudgets(await getBudgets(accessToken, month))
    // The only caller of this is BudgetEditor's onSaved, so reaching here
    // means a write just succeeded — cheaper than a second /exists round
    // trip, and this only ever flips false→true, never the reverse.
    setHasAnyBudgets(true)
  }, [accessToken, month])

  // Categories are fetched once per session, not inside refresh(): they do not
  // change when the month does, and folding them in would put a third request
  // behind every press of the month stepper.
  useEffect(() => {
    getCategories(accessToken)
      .then(setCategories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [accessToken])

  // Same shape as the categories fetch above: once per session, independent
  // of `month`. Defaults to `true` (see the field's own comment) so this
  // never flashes the first-run nudge for a returning user while the request
  // is in flight.
  useEffect(() => {
    getBudgetsExist(accessToken)
      .then((r) => setHasAnyBudgets(r.exists))
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

  function onViewChange(next: View) {
    setView(next)
    setExpandedCategoryId(null)
    setExpandedId(null)
  }

  function onToggleCategory(id: number | 'uncategorised') {
    setExpandedCategoryId((cur) => (cur === id ? null : id))
    // Switching drill-down context closes any open edit panel — it may
    // belong to a transaction that's about to scroll out of view.
    setExpandedId(null)
  }

  // Opening the whole-section editor collapses any open drill-down: the two
  // are mutually exclusive (every row becomes an input field while editing).
  function onToggleBudgetEditor() {
    setEditingBudgets((e) => !e)
    setExpandedCategoryId(null)
  }

  // Same shape as receiptFor below: a plain per-render lookup, not memoised —
  // one month's rows are a handful, scanning them costs nothing. Fixed
  // date-desc, matching the "a drill-down doesn't need its own sort" call.
  function transactionsForCategory(categoryId: number | null) {
    return sortTransactions(
      transactions.filter((t) => t.categoryId === categoryId),
      { key: 'date', dir: 'desc' },
    )
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

  return {
    accessToken,
    user,
    month,
    changeMonth,
    sort,
    onSortPress,
    receipts,
    transactions,
    order,
    expandedId,
    setExpandedId,
    view,
    onViewChange,
    expandedCategoryId,
    onToggleCategory,
    transactionsForCategory,
    categories,
    onAddCategory,
    budgets,
    hasAnyBudgets,
    editingBudgets,
    setEditingBudgets,
    onToggleBudgetEditor,
    refreshBudgets,
    themePref,
    onThemeChange: (pref: ThemePreference) => {
      applyThemePreference(pref)
      setThemePref(pref)
    },
    addingTransaction,
    setAddingTransaction,
    merchantInputRef,
    merchant,
    setMerchant,
    amount,
    setAmount,
    date,
    setDate,
    selectedCategory,
    setCategoryId,
    onSubmit,
    onSaved,
    onDeleted,
    loading,
    error,
    budgetRows,
    uncategorised,
    receiptFor,
    total,
    rows,
    cents,
  }
}
