// Shared HR zone utilities — used by zones.js and heatmap.js

const STORE_KEY = 'hm_zones'

export const ZONE_META = [
  { name: 'Recovery',  color: '#3b82f6', desc: 'Very easy · fully conversational' },
  { name: 'Aerobic',   color: '#22c55e', desc: 'Easy · building aerobic base' },
  { name: 'Tempo',     color: '#f59e0b', desc: 'Moderate · comfortably hard' },
  { name: 'Threshold', color: '#f97316', desc: 'Hard · race pace territory' },
  { name: 'VO2 Max',   color: '#ef4444', desc: 'Max effort · cannot speak' },
]

export function getSavedZoneConfig() {
  return JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
}

export function calcZones(config) {
  if (!config) return null

  if (config.method === 'lthr') {
    const lt = config.lthr
    return [
      { zone: 1, min: 0,                    max: Math.round(lt * 0.84), ...ZONE_META[0] },
      { zone: 2, min: Math.round(lt * 0.85), max: Math.round(lt * 0.89), ...ZONE_META[1] },
      { zone: 3, min: Math.round(lt * 0.90), max: Math.round(lt * 0.94), ...ZONE_META[2] },
      { zone: 4, min: Math.round(lt * 0.95), max: Math.round(lt * 1.02), ...ZONE_META[3] },
      { zone: 5, min: Math.round(lt * 1.03), max: 999,                   ...ZONE_META[4] },
    ]
  }

  // Karvonen / Heart Rate Reserve (max HR + resting HR)
  if (config.method === 'karvonen') {
    const max = config.maxHR
    const rhr = config.rhr
    const hrr = max - rhr  // Heart Rate Reserve
    const k   = (pct) => Math.round(rhr + pct * hrr)
    return [
      { zone: 1, min: k(0.50), max: k(0.60), ...ZONE_META[0] },
      { zone: 2, min: k(0.60), max: k(0.70), ...ZONE_META[1] },
      { zone: 3, min: k(0.70), max: k(0.80), ...ZONE_META[2] },
      { zone: 4, min: k(0.80), max: k(0.90), ...ZONE_META[3] },
      { zone: 5, min: k(0.90), max: max,      ...ZONE_META[4] },
    ]
  }

  // Max HR % only (also used for age-based)
  const max = config.method === 'age' ? 220 - config.age : config.maxHR
  return [
    { zone: 1, min: Math.round(max * 0.50), max: Math.round(max * 0.60), ...ZONE_META[0] },
    { zone: 2, min: Math.round(max * 0.60), max: Math.round(max * 0.70), ...ZONE_META[1] },
    { zone: 3, min: Math.round(max * 0.70), max: Math.round(max * 0.80), ...ZONE_META[2] },
    { zone: 4, min: Math.round(max * 0.80), max: Math.round(max * 0.90), ...ZONE_META[3] },
    { zone: 5, min: Math.round(max * 0.90), max: max,                    ...ZONE_META[4] },
  ]
}

export function getZones() {
  return calcZones(getSavedZoneConfig())
}

// Returns the 0-indexed zone index for a given bpm, or null
export function zoneIndexForHR(bpm, zones) {
  if (!zones || !bpm) return null
  for (let i = 0; i < zones.length; i++) {
    if (bpm >= zones[i].min && bpm <= zones[i].max) return i
  }
  return bpm > zones[zones.length - 1].max ? zones.length - 1 : 0
}
