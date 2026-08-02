import { describe, expect, it } from 'vitest'
import type { ColonyProduction } from '../../types'
import { renderWithMotion } from '../../test/renderWithMotion'
import { ProductionMotion } from './ProductionMotion'

function prod(over: Partial<ColonyProduction>): ColonyProduction {
  return {
    buildings: 0,
    operating: 0,
    utilization: null,
    paused: 0,
    noWorkers: 0,
    noPower: 0,
    noIngredients: 0,
    outputFull: 0,
    noRecipe: 0,
    idle: 0,
    dominantConstraint: null,
    ...over,
  }
}

describe('ProductionMotion', () => {
  it('spins the gears when production is operating and telemetry is live', () => {
    const { container } = renderWithMotion(
      <ProductionMotion production={prod({ buildings: 5, operating: 5, utilization: 1 })} />,
      { telemetryConnected: true },
    )
    expect(container.querySelector('.gears-svg.is-spinning')).not.toBeNull()
  })

  it('does not spin when nothing is operating', () => {
    const { container } = renderWithMotion(
      <ProductionMotion production={prod({ buildings: 3, operating: 0, noWorkers: 3, dominantConstraint: 'no_workers' })} />,
      { telemetryConnected: true },
    )
    expect(container.querySelector('.gears-svg.is-spinning')).toBeNull()
  })

  it('names each dominant constraint in visible + accessible text', () => {
    const cases: Array<[string, RegExp]> = [
      ['no_workers', /workers/i],
      ['no_power', /no power/i],
      ['no_ingredients', /ingredients/i],
      ['output_full', /outputs full/i],
      ['no_recipe', /recipe/i],
    ]
    for (const [c, re] of cases) {
      const { container } = renderWithMotion(
        <ProductionMotion production={prod({ buildings: 5, operating: 2, dominantConstraint: c })} />,
      )
      expect(container.querySelector('.production-reason')?.textContent ?? '').toMatch(re)
      expect(container.querySelector('.gears-svg')?.getAttribute('aria-label')).toMatch(re)
    }
  })

  it('uses amber (constrained) tone when some run and others are stopped', () => {
    const { container } = renderWithMotion(
      <ProductionMotion production={prod({ buildings: 5, operating: 3, noPower: 2, dominantConstraint: 'no_power', utilization: 0.6 })} />,
    )
    expect(container.querySelector('.production.tone-constrained')).not.toBeNull()
  })

  it('uses muted tone for an intentional pause', () => {
    const { container } = renderWithMotion(
      <ProductionMotion production={prod({ buildings: 2, operating: 0, paused: 2, dominantConstraint: 'paused' })} />,
    )
    expect(container.querySelector('.production.tone-muted')).not.toBeNull()
  })

  it('reports honestly when there is no production telemetry', () => {
    const { getByText } = renderWithMotion(<ProductionMotion production={null} />)
    expect(getByText(/No production telemetry/i)).toBeInTheDocument()
  })
})
