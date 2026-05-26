// SVG line charts for the run detail blade
// renderHRChart(stream, zones)  — heart rate with zone colour bands
// renderPaceChart(stream)       — pace (velocity_smooth) as area + line

const W = 320, H = 160
const PL = 44, PR = 18, PT = 8, PB = 28   // padding
const CW = W - PL - PR                     // chart width  = 258
const CH = H - PT - PB                     // chart height = 124

// ── Public API ────────────────────────────────────────────────────────────────

export function renderHRChart(stream, zones) {
  const hrArr   = stream.heartrate?.data
  const distArr = stream.distance?.data
  if (!hrArr?.length || !distArr?.length) return ''

  const raw = _zip(distArr, hrArr).filter(p => p[1] > 0)
  const pts = _downsample(raw, 300)
  if (pts.length < 2) return ''

  const maxDist = pts[pts.length - 1][0]
  const hrVals  = pts.map(p => p[1])
  const minHR   = Math.min(...hrVals)
  const maxHR   = Math.max(...hrVals)
  const avgHR   = Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length)
  const pad     = Math.max((maxHR - minHR) * 0.12, 6)
  const yLo     = minHR - pad
  const yHi     = maxHR + pad

  // Higher bpm → smaller SVG y → top of chart
  const xS = d => PL + (d / maxDist) * CW
  const yS = b => PT + CH - ((b - yLo) / (yHi - yLo)) * CH

  // Zone background bands
  const bands = (zones || []).map(z => {
    const lo = Math.max(z.min, yLo)
    const hi = Math.min(z.max >= 900 ? yHi + 50 : z.max, yHi)
    if (hi <= lo) return ''
    const y1 = yS(hi), h = yS(lo) - yS(hi)
    if (h <= 0) return ''
    return `<rect x="${PL}" y="${y1.toFixed(1)}" width="${CW}" height="${h.toFixed(1)}" fill="${z.color}" opacity="0.14"/>`
  }).join('')

  // HR polyline
  const line = pts.map((p, i) =>
    `${i ? 'L' : 'M'}${xS(p[0]).toFixed(1)},${yS(p[1]).toFixed(1)}`
  ).join('')

  const avgY = yS(avgHR).toFixed(1)

  // Y-axis grid + labels
  const yTicks = _niceTicks(yLo, yHi, 4)
  const yGrid  = yTicks.map(b => {
    const y = yS(b).toFixed(1)
    return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>` +
           `<text x="${PL - 3}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.38)">${Math.round(b)}</text>`
  }).join('')

  // X-axis km labels
  const xLbls = _kmLabels(maxDist, xS)

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">
      ${bands}
      ${yGrid}
      ${xLbls}
      <line x1="${PL}" y1="${PT + CH}" x2="${W - PR}" y2="${PT + CH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <path d="${line}" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${PL}" y1="${avgY}" x2="${W - PR}" y2="${avgY}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3" opacity="0.60"/>
      <text x="${W - PR + 2}" y="${(+avgY + 4).toFixed(1)}" font-size="9" fill="#ef4444">${avgHR}</text>
    </svg>
    <p style="font-size:11px;color:var(--text-muted);text-align:center;margin:3px 0 0;">Avg ${avgHR} bpm · x-axis = km</p>`
}

export function renderPaceChart(stream) {
  const velArr  = stream.velocity_smooth?.data
  const distArr = stream.distance?.data
  if (!velArr?.length || !distArr?.length) return ''

  // m/s → min/km; filter stopped / impossible speeds
  const raw = _zip(distArr, velArr)
    .filter(p => p[1] > 0.8 && p[1] < 10)
    .map(p => [p[0], 1000 / (p[1] * 60)])
    .filter(p => p[1] < 20)

  const pts = _downsample(raw, 300)
  if (pts.length < 2) return ''

  const maxDist  = pts[pts.length - 1][0]
  const paceVals = pts.map(p => p[1])
  const minPace  = Math.min(...paceVals)
  const maxPace  = Math.max(...paceVals)
  const avgPace  = paceVals.reduce((s, v) => s + v, 0) / paceVals.length
  const pad      = Math.max((maxPace - minPace) * 0.12, 0.25)
  const yLo      = minPace - pad
  const yHi      = maxPace + pad

  // Strava-style: slower pace (higher min/km) → top of chart
  //   yS(yHi) = PT          (top   — slowest)
  //   yS(yLo) = PT + CH     (bottom — fastest)
  const xS = d => PL + (d / maxDist) * CW
  const yS = p => PT + CH - ((p - yLo) / (yHi - yLo)) * CH

  const line = pts.map((p, i) =>
    `${i ? 'L' : 'M'}${xS(p[0]).toFixed(1)},${yS(p[1]).toFixed(1)}`
  ).join('')

  // Area fill from line down to bottom (x-axis baseline)
  const area = `${line} L${xS(pts[pts.length - 1][0]).toFixed(1)},${PT + CH} L${xS(pts[0][0]).toFixed(1)},${PT + CH} Z`

  const avgY = yS(avgPace).toFixed(1)

  // Y-axis ticks with pace format
  const yTicks = _niceTicks(yLo, yHi, 4)
  const yGrid  = yTicks.map(p => {
    const y = yS(p).toFixed(1)
    return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>` +
           `<text x="${PL - 3}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.38)">${_fmtPace(p)}</text>`
  }).join('')

  const xLbls = _kmLabels(maxDist, xS)

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">
      ${yGrid}
      ${xLbls}
      <line x1="${PL}" y1="${PT + CH}" x2="${W - PR}" y2="${PT + CH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <path d="${area}" fill="#f97316" opacity="0.16"/>
      <path d="${line}" fill="none" stroke="#f97316" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${PL}" y1="${avgY}" x2="${W - PR}" y2="${avgY}" stroke="#f97316" stroke-width="1" stroke-dasharray="4 3" opacity="0.60"/>
      <text x="${W - PR + 2}" y="${(+avgY + 4).toFixed(1)}" font-size="9" fill="#f97316">${_fmtPace(avgPace)}</text>
    </svg>
    <p style="font-size:11px;color:var(--text-muted);text-align:center;margin:3px 0 0;">Avg ${_fmtPace(avgPace)} /km · x-axis = km</p>`
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _downsample(arr, target) {
  if (arr.length <= target) return arr
  return Array.from({ length: target }, (_, i) => arr[Math.floor(i * arr.length / target)])
}

function _zip(a, b) {
  const len = Math.min(a.length, b.length)
  return Array.from({ length: len }, (_, i) => [a[i], b[i]])
}

function _fmtPace(minPerKm) {
  const abs = Math.abs(minPerKm)
  const m   = Math.floor(abs)
  const s   = Math.round((abs - m) * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Returns "nice" evenly-spaced tick values within [lo, hi]
function _niceTicks(lo, hi, n) {
  const range = hi - lo
  if (range <= 0) return []
  const rawStep = range / n
  const mag     = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step    = [1, 2, 2.5, 5, 10]
    .map(f => f * mag)
    .reduce((best, s) => Math.abs(s - rawStep) < Math.abs(best - rawStep) ? s : best)
  const ticks = []
  const start = Math.ceil((lo + step * 0.001) / step) * step
  for (let t = start; t <= hi - step * 0.001; t += step) {
    ticks.push(Math.round(t / step) * step)  // snap to avoid float drift
  }
  return ticks
}

// Km tick labels along x-axis
function _kmLabels(maxDist, xS) {
  const totalKm = maxDist / 1000
  const step    = totalKm > 18 ? 5 : totalKm > 8 ? 2 : 1
  return Array.from({ length: Math.floor(totalKm / step) }, (_, i) => {
    const km = (i + 1) * step
    if (km >= totalKm - step * 0.3) return ''
    return `<text x="${xS(km * 1000).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.38)">${km}</text>`
  }).join('')
}
