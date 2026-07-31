import type { LintFinding } from '../types'

/**
 * Config Health: the linter's findings (docs/ROADMAP.md Phase 2). A wiring
 * mistake in the save — a gate with no ack, an interlock referencing a missing
 * sensor — shows up here as a warning instead of a silent wrong reading.
 */
export function ConfigHealth({ lint }: { lint: LintFinding[] }) {
  if (lint.length === 0) {
    return <div className="all-clear">✓ CONFIG HEALTHY — every signal reconciles</div>
  }

  const errors = lint.filter((f) => f.severity === 'error').length
  const warnings = lint.filter((f) => f.severity === 'warning').length
  const infos = lint.filter((f) => f.severity === 'info').length

  return (
    <div className="lint">
      <div className="lint-summary">
        {errors > 0 && <span className="chip critical">{errors} error{errors > 1 ? 's' : ''}</span>}
        {warnings > 0 && <span className="chip warning">{warnings} warning{warnings > 1 ? 's' : ''}</span>}
        {infos > 0 && <span className="chip">{infos} info</span>}
      </div>
      <div className="lint-list">
        {lint.map((f, i) => (
          <div className={`lint-item ${f.severity}`} key={`${f.code}:${f.subject}:${i}`}>
            <span className="lint-icon" aria-hidden>{icon(f.severity)}</span>
            <div className="lint-body">
              <code className="lint-subject">{f.subject}</code>
              <span className="lint-msg">{f.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function icon(sev: LintFinding['severity']): string {
  return sev === 'error' ? '✕' : sev === 'warning' ? '⚠' : 'ℹ'
}
