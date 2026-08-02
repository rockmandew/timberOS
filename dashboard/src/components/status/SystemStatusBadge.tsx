import { statusIconPath, type StatusIconName } from '../../lib/timberosAssets'

export type SystemStatus = 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown'

/**
 * Text-and-icon status badge for mod / service / WebSocket / compatibility /
 * collector / native-HTTP status. Never relies on colour alone (icon + text +
 * colour). Healthy indicators are static; only `reconnecting` or `critical`
 * pulse. Motion respects reduced-motion via the global motion-off switch.
 */

const ICON_FOR: Record<SystemStatus, StatusIconName> = {
  healthy: 'healthy',
  warning: 'warning',
  critical: 'critical',
  offline: 'offline',
  unknown: 'offline',
}

const DEFAULT_LABEL: Record<SystemStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
  unknown: 'Unknown',
}

export function SystemStatusBadge({
  status,
  label,
  reconnecting = false,
  className,
}: {
  status: SystemStatus
  label?: string
  /** Show a pulse to indicate an active reconnect attempt. */
  reconnecting?: boolean
  className?: string
}) {
  const text = label ?? DEFAULT_LABEL[status]
  const pulse = reconnecting || status === 'critical'
  return (
    <span
      className={`status-badge ${status}${pulse ? ' timberos-pulse' : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      <img className="status-badge-icon" src={statusIconPath(ICON_FOR[status])} alt="" aria-hidden="true" />
      <span className="status-badge-text">{text}</span>
    </span>
  )
}
