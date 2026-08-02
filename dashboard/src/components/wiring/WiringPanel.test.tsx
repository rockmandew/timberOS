import { describe, expect, it } from 'vitest'
import type { DeviceRegistry } from '../../types'
import { nameFromUrl, slug, withIds } from './WiringPanel'

describe('nameFromUrl', () => {
  it('extracts the lever name from a pasted switch-on URL', () => {
    expect(nameFromUrl('http://localhost:8080/api/switch-on/HTTP%20Lever%201')).toBe('HTTP Lever 1')
    expect(nameFromUrl('http://localhost:8080/api/switch-off/Spillway%20Gate')).toBe('Spillway Gate')
  })

  it('handles a bare path and adapter/lever list URLs', () => {
    expect(nameFromUrl('/api/switch-on/Gate%203')).toBe('Gate 3')
    expect(nameFromUrl('http://localhost:8080/api/levers/Main%20Valve')).toBe('Main Valve')
  })

  it('returns null for a URL that carries no device name', () => {
    expect(nameFromUrl('http://localhost:8080/api/adapters')).toBeNull()
    expect(nameFromUrl('not a url')).toBeNull()
  })
})

describe('slug', () => {
  it('slugifies labels and falls back to "device"', () => {
    expect(slug('Upper Reservoir')).toBe('upper-reservoir')
    expect(slug('  Spillway!! ')).toBe('spillway')
    expect(slug('')).toBe('device')
  })
})

describe('withIds', () => {
  it('derives unique ids and drops incomplete devices', () => {
    const reg: DeviceRegistry = {
      gates: [
        { id: '', label: 'Spillway', lever: 'HTTP Lever 1', method: 'GET' },
        { id: '', label: 'Spillway', lever: 'HTTP Lever 2', method: 'GET' }, // dup label
        { id: '', label: 'No Lever', lever: '', method: 'GET' }, // dropped (no lever)
      ],
      signals: [{ id: '', label: 'Drought', adapter: 'A1' }],
      reservoirs: [
        { id: '', label: 'Upper', unit: 'm', thresholds: [{ adapter: 'g05', value: 0.5 }] },
        { id: '', label: 'Empty', unit: 'm', thresholds: [] }, // dropped (no thresholds)
      ],
    }
    const out = withIds(reg)
    expect(out.gates.map((g) => g.id)).toEqual(['spillway', 'spillway-2'])
    expect(out.signals[0]?.id).toBe('drought')
    expect(out.reservoirs.map((r) => r.id)).toEqual(['upper'])
  })
})
