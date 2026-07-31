import { useTimberOS } from '../store'
import type { IntegrationKind, IntegrationState } from '../types'

const KIND_ICON: Record<IntegrationKind, string> = {
  light: '💡',
  audio: '🔊',
  voice: '🗣️',
  chat: '💬',
  console: '🖥️',
}

/**
 * Live enable/disable switches for every ambient-output integration (Hue,
 * PC audio, …). The authoritative state comes from the snapshot, so a toggle
 * flipped on one display reflects on every other one within a tick.
 */
export function IntegrationsPanel({ integrations }: { integrations: IntegrationState[] }) {
  const setIntegration = useTimberOS((s) => s.setIntegration)

  if (integrations.length === 0) {
    return <div className="unmapped">No integrations configured. Add an <code>annunciators</code> block to config.</div>
  }

  return (
    <div className="integrations">
      {integrations.map((it) => (
        <div className={`integration ${it.enabled ? 'on' : 'off'}`} key={it.id}>
          <span className="integration-icon" aria-hidden="true">{KIND_ICON[it.kind] ?? '◈'}</span>
          <div className="integration-body">
            <div className="integration-name">{it.label}</div>
            <div className="integration-detail">{it.available ? it.detail : `⚠ ${it.detail}`}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={it.enabled}
            aria-label={`${it.enabled ? 'Disable' : 'Enable'} ${it.label}`}
            className={`switch ${it.enabled ? 'on' : ''}`}
            onClick={() => void setIntegration(it.id, !it.enabled)}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span className="switch-label">{it.enabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      ))}
    </div>
  )
}
