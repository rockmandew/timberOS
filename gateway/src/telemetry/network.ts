import type { NetworkConfig } from '../config.js'
import type { GateState, NetworkEdgeView, NetworkView } from '../types.js'

/**
 * Contamination / flow network derivation (docs/ROADMAP.md Phase 2).
 *
 * Turns the configured topology plus live gate + signal state into a view the
 * dashboard animates: which edges carry clean water, which carry badwater, and
 * which routes have been deliberately isolated (a gate closed to keep
 * contamination out of downstream nodes). Contamination propagates downstream
 * along flowing edges to a fixpoint.
 */
export function deriveNetwork(
  config: NetworkConfig | undefined,
  gates: GateState[],
  signals: Map<string, boolean>,
): NetworkView | null {
  if (!config) return null

  const gateOpen = new Map<string, boolean>()
  for (const g of gates) {
    gateOpen.set(g.id, g.confirmed === true || (typeof g.confirmed === 'number' && g.confirmed > 0))
  }

  // Base contamination from watched signals.
  const contaminated = new Set<string>()
  for (const node of config.nodes) {
    if (node.contaminatedWhenSignal && signals.get(node.contaminatedWhenSignal)) contaminated.add(node.id)
  }

  // An edge flows when it has no gate (open channel) or its gate is confirmed open.
  const flowing = new Map<string, boolean>()
  for (const edge of config.edges) {
    flowing.set(edge.id, edge.gate ? (gateOpen.get(edge.gate) ?? false) : true)
  }

  // Propagate contamination downstream along flowing edges to a fixpoint.
  let changed = true
  while (changed) {
    changed = false
    for (const edge of config.edges) {
      if (!flowing.get(edge.id)) continue
      const carriesBad = edge.carriesContamination || contaminated.has(edge.from)
      if (carriesBad && !contaminated.has(edge.to)) {
        contaminated.add(edge.to)
        changed = true
      }
    }
  }

  const edges: NetworkEdgeView[] = config.edges.map((edge) => {
    const isFlowing = flowing.get(edge.id) ?? false
    const carriesBad = isFlowing && (edge.carriesContamination || contaminated.has(edge.from))
    const wouldCarryBad = edge.carriesContamination || contaminated.has(edge.from)
    const isolated = Boolean(edge.gate) && !isFlowing && wouldCarryBad
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      gate: edge.gate ?? null,
      flowing: isFlowing && !carriesBad,
      contaminated: carriesBad,
      isolated,
      label: edge.label ?? null,
    }
  })

  return {
    nodes: config.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      x: n.x,
      y: n.y,
      contaminated: contaminated.has(n.id),
    })),
    edges,
  }
}
