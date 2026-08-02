import { describe, expect, it } from 'vitest'
import { renderWithMotion } from '../../test/renderWithMotion'
import { ContaminationWave } from './ContaminationWave'

describe('ContaminationWave', () => {
  it('renders nothing when contamination is zero', () => {
    const { container } = renderWithMotion(<ContaminationWave percent={0} />)
    expect(container.querySelector('.contam')).toBeNull()
  })

  it('renders nothing when contamination is unknown (null)', () => {
    const { container } = renderWithMotion(<ContaminationWave percent={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a numeric value and drifts when contamination exists and telemetry is live', () => {
    const { container, getByText } = renderWithMotion(<ContaminationWave percent={34.4} />, {
      telemetryConnected: true,
    })
    expect(getByText('34%')).toBeInTheDocument()
    expect(container.querySelector('.contam-svg.is-animated')).not.toBeNull()
  })

  it('marks high contamination critical and never depends on colour alone', () => {
    const { container, getByLabelText } = renderWithMotion(<ContaminationWave percent={80} />)
    expect(container.querySelector('.contam-svg.sev-critical')).not.toBeNull()
    // Accessible text carries the state, not just colour.
    expect(getByLabelText(/Contamination: 80%, critical/)).toBeInTheDocument()
  })

  it('stops drift when telemetry is stale', () => {
    const { container } = renderWithMotion(<ContaminationWave percent={40} stale />, {
      telemetryConnected: true,
    })
    expect(container.querySelector('.contam-svg.is-animated')).toBeNull()
  })
})
