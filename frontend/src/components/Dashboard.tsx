import type { Session } from '../api'
import { formatMoney } from '../format'
import { useDashboard } from '../hooks/useDashboard'
import { formatMonthLabel } from '../month'
import { AccountMenu } from './AccountMenu'
import { AddTransactionMenu } from './AddTransactionMenu'
import { AddTransactionSheet } from './AddTransactionSheet'
import { BudgetEditor } from './BudgetEditor'
import { BudgetRow } from './BudgetRow'
import { ErrorNotice } from './ErrorNotice'
import { Chevron, SlidersIcon } from './icons'
import { SortChip } from './SortChip'
import { StepButton } from './StepButton'
import { TransactionRow } from './TransactionRow'
import { ViewToggle } from './ViewToggle'

export function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const {
    accessToken,
    user,
    month,
    changeMonth,
    sort,
    onSortPress,
    transactions,
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
    editingBudgets,
    onToggleBudgetEditor,
    refreshBudgets,
    setEditingBudgets,
    themePref,
    onThemeChange,
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
  } = useDashboard(session)
  const dim = loading ? 'opacity-40' : ''

  // Shared by both drill-down entry points (a real category and the
  // Uncategorised bucket) so the two never render differently.
  function renderCategoryTransactions(categoryId: number | null) {
    const categoryRows = transactionsForCategory(categoryId)
    return (
      <ul>
        {categoryRows.map((t, i) => (
          <TransactionRow
            key={t.id}
            transaction={t}
            index={i}
            receipt={receiptFor(t.receiptId)}
            open={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            token={accessToken}
            categories={categories}
            onAddCategory={onAddCategory}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ))}
        {categoryRows.length === 0 && (
          <li className="px-4 py-6 text-center text-footnote text-label-tertiary">No transactions.</li>
        )}
      </ul>
    )
  }

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
              onThemeChange={onThemeChange}
              onLogout={onLogout}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-title-2 font-semibold text-label">
              {formatMonthLabel(month)}
            </h1>
            <div className="-mr-3 flex shrink-0 items-center">
              <StepButton label="Previous month" onClick={() => changeMonth(-1)}>
                <Chevron dir="left" />
              </StepButton>
              {/* Not disabled at the current month: future-dated transactions
                  are legal, so a month that can hold rows must be reachable. */}
              <StepButton label="Next month" onClick={() => changeMonth(1)}>
                <Chevron dir="right" />
              </StepButton>
            </div>
          </div>

          <div className={`mt-2 flex items-center justify-between gap-2 transition-opacity duration-200 ease-out ${dim}`}>
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
          {/* The toggle names this section itself — a separate "BUDGETS" /
              "TRANSACTIONS" eyebrow caption above it would be redundant. */}
          <div className="flex min-h-11 items-center justify-between gap-2">
            <ViewToggle value={view} onChange={onViewChange} />
            {view === 'budgets' ? (
              // One icon for the whole section rather than an edit control
              // per row: setting limits is a thing done occasionally, and it
              // wants one screen where every category is visible at once.
              <button
                type="button"
                onClick={onToggleBudgetEditor}
                aria-label={editingBudgets ? 'Close budget editor' : 'Edit budgets'}
                aria-expanded={editingBudgets}
                className={`-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  editingBudgets ? 'bg-accent/12 text-accent-text' : 'text-accent-text hover:bg-surface-raised'
                }`}
              >
                <SlidersIcon />
              </button>
            ) : (
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
            )}
          </div>

          {view === 'budgets' ? (
            editingBudgets ? (
              // Keyed by month so stepping months while it is open re-seeds
              // the drafts from that month's limits instead of keeping the
              // old ones.
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
                    expanded={expandedCategoryId === r.category.id}
                    onToggle={() => onToggleCategory(r.category.id)}
                  >
                    {renderCategoryTransactions(r.category.id)}
                  </BudgetRow>
                ))}
                {uncategorised > 0 && (
                  <BudgetRow
                    name="Uncategorised"
                    spent={uncategorised}
                    limit={null}
                    inherited={false}
                    first={budgetRows.length === 0}
                    expanded={expandedCategoryId === 'uncategorised'}
                    onToggle={() => onToggleCategory('uncategorised')}
                  >
                    {renderCategoryTransactions(null)}
                  </BudgetRow>
                )}
                {budgetRows.length === 0 && uncategorised === 0 && (
                  <li className="px-4 py-8 text-center text-subheadline text-label-secondary">
                    No budgets set for {formatMonthLabel(month)}.
                  </li>
                )}
              </ul>
            )
          ) : (
            <ul
              className={`mt-1 overflow-hidden rounded-card bg-surface shadow-card transition-opacity duration-200 ease-out ${dim}`}
            >
              {rows.map((t, i) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  index={i}
                  receipt={receiptFor(t.receiptId)}
                  open={expandedId === t.id}
                  onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  token={accessToken}
                  categories={categories}
                  onAddCategory={onAddCategory}
                  onSaved={onSaved}
                  onDeleted={onDeleted}
                />
              ))}
              {rows.length === 0 && !error && (
                <li className="px-4 py-10 text-center text-subheadline text-label-secondary">
                  No transactions in {formatMonthLabel(month)}.
                </li>
              )}
            </ul>
          )}
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}
      </div>

      {/* A global "new item" action, not tied to any on-screen row — the
          sheet rises to meet the tap regardless of scroll position, unlike
          EditPanel/BudgetEditor's inline disclosures, which edit something
          already on screen. Closing it (scrim, ×, or Escape) discards
          nothing that matters since the last successful add already cleared
          the fields. */}
      <AddTransactionSheet
        open={addingTransaction}
        onClose={() => setAddingTransaction(false)}
        onSubmit={onSubmit}
        merchantInputRef={merchantInputRef}
        merchant={merchant}
        setMerchant={setMerchant}
        amount={amount}
        setAmount={setAmount}
        date={date}
        setDate={setDate}
        categories={categories}
        selectedCategory={selectedCategory}
        setCategoryId={setCategoryId}
        onAddCategory={onAddCategory}
      />
    </main>
  )
}
