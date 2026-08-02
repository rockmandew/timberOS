import { useEffect, useRef, useState } from 'react'
import { AudioCues } from './audio'
import { AlarmPanel } from './components/AlarmPanel'
import { ColonyPanel } from './components/ColonyPanel'
import { ConfigHealth } from './components/ConfigHealth'
import { ContaminationMap } from './components/ContaminationMap'
import { Diagnostics } from './components/Diagnostics'
import { EventLog } from './components/EventLog'
import { GateControl } from './components/GateControl'
import { IntegrationsPanel } from './components/IntegrationsPanel'
import { ModeSelector } from './components/ModeSelector'
import { TrendChart } from './components/TrendChart'
import { TimberOSLogo } from './components/brand/TimberOSLogo'
import { MotionProvider } from './components/motion/MotionProvider'
import { SystemStatusBadge, type SystemStatus } from './components/status/SystemStatusBadge'
import { ReservoirVisual } from './components/water/ReservoirVisual'
import { WiringPanel } from './components/wiring/WiringPanel'
import { useTimberOS } from './store'
import type { BandSensor, Snapshot } from './types'

const MODE_LABELS: Record<string, string> = {
  normal: 'NORMAL',
  drought_prep: 'DROUGHT PREP',
  drought_emergency: 'DROUGHT EMERGENCY',
  badtide_isolation: 'BADTIDE ISOLATION',
  recovery: 'RECOVERY',
  manual: 'MANUAL ENGINEERING',
}

