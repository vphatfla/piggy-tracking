import { ResponsiveContainer, Sankey, Tooltip, type SankeyNode, type SankeyNodeProps } from 'recharts'
import { formatMoney } from '../format'
import type { FlowData } from '../sankeyCalc'

/** Only file in the app that imports recharts — Dashboard.tsx lazy-loads it
 *  so the Budgets/List views never pay for this dependency's bundle size. */

type FlowNodePayload = SankeyNode & { colorClass: string }

// recharts paints nodes/links from a bare default palette with no theme
// provider wired up, so every colour here is explicit — same tokens as the
// rest of the app, not recharts' own blue/grey defaults.
function FlowNode({ x, y, width, height, payload }: SankeyNodeProps) {
  const node = payload as FlowNodePayload
  // A node with nothing flowing out of it (a category, Savings, Uncategorised)
  // is the rightmost thing on its row, so its label reads better to the left;
  // everything else (income sources, the hub) labels to the right.
  const isTerminal = node.targetLinks.length === 0
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} className={node.colorClass} />
      <text
        x={isTerminal ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isTerminal ? 'end' : 'start'}
        dominantBaseline="middle"
        className="fill-label text-caption"
      >
        {node.name}
      </text>
    </g>
  )
}

export default function MoneyFlowChart({ data }: { data: FlowData }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <Sankey
        data={data}
        node={FlowNode}
        // Flat, low-opacity neutral rather than per-link source-colour theming:
        // that would mean a second JS colour map alongside the Tailwind token
        // classes FlowNode already uses, duplicating the one source of truth.
        link={{ stroke: 'var(--color-label-tertiary)', strokeOpacity: 0.3, fill: 'none' }}
        nodePadding={24}
        margin={{ top: 16, right: 120, bottom: 16, left: 120 }}
      >
        <Tooltip
          formatter={(value) => formatMoney(Number(value ?? 0) / 100)}
          separator=": "
          contentStyle={{
            backgroundColor: 'var(--color-surface)',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            boxShadow: 'var(--shadow-card)',
          }}
          itemStyle={{ color: 'var(--color-label)' }}
          labelStyle={{ color: 'var(--color-label-secondary)' }}
        />
      </Sankey>
    </ResponsiveContainer>
  )
}
