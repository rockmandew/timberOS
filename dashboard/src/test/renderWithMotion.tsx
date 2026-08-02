import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MotionProvider } from '../components/motion/MotionProvider'

/** Render a component inside a MotionProvider with configurable motion gates. */
export function renderWithMotion(
  ui: ReactElement,
  motion: { telemetryConnected?: boolean; telemetryStale?: boolean; gamePaused?: boolean } = {},
) {
  return render(
    <MotionProvider
      telemetryConnected={motion.telemetryConnected ?? true}
      telemetryStale={motion.telemetryStale ?? false}
      gamePaused={motion.gamePaused ?? false}
    >
      {ui}
    </MotionProvider>,
  )
}