export function App() {
  const { snapshot, events, trends, gatewayOnline, lastCommand, connect, refreshTrends, dismissCommandResult } = useTimberOS()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => connect(), [connect])
  useAudioCues(snapshot)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const id = setInterval(() => void refreshTrends(), 15000)
    return () => clearInterval(id)
  }, [refreshTrends])

  const alarmCount = snapshot?.alarms.length ?? 0
  const headline = !gatewayOnline
    ? 'GATEWAY OFFLINE — attempting to reconnect'
    : !snapshot?.connected
      ? `TIMBERBORN API OFFLINE${snapshot?.simulated ? ' (simulator)' : ''} — showing last known state`
      : `WATERWORKS: ${MODE_LABELS[snapshot.mode] ?? snapshot.mode} · ${alarmCount === 0 ? 'ALL SYSTEMS STABLE' : `${alarmCount} ACTIVE ALARM${alarmCount > 1 ? 'S' : ''}`}`

  // Motion gates. There are two independent live sources: the waterworks link
  // (real game HTTP adapters or the simulator) and the Data Console colony feed.
  // Motion should run when EITHER is live — a colony that's updating is "running"
  // even if no waterworks adapters are placed. Stale only when the colony feed has
  // gone stale and there's no waterworks link to fall back on.
  const gameLive = (snapshot?.connected ?? false) || (snapshot?.simulated ?? false)
  const colonyLive = snapshot?.colony?.status === 'connected'
  const telemetryConnected = gatewayOnline && (gameLive || colonyLive)
  const telemetryStale = snapshot?.colony?.status === 'stale' && !gameLive

  return (
    <MotionProvider telemetryConnected={telemetryConnected} telemetryStale={telemetryStale}>
      <header className="masthead">
        <TimberOSLogo variant="wordmark" />
        <span className="headline">{headline}</span>
        <ConnectionChip online={gatewayOnline} gameConnected={snapshot?.connected ?? false} simulated={snapshot?.simulated ?? false} />
      </header>

      <div className="grid">
        <section className="panel colony-panel span-rows">
          <h2>Colony — Live Telemetry</h2>
          <ColonyPanel feed={snapshot?.colony} />
        </section>

        <section className="panel">
          <h2>Reservoirs &amp; Sensors</h2>
          <div className="panel-body">
            {snapshot && snapshot.sensors.length > 0 ? (
              snapshot.sensors.map((sensor) => (
                <ReservoirVisual key={sensor.id} {...reservoirFromSensor(sensor, gameLive)} />
              ))
            ) : (
              <div className="unmapped">No band sensors discovered. Place GT_* HTTP adapters in the save.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Water Control</h2>
          <div>
            {snapshot?.automationSuspended && <p className="manual-banner">⚠ Manual Override — automation suspended</p>}
            {snapshot && snapshot.gates.length > 0 ? (
              snapshot.gates.map((gate) => <GateControl key={gate.id} gate={gate} />)
            ) : (
              <div className="unmapped">No gates discovered. Place CMD.FG.* HTTP levers in the save.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Operating Mode</h2>
          <div className="panel-body">
            <ModeSelector current={snapshot?.mode ?? 'normal'} />
          </div>
        </section>

        <section className="panel">
          <h2>Integrations</h2>
          <IntegrationsPanel integrations={snapshot?.integrations ?? []} />
        </section>

        <section className="panel">
          <h2>Diagnostics — Why</h2>
          <Diagnostics insights={snapshot?.insights ?? []} />
        </section>

        <section className="panel">
          <h2>Contamination Network</h2>
          <div className="panel-body">
            {snapshot?.network ? (
              <ContaminationMap network={snapshot.network} />
            ) : (
              <div className="unmapped">No network configured. Add a <code>network</code> block to config.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Active Alarms</h2>
          <AlarmPanel alarms={snapshot?.alarms ?? []} now={now} />
        </section>

        <section className="panel">
          <h2>Sensor Trends</h2>
          <div className="panel-body trends">
            {trends.length > 0 ? (
              trends.map((series) => <TrendChart key={series.sensorId} series={series} />)
            ) : (
              <div className="unmapped">Collecting band history…</div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Config Health</h2>
          <ConfigHealth lint={snapshot?.lint ?? []} />
        </section>

        <section className="panel">
          <h2>Event History</h2>
          <EventLog events={events} />
        </section>

        <section className="panel wiring-panel span-rows">
          <h2>Wiring — Devices</h2>
          <WiringPanel />
        </section>

        <section className="panel">
          <h2>Signals</h2>
          <div className="panel-body">
            {snapshot?.signals && snapshot.signals.length > 0 ? (
              snapshot.signals.map((s) => (
                <div className="signal-row" key={s.id}>
                  <span className={`sig-dot ${s.state ? 'on' : 'off'}`} aria-hidden="true" />
                  <span className="sig-label">{s.label}</span>
                  <span className="sig-state">{s.state ? 'ON' : 'OFF'}</span>
                </div>
              ))
            ) : (
              <div className="unmapped">No signals registered. Add HTTP Adapters in the Wiring panel.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Unmapped Signals</h2>
          <div className="panel-body">
            {snapshot && snapshot.unmapped.length > 0 ? (
              snapshot.unmapped.map((sig) => (
                <div className="unmapped" key={`${sig.kind}:${sig.name}`}>
                  <code>{sig.name}</code> <span className="chip">{sig.kind}</span> {sig.state ? 'ON' : 'OFF'}
                </div>
              ))
            ) : (
              <div className="unmapped">All discovered signals are mapped. ✓</div>
            )}
          </div>
        </section>
      </div>

      {lastCommand && (
        <div className={`toast ${lastCommand.status}`} onClick={dismissCommandResult} role="status">
          {lastCommand.ok ? '✓' : '⚠'} {lastCommand.message}
        </div>
      )}
    </MotionProvider>
  )
}

/**
 * Map a boolean-band water sensor to the ReservoirVisual props. Fraction → fill%
 * (null stays unknown, never 0); a low level reads as warning/critical; a faulted
 * sensor is unknown; the game link being down marks it stale.
 */
function reservoirFromSensor(sensor: BandSensor, gameLive: boolean) {
  const fillPercent = sensor.fraction == null ? null : Math.round(sensor.fraction * 100)
  const trend = sensor.trend === 'unknown' ? undefined : sensor.trend
  const status: 'healthy' | 'warning' | 'critical' | 'unknown' =
    sensor.fault || fillPercent == null
      ? 'unknown'
      : fillPercent <= 15
        ? 'critical'
        : fillPercent <= 35
          ? 'warning'
          : 'healthy'
  return { name: sensor.label, fillPercent, trend, status, stale: !gameLive }
}

/**
 * Drives the PC audio cues from the live snapshot. The player is created once
 * and follows the `audio` integration's on/off state; the Web Audio context is
 * unlocked on the operator's first interaction (browser autoplay policy).
 */
function useAudioCues(snapshot: Snapshot | null) {
  const cuesRef = useRef<AudioCues | null>(null)
  if (!cuesRef.current) cuesRef.current = new AudioCues()
  const audioEnabled = snapshot?.integrations.find((i) => i.id === 'audio')?.enabled ?? false

  useEffect(() => {
    cuesRef.current?.setEnabled(audioEnabled)
  }, [audioEnabled])

  useEffect(() => {
    const unlock = () => cuesRef.current?.resume()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (snapshot) cuesRef.current?.handle(snapshot)
  }, [snapshot])
}

function ConnectionChip({ online, gameConnected, simulated }: { online: boolean; gameConnected: boolean; simulated: boolean }) {
  const [status, label, reconnecting]: [SystemStatus, string, boolean] = !online
    ? ['offline', 'Gateway offline', true]
    : simulated
      ? ['healthy', 'Simulator', false]
      : !gameConnected
        ? ['warning', 'Game offline', false]
        : ['healthy', 'Connected', false]
  return (
    <span className="conn-indicator">
      <TimberOSLogo variant="mark" size="sm" />
      <SystemStatusBadge status={status} label={label} reconnecting={reconnecting} />
    </span>
  )
}
