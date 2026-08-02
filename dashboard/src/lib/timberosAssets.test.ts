import { describe, expect, it } from 'vitest'
import {
  brand,
  resourceIconForGood,
  resourceIconPath,
  statusIconPath,
} from './timberosAssets'

describe('timberosAssets manifest', () => {
  it('resolves resource icon paths under the local asset base', () => {
    expect(resourceIconPath('water')).toBe('/assets/timberos/icons/resources/water.svg')
    expect(resourceIconPath('logs')).toMatch(/\/assets\/timberos\/icons\/resources\/logs\.svg$/)
  })

  it('resolves status icon and brand paths', () => {
    expect(statusIconPath('healthy')).toBe('/assets/timberos/icons/status/healthy.svg')
    expect(brand.mark).toBe('/assets/timberos/brand/timberos-mark.svg')
    expect(brand.wordmark).toContain('/assets/timberos/')
  })
})

describe('resourceIconForGood classification + neutral fallback', () => {
  it('maps known goods to categories', () => {
    expect(resourceIconForGood('Log')).toBe('logs')
    expect(resourceIconForGood('Water')).toBe('water')
    expect(resourceIconForGood('Badwater')).toBe('water')
    expect(resourceIconForGood('TreatedPlank')).toBe('planks')
    expect(resourceIconForGood('Gear')).toBe('gears')
    expect(resourceIconForGood('BotHead')).toBe('bots')
    expect(resourceIconForGood('Carrot')).toBe('food')
    expect(resourceIconForGood('Book')).toBe('science')
  })

  it('returns null (neutral fallback) for unknown goods', () => {
    expect(resourceIconForGood('Unobtanium')).toBeNull()
    expect(resourceIconForGood('')).toBeNull()
  })
})
