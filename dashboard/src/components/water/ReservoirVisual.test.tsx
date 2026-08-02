import { describe, expect, it } from 'vitest'
import { renderWithMotion } from '../../test/renderWithMotion'
import { ReservoirVisual } from './ReservoirVisual'

describe('ReservoirVisual', () => {
  it('shows "Unknown" for missing level and renders no water body (never 0)', () => {
    const { container, getByText } = renderWithMotion(
      <ReservoirVisual name="Upper Reservoir" fillPercent={null} status="unknown" />,
    )
    expect(getByText('Unknown')).toBeInTheDocument()
    expect(container.querySelector('.reservoir-water')).toBeNull()
    expect(container.querySelector('.reservoir-unknown')).not.toBeNull()
  })

  it('clamps fill values to 0–100', () => {
    const { container } = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={150} status="healthy" />,
    )
    const water = container.querySelector('.reservoir-water') as HTMLElement
    expect(water.style.getPropertyValue('--fill')).toBe('100%')

    const { container: c2 } = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={-20} status="critical" />,
    )
    const water2 = c2.querySelector('.reservoir-water') as HTMLElement
    expect(water2.style.getPropertyValue('--fill')).toBe('0%')
  })

  it('animates the wave only when telemetry is live and not stale', () => {
    const live = renderWithMotion(<ReservoirVisual name="R" fillPercent={60} status="healthy" />, {
      telemetryConnected: true,
    })
    expect(live.container.querySelector('.reservoir-water.is-animated')).not.toBeNull()

    const stale = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={60} status="healthy" stale />,
      { telemetryConnected: true },
    )
    expect(stale.container.querySelector('.reservoir-water.is-animated')).toBeNull()
    expect(stale.container.querySelector('.reservoir.is-stale')).not.toBeNull()
  })

  it('pulses only for a live critical state', () => {
    const crit = renderWithMotion(<ReservoirVisual name="R" fillPercent={10} status="critical" />)
    expect(crit.container.querySelector('.reservoir-tank.is-critical')).not.toBeNull()

    const staleCrit = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={10} status="critical" stale />,
    )
    expect(staleCrit.container.querySelector('.reservoir-tank.is-critical')).toBeNull()
  })

  it('renders a contamination layer only when a real value > 0 exists', () => {
    const none = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={50} status="healthy" contaminationPercent={0} />,
    )
    expect(none.container.querySelector('.reservoir-contam')).toBeNull()

    const some = renderWithMotion(
      <ReservoirVisual name="R" fillPercent={50} status="warning" contaminationPercent={30} />,
    )
    expect(some.container.querySelector('.reservoir-contam')).not.toBeNull()
  })
})
