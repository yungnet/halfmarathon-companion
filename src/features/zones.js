// HR Zones — setup, zone table, and training balance

import { ZONE_META, getSavedZoneConfig, calcZones, zoneIndexForHR } from '../lib/zones.js'

const STORE_KEY = 'hm_zones'
const ACTS_KEY  = 'hm_strava_activities'

export function initZones(root) {
  _render(root)
}

function _render(root) {
  const config = getSavedZoneConfig()
  const zones  = calcZones(config)
  const acts   = JSON.parse(localStorage.getItem(ACTS_KEY) || 'null')

  root.innerHTML = `
    ${_setupHTML(config)}
    ${zones ? _zonesTableHTML(zones) : _emptyStateHTML()}
    ${zones && acts ? _balanceHTML(acts, zones) : ''}
    <div style="height:16px;"></div>
  `

  // ── Method toggle ──
  root.querySelector('#z-method').addEventListener('change', e => {
    const v = e.target.value
    root.querySelector('#karvonen-wrap').hidden = v !== 'karvonen'
    root.querySelector('#maxhr-wrap').hidden    = v !== 'maxhr'
    root.querySelector('#lthr-wrap').hidden     = v !== 'lthr'
    root.querySelector('#age-wrap').hidden      = v !== 'age'
  })

  // ── Save ──
  root.querySelector('#z-save').addEventListener('click', () => {
    const method = root.querySelector('#z-method').value
    const data   = { method }

    if (method === 'karvonen') {
      const maxHR = parseInt(root.querySelector('#z-maxhr').value)
      const rhr   = parseInt(root.querySelector('#z-rhr').value)
      if (!maxHR || maxHR < 120 || maxHR > 250) { alert('Enter a valid max HR (120–250 bpm)'); return }
      if (!rhr   || rhr   < 30  || rhr   > 120) { alert('Enter a valid resting HR (30–120 bpm)'); return }
      if (rhr >= maxHR) { alert('Resting HR must be lower than max HR'); return }
      data.maxHR = maxHR
      data.rhr   = rhr
    } else if (method === 'maxhr') {
      const v = parseInt(root.querySelector('#z-maxhr-only').value)
      if (!v || v < 120 || v > 250) { alert('Enter a valid max HR (120–250 bpm)'); return }
      data.maxHR = v
    } else if (method === 'lthr') {
      const v = parseInt(root.querySelector('#z-lthr').value)
      if (!v || v < 100 || v > 220) { alert('Enter a valid LTHR (100–220 bpm)'); return }
      data.lthr = v
    } else {
      const v = parseInt(root.querySelector('#z-age').value)
      if (!v || v < 15 || v > 90) { alert('Enter a valid age'); return }
      data.age   = v
      data.maxHR = 220 - v
    }

    localStorage.setItem(STORE_KEY, JSON.stringify(data))
    _render(root)
  })
}

// ── Setup card ────────────────────────────────────────────────────────────────

function _setupHTML(config) {
  const m = config?.method || 'karvonen'
  return `
    <p class="section-header">Zone Setup</p>
    <div class="card">
      <div class="card-body">
        <div class="form-group">
          <label>Calculation method</label>
          <select id="z-method">
            <option value="karvonen" ${m === 'karvonen' ? 'selected' : ''}>Karvonen / HR Reserve (recommended)</option>
            <option value="maxhr"    ${m === 'maxhr'    ? 'selected' : ''}>Max HR % only</option>
            <option value="lthr"     ${m === 'lthr'     ? 'selected' : ''}>Lactate Threshold HR</option>
            <option value="age"      ${m === 'age'      ? 'selected' : ''}>Age estimate</option>
          </select>
        </div>

        <!-- Karvonen: needs max HR + resting HR -->
        <div id="karvonen-wrap" ${m !== 'karvonen' ? 'hidden' : ''}>
          <div class="row-2">
            <div class="form-group">
              <label>Max HR (bpm)</label>
              <input id="z-maxhr" type="number" min="120" max="250" inputmode="numeric"
                placeholder="185" value="${config?.maxHR || ''}" />
            </div>
            <div class="form-group">
              <label>Resting HR (bpm)</label>
              <input id="z-rhr" type="number" min="30" max="120" inputmode="numeric"
                placeholder="55" value="${config?.rhr || ''}" />
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:-8px;margin-bottom:14px;">
            Resting HR = check your pulse first thing in the morning before getting up, or check your Garmin/Apple Watch overnight avg. Zones shift up significantly vs. max HR % alone.
          </p>
        </div>

        <!-- Max HR only -->
        <div id="maxhr-wrap" class="form-group" ${m !== 'maxhr' ? 'hidden' : ''}>
          <label>Max heart rate (bpm)</label>
          <input id="z-maxhr-only" type="number" min="120" max="250" inputmode="numeric"
            placeholder="185" value="${config?.maxHR || ''}" />
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">Highest HR ever seen during an all-out sprint or race finish</p>
        </div>

        <!-- LTHR -->
        <div id="lthr-wrap" class="form-group" ${m !== 'lthr' ? 'hidden' : ''}>
          <label>Lactate threshold HR (bpm)</label>
          <input id="z-lthr" type="number" min="100" max="220" inputmode="numeric"
            placeholder="165" value="${config?.lthr || ''}" />
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">Avg HR during a flat-out 30-min time trial (or use Strava's Fitness &amp; Freshness estimate)</p>
        </div>

        <!-- Age -->
        <div id="age-wrap" class="form-group" ${m !== 'age' ? 'hidden' : ''}>
          <label>Age</label>
          <input id="z-age" type="number" min="15" max="90" inputmode="numeric"
            placeholder="35" value="${config?.age || ''}" />
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">Estimates max HR as 220 − age. Rough — may be off by ±15 bpm</p>
        </div>

        <button id="z-save" class="btn btn-primary btn-full">
          ${config ? 'Update Zones' : 'Calculate My Zones'}
        </button>
      </div>
    </div>`
}

