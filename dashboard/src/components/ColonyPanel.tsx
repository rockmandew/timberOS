import type { ReactNode } from 'react'
import type { ColonyFeedState, ColonyFeedStatus, ColonyResource, ColonyWeather } from '../types'
import { ContaminationWave } from './environment/ContaminationWave'
import { ResourceIcon } from './icons/ResourceIcon'
import { PowerTurbineVisual } from './power/PowerTurbineVisual'

/**
 * Live colony telemetry from the timberOS Data Console mod (population,
 * resources, weather, power). Read-only. Degrades honestly: when the feed is
 * unavailable/stale/disabled it says so instead of showing zeros, and any single
 * value the mod couldn't read renders as "—" rather than a fake number.
 */

const STATUS_CHIP: Record<ColonyFeedStatus, string> = {
  connected: 'good',
  stale: 'warning',
  unavailable: 'offline',
  disabled: 'offline',
}

const STATUS_LABEL: Record<ColonyFeedStatus, string> = {
  connected: 'live',
  stale: 'stale',
  unavailable: 'no data',
  disabled: 'disabled',
}

const MAX_RESOURCES = 14

/** Format a possibly-unknown integer: null → "—", otherwise locale-grouped. */
function num(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString()
}

export function ColonyPanel({ feed }: { feed: ColonyFeedState | undefined }) {
  if (!feed || feed.status === 'disabled') {
    return (
      <div className="unmapped">
        Colony feed is off. Install the{' '}
        <a href="https://github.com/rockmandew/timberOSDataConsole" target="_blank" rel="noreferrer">
          Data Console
        </a>{' '}
        mod and enable <code>dataConsole</code> in config.
      </div>
    )
  }

  const chip = STATUS_CHIP[feed.status]
  const statusRow = (
    <div className="colony-status">
      <span className={`chip ${chip}`}>{STATUS_LABEL[feed.status]}</span>
      {feed.message && <span className="colony-status-msg">{feed.message}</span>}
    </div>
  )

  const snap = feed.colony
  if (!snap || feed.status !== 'connected') {
    // No usable data yet (mod not running, or gone stale) — be explicit, not blank.
    return (
      <div className="panel-body colony">
        {statusRow}
        {!snap && (
          <div className="unmapped">
            Waiting for the game. Launch Timberborn with the Data Console mod and load a settlement.
          </div>
        )}
        {snap && feed.status === 'stale' && (
          <div className="unmapped">Showing the last snapshot received; it may be out of date.</div>
        )}
        {snap && <ColonyBody feed={feed} />}
      </div>
    )
  }

  return (
    <div className="panel-body colony">
      {statusRow}
      <ColonyBody feed={feed} />
    </div>
  )
}

function ColonyBody({ feed }: { feed: ColonyFeedState }) {
  const snap = feed.colony!
  const { game, population, resources, weather, power } = snap.payload
  const stale = feed.status !== 'connected'
  const contaminatedPct =
    population && population.contaminatedBeavers != null && population.total > 0
      ? (population.contaminatedBeavers / population.total) * 100
      : null

  return (
    <>
      <div className="colony-head">
        <span className="colony-settlement">{game?.settlementName ?? snap.settlementId ?? 'Settlement'}</span>
        {game?.factionId && <span className="chip">{game.factionId}</span>}
        {snap.gameTime && (
          <span className="colony-time">
            Cycle {snap.gameTime.cycle} · Day {snap.gameTime.cycleDay}
          </span>
        )}
        {weather && <WeatherBadge weather={weather} />}
      </div>

      {population ? (
        <div className="stat-grid">
          <Stat label="Population" value={num(population.total)} big icon={<ResourceIcon name="population" size="md" decorative />} />
          <Stat label="Adults" value={num(population.adults)} />
          <Stat label="Children" value={num(population.children)} />
          <Stat label="Bots" value={num(population.bots)} icon={<ResourceIcon name="bots" decorative />} />
          <Stat label="Jobs (filled/open)" value={`${num(population.employed)} / ${num(population.openJobs)}`} />
          <Stat label="Beds" value={num(population.beds)} />
          {population.contaminatedBeavers !== null && population.contaminatedBeavers > 0 && (
            <Stat label="Contaminated" value={num(population.contaminatedBeavers)} tone="critical" />
          )}
        </div>
      ) : (
        <div className="unmapped">Population telemetry unavailable.</div>
      )}

      {contaminatedPct != null && contaminatedPct > 0 && (
        <ContaminationWave percent={contaminatedPct} label="Colony contamination" stale={stale} />
      )}

      {power && (
        <div className="colony-power">
          <h3 className="colony-subhead">Power</h3>
          <PowerTurbineVisual
            supply={power.totalSupply}
            demand={power.totalDemand}
            surplus={power.totalSurplus}
            batteryCharge={power.totalBatteryCharge}
            batteryCapacity={power.totalBatteryCapacity}
            networksInDeficit={power.networksInDeficit}
            stale={stale}
          />
        </div>
      )}

      <h3 className="colony-subhead">Resources</h3>
      {resources && resources.length > 0 ? (
        <ResourceList resources={resources} />
      ) : (
        <div className="unmapped">No resource telemetry.</div>
      )}
    </>
  )
}

function Stat({
  label,
  value,
  big,
  tone,
  icon,
}: {
  label: string
  value: string
  big?: boolean
  tone?: 'critical'
  icon?: ReactNode
}) {
  return (
    <div className={`stat${big ? ' stat-big' : ''}${tone ? ` ${tone}` : ''}`}>
      <div className="stat-value">
        {icon}
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function WeatherBadge({ weather }: { weather: ColonyWeather }) {
  if (weather.isHazardous) {
    const hazard = weather.hazardId ?? 'Hazard'
    const left = weather.hazardDaysRemaining
    return (
      <span className="chip critical" title="Hazardous weather active">
        {hazard}
        {left !== null ? ` · ${left}d left` : ''}
      </span>
    )
  }
  const upcoming = weather.hazardId ?? 'hazard'
  const until = weather.daysUntilHazard
  return (
    <span className="chip water" title="Temperate weather">
      Temperate{until !== null ? ` · ${upcoming} in ${until}d` : ''}
    </span>
  )
}

function ResourceList({ resources }: { resources: ColonyResource[] }) {
  const sorted = [...resources].sort((a, b) => b.amount - a.amount)
  const shown = sorted.slice(0, MAX_RESOURCES)
  const hidden = sorted.length - shown.length

  return (
    <div className="resource-list">
      {shown.map((r) => {
        const frac = r.capacity > 0 ? Math.min(1, r.amount / r.capacity) : null
        const near = frac !== null && frac >= 0.92
        return (
          <div className="resource-row" key={r.goodId}>
            <span className="resource-name">
              <ResourceIcon good={r.goodId} decorative /> {r.goodId}
            </span>
            <span className="resource-bar" aria-hidden="true">
              <span
                className={`resource-fill${near ? ' near-full' : ''}`}
                style={{ width: `${frac === null ? 0 : Math.round(frac * 100)}%` }}
              />
            </span>
            <span className="resource-amount">
              {r.amount.toLocaleString()}
              {r.capacity > 0 && <span className="resource-cap"> / {r.capacity.toLocaleString()}</span>}
            </span>
          </div>
        )
      })}
      {hidden > 0 && <div className="resource-more">+{hidden} more goods</div>}
    </div>
  )
}
