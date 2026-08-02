import { render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MotionProvider, useMotion } from './MotionProvider'

function Probe() {
  const m = useMotion()
  return <span data-testid="probe" data-active={String(m.active)} data-reduced={String(m.reducedMotion)} />
}

function mockReduced(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? matches : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => document.documentElement.classList.remove('motion-off'))

describe('MotionProvider', () => {
  it('disables motion and sets html.motion-off under reduced-motion', () => {
    mockReduced(true)
    const { getByTestId } = render(
      <MotionProvider telemetryConnected>
        <Probe />
      </MotionProvider>,
    )
    expect(getByTestId('probe').getAttribute('data-reduced')).toBe('true')
    expect(getByTestId('probe').getAttribute('data-active')).toBe('false')
    expect(document.documentElement.classList.contains('motion-off')).toBe(true)
  })

  it('is active when connected, not stale, motion allowed', () => {
    mockReduced(false)
    const { getByTestId } = render(
      <MotionProvider telemetryConnected>
        <Probe />
      </MotionProvider>,
    )
    expect(getByTestId('probe').getAttribute('data-active')).toBe('true')
    expect(document.documentElement.classList.contains('motion-off')).toBe(false)
  })

  it('is inactive when telemetry is stale or disconnected', () => {
    mockReduced(false)
    const stale = render(
      <MotionProvider telemetryConnected telemetryStale>
        <Probe />
      </MotionProvider>,
    )
    expect(within(stale.container).getByTestId('probe').getAttribute('data-active')).toBe('false')

    const disconnected = render(
      <MotionProvider telemetryConnected={false}>
        <Probe />
      </MotionProvider>,
    )
    expect(within(disconnected.container).getByTestId('probe').getAttribute('data-active')).toBe('false')
  })
})
