import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResourceIcon } from './ResourceIcon'

describe('ResourceIcon', () => {
  it('renders an <img> for an explicit category with a meaningful label', () => {
    const { container } = render(<ResourceIcon name="water" label="Water" />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toContain('water.svg')
    expect(img?.getAttribute('alt')).toBe('Water')
  })

  it('classifies a good id to an icon', () => {
    const { container } = render(<ResourceIcon good="Log" label="Logs" />)
    expect(container.querySelector('img')?.getAttribute('src')).toContain('logs.svg')
  })

  it('renders a neutral fallback (no img) for unknown goods', () => {
    const { container } = render(<ResourceIcon good="Unobtanium" />)
    expect(container.querySelector('img')).toBeNull()
    const fallback = container.querySelector('.resource-icon-fallback')
    expect(fallback?.textContent).toBe('U')
  })

  it('decorative icons carry an empty alt', () => {
    const { container } = render(<ResourceIcon good="Water" decorative />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })
})
