import { describe, expect, it } from 'vitest'
import { renderWithMotion } from '../../test/renderWithMotion'
import { PowerTurbineVisual } from './PowerTurbineVisual'

describe('PowerTurbineVisual', () => {
  it('does not spin at zero generation even when telemetry is live', () => {
    const { container } = renderWithMotion(
      <PowerTurbineVisual supply={0} demand={5} surplus={-5} />,
      { telemetryConnected: true },
    )
    const svg = container.querySelector('.turbine-svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('is-spinning')).toBe(false)
  })

  it('spins when generating and telemetry is live', () => {
    const { container } = renderWithMotion(
      <PowerTurbineVisual supply={40} demand={20} surplus={20} />,
      { telemetryConnected: true },
    )
    expect(container.querySelector('.turbine-svg.is-spinning')).not.toBeNull()
  })

  it('flags a deficit (supply < demand) as critical', () => {
    const { container } = renderWithMotion(
      <PowerTurbineVisual supply={10} demand={25} surplus={-15} networksInDeficit={1} />,
    )
    expect(container.querySelector('.turbine-svg.state-critical')).not.toBeNull()
    expect(container.querySelector('.turbine-fig-val.deficit')).not.toBeNull()
  })

  it('falls back to the static turbine when there is no feed', () => {
    const { container } = renderWithMotion(<PowerTurbineVisual supply={null} demand={null} surplus={null} />)
    const img = container.querySelector('img.turbine-svg') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toContain('power-turbine')
  })
})
