import type { RelationshipInsight } from '../types'

/**
 * Diagnostics: the relationship engine's causal read-outs (docs/ROADMAP.md
 * Phase 2). Explains *why* a sensor is adverse — "North Fields Moisture is
 * dropping · because the irrigation gate is closed while a drought is active".
 * Observational only.
 */
export function Diagnostics({ insights }: { insights: RelationshipInsight[] }) {
  if (insights.length === 0) {
    return <div className="all-clear">✓ NOTHING TRENDING ADVERSE</div>
  }
  return (
    <div className="insights">
      {insights.map((it) => (
        <div className={`insight ${it.severity}`} key={it.sensorId}>
          <span className="insight-icon" aria-hidden>{it.severity === 'critical' ? '▲' : it.severity === 'warning' ? '⚠' : 'ℹ'}</span>
          <div className="insight-body">
            <span className="insight-headline">{it.headline}</span>
            <span className="insight-because"> · because {it.because}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
