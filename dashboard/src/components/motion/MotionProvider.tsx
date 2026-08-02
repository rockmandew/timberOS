import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Centralizes every reason motion should stop, so no component has to re-derive
 * it. Two tiers:
 *   - `motion-off` on <html> (hard stop of ALL animation incl. alert pulses) when
 *     the OS asks for reduced motion or the operator disables dashboard motion.
 *   - `active` (derived) tells telemetry/decorative visuals whether to animate:
 *     false when reduced/disabled, the game is paused, telemetry is stale or
 *     disconnected, or the tab is hidden. Alert pulses ignore `active` and keep
 *     running (they reflect the dashboard, not the game).
 */
export interface MotionContextValue {
  enabled: boolean
  reducedMotion: boolean
  gamePaused: boolean
  telemetryConnected: boolean
  telemetryStale: boolean
  pageVisible: boolean
  /** True only when telemetry/decorative motion should run. */
  active: boolean
  setEnabled(enabled: boolean): void
}

const noop = () => {}

const DEFAULT: MotionContextValue = {
  enabled: true,
  reducedMotion: false,
  gamePaused: false,
  telemetryConnected: false,
  telemetryStale: false,
  pageVisible: true,
  active: false,
  setEnabled: noop,
}

const MotionContext = createContext<MotionContextValue>(DEFAULT)

export function useMotion(): MotionContextValue {
  return useContext(MotionContext)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export interface MotionProviderProps {
  children: ReactNode
  /** Operator toggle for dashboard motion. Defaults to on. */
  defaultEnabled?: boolean
  gamePaused?: boolean
  telemetryConnected?: boolean
  telemetryStale?: boolean
}

export function MotionProvider({
  children,
  defaultEnabled = true,
  gamePaused = false,
  telemetryConnected = false,
  telemetryStale = false,
}: MotionProviderProps) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [pageVisible, setPageVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Hard stop: reduced motion or operator-disabled. Applied to <html> so it also
  // silences functional alert pulses (no flashing for reduced-motion users).
  const hardOff = reducedMotion || !enabled
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('motion-off', hardOff)
    return () => root.classList.remove('motion-off')
  }, [hardOff])

  const value = useMemo<MotionContextValue>(() => {
    const active = enabled && !reducedMotion && !gamePaused && !telemetryStale && telemetryConnected && pageVisible
    return {
      enabled,
      reducedMotion,
      gamePaused,
      telemetryConnected,
      telemetryStale,
      pageVisible,
      active,
      setEnabled,
    }
  }, [enabled, reducedMotion, gamePaused, telemetryConnected, telemetryStale, pageVisible])

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}