// ── Zone table ────────────────────────────────────────────────────────────────

function _zonesTableHTML(zones) {
  return `
    <p class="section-header">Your HR Zones</p>

    <!-- Visual gradient bar -->
    <div style="margin:0 12px 4px;display:flex;height:14px;border-radius:7px;overflow:hidden;">
      ${zones.map(z => `<div style="flex:1;background:${z.color};"></div>`).join('')}
    </div>
    <div style="margin:0 12px 12px;display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);">
      <span>Z1</span><span>Z2</span><span>Z3</span><span>Z4</span><span>Z5</span>
    </div>

    <div class="card">
      <div class="card-body" style="padding:8px 14px;">
        ${zones.map((z, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i ? 'border-top:1px solid var(--bg-raised);' : ''}">
            <div style="width:34px;height:34px;border-radius:8px;background:${z.color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;">Z${z.zone}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:4px;">
                <span style="font-size:14px;font-weight:700;">${z.name}</span>
                <span style="font-size:13px;font-weight:700;color:${z.color};white-space:nowrap;">${z.min}${z.max < 999 ? '–' + z.max : '+'} bpm</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:1px;">${z.desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`
}

// ── Training balance ──────────────────────────────────────────────────────────

function _balanceHTML(acts, zones) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
  const recent = acts.filter(a =>
    (a.type === 'Run' || a.sport_type === 'Run') &&
    a.average_heartrate &&
    new Date(a.start_date_local).getTime() > cutoff
  )

  if (!recent.length) return `
    <p class="section-header">Training Balance</p>
    <div class="card">
      <div class="card-body">
        <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">
          No runs with heart rate data in the last 90 days.<br>
          Connect a heart rate monitor during training to see your zone breakdown here.
        </p>
      </div>
    </div>`

  const counts = zones.map(() => 0)
  const kms    = zones.map(() => 0)

  recent.forEach(a => {
    const idx = zoneIndexForHR(a.average_heartrate, zones)
    if (idx !== null) { counts[idx]++; kms[idx] += a.distance / 1000 }
  })

  const total    = counts.reduce((s, n) => s + n, 0)
  const easyPct  = Math.round((counts[0] + counts[1]) / total * 100)
  const hardPct  = Math.round((counts[3] + counts[4]) / total * 100)
  const midPct   = 100 - easyPct - hardPct

  const tip = easyPct < 65
    ? { icon: '⚠️', color: 'var(--warning)', text: `Only ${easyPct}% easy running (Z1–Z2). Most runners run too hard too often. The 80/20 rule says ~80% should be easy — your aerobic base will thank you.` }
    : hardPct === 0 && midPct < 10
    ? { icon: '💡', color: '#60a5fa',         text: `All easy running — great for base building. Consider adding one tempo (Z3) or interval (Z4–Z5) session per week to build race-day speed.` }
    : { icon: '✅', color: 'var(--success)',  text: `Solid balance — ${easyPct}% easy, ${midPct}% moderate, ${hardPct}% hard. You're close to the 80/20 ideal.` }

  return `
    <p class="section-header">Training Balance · last 90 days · ${recent.length} runs</p>
    <div class="card">
      <div class="card-body">

        <!-- Stacked bar -->
        <div style="display:flex;height:18px;border-radius:9px;overflow:hidden;margin-bottom:14px;gap:1px;">
          ${zones.map((z, i) => {
            const pct = total ? (counts[i] / total * 100) : 0
            return pct > 0 ? `<div style="width:${pct}%;background:${z.color};"></div>` : ''
          }).join('')}
        </div>

        <!-- Legend -->
        ${zones.map((z, i) => {
          if (!counts[i]) return ''
          const pct = Math.round(counts[i] / total * 100)
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="width:10px;height:10px;border-radius:2px;background:${z.color};flex-shrink:0;"></div>
              <span style="font-size:13px;flex:1;">Z${z.zone} ${z.name}</span>
              <span style="font-size:12px;color:var(--text-muted);">${counts[i]} runs · ${kms[i].toFixed(0)} km · ${pct}%</span>
            </div>`
        }).join('')}

        <!-- Tip -->
        <div style="margin-top:12px;padding:10px 12px;background:var(--bg-raised);border-radius:8px;font-size:13px;line-height:1.5;border-left:3px solid ${tip.color};">
          ${tip.icon} ${tip.text}
        </div>
      </div>
    </div>`
}

function _emptyStateHTML() {
  return `
    <div class="empty-state">
      <div class="empty-icon">❤️</div>
      <p>Enter your max HR, LTHR, or age above<br>to calculate your personal training zones.</p>
    </div>`
}
