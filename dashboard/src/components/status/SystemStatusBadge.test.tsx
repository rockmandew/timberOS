import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SystemStatusBadge } from './SystemStatusBadge'

describe('SystemStatusBadge', () => {
  it('exposes an accessible status role with text (not colour alone)', () => {
    const { getByRole } = render(<SystemStatusBadge status="critical" />)
    const badge = getByRole('status')
    expect(badge).toHaveTextContent('Critical')
    // Icon reinforces state and is hidden from AT (text already conveys it).
    const icon = badge.querySelector('img')
    expect(icon).toHaveAttribute('alt', '')
  })

  it('uses a custom label when provided', () => {
    const { getByRole } = render(<SystemStatusBadge status="healthy" label="Mod connected" />)
    expect(getByRole('status')).toHaveTextContent('Mod connected')
  })

  it('pulses only for critical or reconnecting, never for a healthy steady state', () => {
    const healthy = render(<SystemStatusBadge status="healthy" />)
    expect(within(healthy.container).getByRole('status').classList.contains('timberos-pulse')).toBe(false)

    const critical = render(<SystemStatusBadge status="critical" />)
    expect(within(critical.container).getByRole('status').classList.contains('timberos-pulse')).toBe(true)

    const reconnecting = render(<SystemStatusBadge status="offline" reconnecting />)
    expect(within(reconnecting.container).getByRole('status').classList.contains('timberos-pulse')).toBe(true)
  })
})
