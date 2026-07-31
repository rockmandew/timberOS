import type { NetworkView, NetworkNodeView } from '../types'

/**
 * Contamination / flow network (docs/ROADMAP.md Phase 2). Nodes are the water
 * system's reservoirs, junctions, fields and outlets; edges are gated routes.
 * Clean flow animates in water-blue, badwater in the contaminated hue, and a
 * route deliberately cut to protect downstream nodes renders as a dashed,
 * struck-through "isolated" link.
 */

const W = 360
const H = 300
const PAD = 30
const R = 13

export function ContaminationMap({ network }: { network: NetworkView }) {
  const byId = new Map(network.nodes.map((n) => [n.id, n]))
  const px = (x: number) => PAD + x * (W - 2 * PAD)
  const py = (y: number) => PAD + y * (H - 2 * PAD)

  return (
    <div className="netmap">
      <svg viewBox={`0 0 ${W} ${H}`} className="netmap-svg" role="img" aria-label="Water network status">
        <defs>
          <marker id="arrow-clean" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-clean" />
          </marker>
          <marker id="arrow-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-bad" />
          </marker>
        </defs>

        {network.edges.map((edge) => {
          const a = byId.get(edge.from)
          const b = byId.get(edge.to)
          if (!a || !b) return null
          const [x1, y1, x2, y2] = trim(px(a.x), py(a.y), px(b.x), py(b.y), R + 3)
          const state = edge.contaminated ? 'contaminated' : edge.isolated ? 'isolated' : edge.flowing ? 'flowing' : 'idle'
          const marker = edge.contaminated ? 'url(#arrow-bad)' : edge.flowing ? 'url(#arrow-clean)' : undefined
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          return (
            <g key={edge.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={`edge ${state}`} markerEnd={marker} />
              {edge.isolated && <line x1={mx - 6} y1={my - 6} x2={mx + 6} y2={my + 6} className="edge-cut" />}
              {edge.label && <text x={mx} y={my - 5} className={`edge-label ${state}`}>{edge.label}</text>}
            </g>
          )
        })}

        {network.nodes.map((n) => (
          <g key={n.id} transform={`translate(${px(n.x)}, ${py(n.y)})`}>
            {n.contaminated && <circle r={R + 4} className="node-contam-ring" />}
            <circle r={R} className={`node ${n.kind} ${n.contaminated ? 'contaminated' : ''}`} />
            <text y={1} className="node-glyph" aria-hidden>{glyph(n.kind)}</text>
            <text y={R + 13} className="node-label">{n.label}</text>
          </g>
        ))}
      </svg>

      <div className="netmap-legend">
        <span className="lg lg-flowing">clean flow</span>
        <span className="lg lg-contaminated">badwater</span>
        <span className="lg lg-isolated">isolated</span>
        <span className="lg lg-idle">no flow</span>
      </div>
    </div>
  )
}

function glyph(kind: NetworkNodeView['kind']): string {
  switch (kind) {
    case 'reservoir': return '≈'
    case 'source': return '⚑'
    case 'junction': return '◇'
    case 'field': return '❦'
    case 'outlet': return '⇲'
    case 'colony': return '⌂'
    default: return '•'
  }
}

/** Shorten a segment by `gap` at each end so it doesn't run under the node discs. */
function trim(x1: number, y1: number, x2: number, y2: number, gap: number): [number, number, number, number] {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return [x1 + ux * gap, y1 + uy * gap, x2 - ux * gap, y2 - uy * gap]
}
