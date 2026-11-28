import { cents } from './format'
import type { Budget, Category, Income } from './api'

export type FlowNode = { name: string; colorClass: string }
export type FlowLink = { source: number; target: number; value: number }
export type FlowData = { nodes: FlowNode[]; links: FlowLink[] }

/** Apple's 12 system colours, in HIG's own documented order — see index.css's
 *  --color-chart-* tokens. Assigned round-robin per node so distinct income
 *  sources and categories are each a distinct hue, the way a calendar app
 *  gives every calendar its own color rather than a status color. "More than
 *  enough" for realistic category counts (the seed data ships 7); a 13th
 *  category in the same month reuses chart-red rather than erroring — not
 *  ideal, but Apple's own palette tops out at 12 too. */
export const CHART_PALETTE = [
  'fill-chart-red',
  'fill-chart-orange',
  'fill-chart-yellow',
  'fill-chart-green',
  'fill-chart-mint',
  'fill-chart-teal',
  'fill-chart-cyan',
  'fill-chart-blue',
  'fill-chart-indigo',
  'fill-chart-purple',
  'fill-chart-pink',
  'fill-chart-brown',
]

/** Builds the Money Flow Sankey's {nodes, links} from data the dashboard
 *  already holds for the month in view — same reasoning as `spendByCategory`:
 *  one bounded month is cheap to reshape client-side, not worth a round trip.
 *
 *  Values are in integer cents throughout, matching `budgetRows`/`spent` —
 *  never the dollar `sumMoney` totals Dashboard.tsx shows in its header,
 *  which would mean converting back and forth and risking float drift. */
export function buildMoneyFlowData(
  incomes: Income[],
  budgetRows: { category: Category; spent: number; budget: Budget | undefined }[],
  uncategorised: number,
  labelFor: (c: Category) => string,
): FlowData {
  const nodes: FlowNode[] = []
  const links: FlowLink[] = []

  const incomeEntries = incomes.map((i) => ({ name: i.source, value: cents(i.amount) })).filter((e) => e.value > 0)
  const totalIncomeCents = incomeEntries.reduce((sum, e) => sum + e.value, 0)

  // Uncategorised is a sentinel bucket, not a real category identity (see
  // budgetCalc.ts) — it keeps the neutral tone rather than taking a palette
  // slot, same as it gets no accent treatment in the Budgets view either.
  const spendEntries: { name: string; value: number }[] = budgetRows
    .filter((r) => r.spent > 0)
    .map((r) => ({ name: labelFor(r.category), value: r.spent }))
  const uncategorisedEntry = uncategorised > 0 ? { name: 'Uncategorised', value: uncategorised } : null
  const totalSpendCents = spendEntries.reduce((sum, e) => sum + e.value, 0) + (uncategorisedEntry?.value ?? 0)

  if (totalIncomeCents === 0 && totalSpendCents === 0) return { nodes, links }

  // No income this month: there's nothing to label a hub "Income" for, so it
  // becomes a plain "Spending" root instead of a dangling zero-value node —
  // every node still needs at least one link to lay out.
  const hubName = totalIncomeCents > 0 ? 'Income' : 'Spending'
  const hubIndex = nodes.push({ name: hubName, colorClass: 'fill-success' }) - 1

  // Each side gets its own pass through the palette from the top, rather than
  // sharing one running counter — income and spend nodes sit at opposite
  // depths, so there's no risk of them being compared by colour, only within
  // their own side (where it matters: two categories should never match).
  incomeEntries.forEach((entry, i) => {
    const idx = nodes.push({ name: entry.name, colorClass: CHART_PALETTE[i % CHART_PALETTE.length] }) - 1
    links.push({ source: idx, target: hubIndex, value: entry.value })
  })

  spendEntries.forEach((entry, i) => {
    const idx = nodes.push({ name: entry.name, colorClass: CHART_PALETTE[i % CHART_PALETTE.length] }) - 1
    links.push({ source: hubIndex, target: idx, value: entry.value })
  })
  if (uncategorisedEntry) {
    const idx = nodes.push({ name: uncategorisedEntry.name, colorClass: 'fill-label-tertiary' }) - 1
    links.push({ source: hubIndex, target: idx, value: uncategorisedEntry.value })
  }

  if (totalIncomeCents > totalSpendCents) {
    const idx = nodes.push({ name: 'Savings', colorClass: 'fill-success' }) - 1
    links.push({ source: hubIndex, target: idx, value: totalIncomeCents - totalSpendCents })
  }
  // Known v1 limitation: if spend > income, link values simply don't balance
  // at the hub — recharts/d3-sankey lays out whatever is given, it doesn't
  // enforce flow conservation. No "overspent" node for the deficit; the
  // Budgets view already shows "$X over" per category, so that number isn't
  // lost, just not reconciled into this diagram yet.

  return { nodes, links }
}
