/**
 * Typed manifest for every timberOS visual asset. All paths are local (served
 * from dashboard/public/assets/timberos) — no CDN, no runtime dependency.
 *
 * Unknown resources resolve to a neutral fallback (null here; the ResourceIcon
 * component renders a neutral placeholder) so the UI never guesses or 404s.
 */

export const ASSET_BASE = '/assets/timberos'

export type ResourceIconName =
  | 'logs'
  | 'planks'
  | 'gears'
  | 'water'
  | 'food'
  | 'science'
  | 'population'
  | 'bots'

export type StatusIconName = 'healthy' | 'warning' | 'critical' | 'offline'

export const brand = {
  mark: `${ASSET_BASE}/brand/timberos-mark.svg`,
  wordmark: `${ASSET_BASE}/brand/timberos-wordmark.svg`,
} as const

export const patterns = {
  woodGrid: `${ASSET_BASE}/patterns/wood-grid-pattern.svg`,
} as const

export const ui = {
  pipeDivider: `${ASSET_BASE}/ui/pipe-divider.svg`,
} as const

export const illustrations = {
  reservoirStatic: `${ASSET_BASE}/illustrations/static/reservoir-gauge.svg`,
  reservoirAnimated: `${ASSET_BASE}/illustrations/animated/reservoir-gauge-animated.svg`,
  powerTurbineStatic: `${ASSET_BASE}/illustrations/static/power-turbine.svg`,
  powerTurbineAnimated: `${ASSET_BASE}/illustrations/animated/power-turbine-animated.svg`,
  badwaterAnimated: `${ASSET_BASE}/illustrations/animated/badwater-wave-animated.svg`,
  gearClusterAnimated: `${ASSET_BASE}/illustrations/animated/gear-cluster-animated.svg`,
} as const

const RESOURCE_ICONS: Record<ResourceIconName, string> = {
  logs: `${ASSET_BASE}/icons/resources/logs.svg`,
  planks: `${ASSET_BASE}/icons/resources/planks.svg`,
  gears: `${ASSET_BASE}/icons/resources/gears.svg`,
  water: `${ASSET_BASE}/icons/resources/water.svg`,
  food: `${ASSET_BASE}/icons/resources/food.svg`,
  science: `${ASSET_BASE}/icons/resources/science.svg`,
  population: `${ASSET_BASE}/icons/resources/population.svg`,
  bots: `${ASSET_BASE}/icons/resources/bots.svg`,
}

const STATUS_ICONS: Record<StatusIconName, string> = {
  healthy: `${ASSET_BASE}/icons/status/healthy.svg`,
  warning: `${ASSET_BASE}/icons/status/warning.svg`,
  critical: `${ASSET_BASE}/icons/status/critical.svg`,
  offline: `${ASSET_BASE}/icons/status/offline.svg`,
}

export function resourceIconPath(name: ResourceIconName): string {
  return RESOURCE_ICONS[name]
}

export function statusIconPath(name: StatusIconName): string {
  return STATUS_ICONS[name]
}

// Explicit food set (grilled/processed/raw). Kept small and readable; anything
// unmatched below falls through to the neutral fallback rather than a wrong icon.
const FOOD_GOODS = new Set([
  'Berries', 'Carrot', 'Potato', 'GrilledPotato', 'Bread', 'Chestnut', 'GrilledChestnut',
  'Dandelion', 'Wheat', 'WheatFlour', 'CattailRoot', 'CattailFlour', 'CattailCracker',
  'Spadderdock', 'GrilledSpadderdock', 'MaplePastry', 'MapleSyrup', 'SunflowerSeeds',
  'Extract', 'Antidote',
])

const GEAR_GOODS = new Set(['Gear', 'MetalBlock', 'ScrapMetal', 'Explosives', 'Catalyst', 'Biofuel'])
const SCIENCE_GOODS = new Set(['Book', 'Paper', 'PunchCard', 'Science'])

/**
 * Classify a Timberborn goodId into one of the eight icon categories, or null
 * for a neutral fallback. Deliberately conservative: an unrecognized good gets
 * the neutral placeholder instead of a misleading icon.
 */
export function resourceIconForGood(goodId: string): ResourceIconName | null {
  if (goodId === 'Water' || goodId === 'Badwater' || goodId.includes('Water')) return 'water'
  if (goodId === 'Log' || goodId === 'Logs') return 'logs'
  if (goodId.includes('Plank')) return 'planks'
  if (goodId.startsWith('Bot')) return 'bots'
  if (GEAR_GOODS.has(goodId)) return 'gears'
  if (SCIENCE_GOODS.has(goodId)) return 'science'
  if (FOOD_GOODS.has(goodId)) return 'food'
  return null
}
