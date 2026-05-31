// Race Day Fuel Calculator · Am I Ready? · Race Morning Timeline

const STORE_KEY = 'hm_fuel_prefs'
const ACTS_KEY  = 'hm_strava_activities'
const PRS_KEY   = 'hm_prs'

// ── Road to Race Day constants ────────────────────────────────────────────────
const TAPER_WEEK3_DAYS_MAX = 28
const TAPER_WEEK2_DAYS_MAX = 21
const RACE_WEEK_DAYS_MAX   = 14
const RACE_IMMINENT_DAYS   = 7
const TAPER_WEEK3_PCT      = 0.80
const TAPER_WEEK2_PCT      = 0.60
const RACE_WEEK_PCT        = 0.40
const PEAK_LONG_RUN_RATIO  = 0.85

export function initFuel(root) {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')

  root.innerHTML = `
    <div id="ami-root"></div>
    <div id="road-root"></div>

    <p class="section-header">Race Day Fuel</p>
    <div class="card">
      <div class="card-body">
        <div class="row-2">
          <div class="form-group">
            <label>Weight (lbs)</label>
            <input id="f-weight" type="number" min="80" max="350" placeholder="155"
              inputmode="decimal" value="${saved.weight || ''}" />
          </div>
          <div class="form-group">
            <label>Goal pace (mm:ss /km)</label>
            <input id="f-pace" type="text" placeholder="7:30"
              inputmode="numeric" pattern="[0-9]+:[0-5][0-9]"
              value="${saved.pace || ''}" style="font-variant-numeric:tabular-nums;letter-spacing:0.5px;" />
          </div>
        </div>

        <div class="form-group">
          <label>Race distance (km)</label>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button class="dist-preset btn btn-secondary btn-sm" data-km="5">5K</button>
            <button class="dist-preset btn btn-secondary btn-sm" data-km="10">10K</button>
            <button class="dist-preset btn btn-secondary btn-sm" data-km="21.1">Half</button>
            <button class="dist-preset btn btn-secondary btn-sm" data-km="42.2">Full</button>
          </div>
          <input id="f-distance" type="number" min="1" max="250" step="0.1"
            placeholder="21.1" inputmode="decimal" value="${saved.distance || ''}" />
        </div>

        <div class="row-2">
          <div class="form-group">
            <label>Race date</label>
            <input id="f-date" type="date" value="${saved.raceDate || ''}" />
          </div>
          <div class="form-group">
            <label>Start time</label>
            <input id="f-start" type="time" value="${saved.startTime || '08:00'}" />
          </div>
        </div>

        <div class="row-2">
          <div class="form-group">
            <label>Temp (°C)</label>
            <input id="f-temp" type="number" min="-30" max="50" placeholder="18"
              inputmode="decimal" value="${saved.temp || ''}" />
          </div>
          <div class="form-group">
            <label>Travel to venue (min)</label>
            <input id="f-travel" type="number" min="5" max="180" placeholder="60"
              inputmode="numeric" value="${saved.travelMin || ''}" />
          </div>
        </div>

        <div class="form-group">
          <label>Experience level</label>
          <select id="f-level">
            <option value="beginner"     ${saved.level === 'beginner'                       ? 'selected' : ''}>Beginner (first race)</option>
            <option value="intermediate" ${saved.level === 'intermediate' || !saved.level   ? 'selected' : ''}>Intermediate</option>
            <option value="experienced"  ${saved.level === 'experienced'                    ? 'selected' : ''}>Experienced</option>
          </select>
        </div>

        <button id="calc-btn" class="btn btn-primary btn-full">Calculate Strategy</button>
      </div>
    </div>

    <div id="fuel-results"></div>
    <div style="height:16px;"></div>
  `

  // Render Am I Ready immediately with saved distance
  _renderAmIReady(root.querySelector('#ami-root'), saved.distance || 21.1)
  _renderRoadToRaceDay(root.querySelector('#road-root'), saved.raceDate, saved.distance || 21.1)

  // Distance preset buttons
  root.querySelectorAll('.dist-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelector('#f-distance').value = btn.dataset.km
    })
  })

  // Pace field: auto-insert colon after two digits
  root.querySelector('#f-pace').addEventListener('input', e => {
    let v = e.target.value.replace(/[^0-9:]/g, '')
    if (v.length === 2 && !v.includes(':') && e.inputType !== 'deleteContentBackward') v = v + ':'
    e.target.value = v
  })

  root.querySelector('#calc-btn').addEventListener('click', () => {
    const weight    = parseFloat(root.querySelector('#f-weight').value)
    const paceStr   = root.querySelector('#f-pace').value.trim()
    const paceMin   = _parsePace(paceStr)
    const distance  = parseFloat(root.querySelector('#f-distance').value) || 21.1
    const date      = root.querySelector('#f-date').value
    const startTime = root.querySelector('#f-start').value   // "HH:MM"
    const temp      = parseFloat(root.querySelector('#f-temp').value)
    const travelMin = parseInt(root.querySelector('#f-travel').value) || 60
    const level     = root.querySelector('#f-level').value

    if (!weight)  { root.querySelector('#f-weight').focus(); alert('Please enter your weight.'); return }
    if (!paceMin) { root.querySelector('#f-pace').focus();   alert('Enter pace as MM:SS (e.g. 7:30 for 7 min 30 sec per km).'); return }

    localStorage.setItem(STORE_KEY, JSON.stringify({ weight, pace: paceStr, distance, raceDate: date, startTime, temp, travelMin, level }))

    _renderAmIReady(root.querySelector('#ami-root'), distance)
    _renderRoadToRaceDay(root.querySelector('#road-root'), date, distance)
    _renderResults(root, { weight, paceMin, distance, date, startTime, temp, travelMin, level })
  })

  // Auto-calculate if saved prefs exist
  if (saved.weight && saved.pace) {
    const paceMin = _parsePace(saved.pace)
    if (paceMin) _renderResults(root, {
      weight: saved.weight, paceMin,
      distance:  saved.distance  || 21.1,
      date:      saved.raceDate,
      startTime: saved.startTime,
      temp:      saved.temp,
      travelMin: saved.travelMin || 60,
      level:     saved.level     || 'intermediate',
    })
  }
}

// ── Am I Ready? ────────────────────────────────────────────────────────────────

function _renderAmIReady(el, targetKm) {
  const raw = localStorage.getItem(ACTS_KEY)
  if (!raw) {
    el.innerHTML = `
      <p class="section-header">Am I Ready?</p>
      <div class="card" style="margin-bottom:0;">
        <div class="card-body" style="text-align:center;padding:24px 16px;">
          <div style="font-size:36px;margin-bottom:8px;">🔗</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;">Connect Strava to see your readiness</div>
          <div style="font-size:13px;color:var(--text-muted);">Head to the Routes tab first to pull in your training data.</div>
        </div>
      </div>`
    return
  }

  const km  = parseFloat(targetKm) || 21.1
  const now = Date.now()
  const W8  = 56 * 86400000
  const W4  = 28 * 86400000

  const allRuns  = JSON.parse(raw).filter(a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 500)
  const r8w      = allRuns.filter(a => now - new Date(a.start_date_local).getTime() < W8)
  const r4w      = allRuns.filter(a => now - new Date(a.start_date_local).getTime() < W4)

  const longestKm = r8w.length ? Math.max(...r8w.map(a => a.distance)) / 1000 : 0
  const weeklyKm  = r4w.reduce((s, a) => s + a.distance / 1000, 0) / 4
  const sorted    = [...r8w].sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))
  const daysSince = sorted.length ? Math.floor((now - new Date(sorted[0].start_date_local).getTime()) / 86400000) : 999

  // Thresholds scaled to race distance
  const longNeed = km * 0.78, longGood = km * 0.90
  const wkNeed   = km * 1.7,  wkGood  = km * 2.4

  const checks = [
    {
      label:  'Longest run (8 wks)',
      value:  longestKm > 0 ? `${longestKm.toFixed(1)} km` : '—',
      status: longestKm >= longGood ? 'good' : longestKm >= longNeed ? 'ok' : 'low',
      tip:    longestKm >= longGood
        ? `Strong long-run base — ${longestKm.toFixed(0)} km is well within reach of your ${km} km race.`
        : longestKm >= longNeed
        ? `Getting there. A ${Math.ceil(longGood)} km long run before race day would give you more confidence.`
        : `Your longest recent run is ${longestKm.toFixed(1)} km. Build up to at least ${Math.ceil(longNeed)} km before racing ${km} km.`,
    },
    {
      label:  'Weekly avg (4 wks)',
      value:  weeklyKm > 0 ? `${weeklyKm.toFixed(0)} km/wk` : '—',
      status: weeklyKm >= wkGood ? 'good' : weeklyKm >= wkNeed ? 'ok' : 'low',
      tip:    weeklyKm >= wkGood
        ? 'Strong weekly volume — your aerobic base is solid.'
        : weeklyKm >= wkNeed
        ? 'Decent volume. Consistent mileage over the next weeks matters most.'
        : 'Low weekly mileage for this distance. Increase gradually (no more than +10%/week).',
    },
    {
      label:  'Last run',
      value:  daysSince < 999 ? (daysSince === 0 ? 'Today' : `${daysSince}d ago`) : '—',
      status: daysSince <= 7 ? 'good' : daysSince <= 14 ? 'ok' : 'low',
      tip:    daysSince <= 7  ? 'You\'re actively training — great habit.'
            : daysSince <= 14 ? 'Slightly quiet recently. Keep the legs moving with easy runs.'
            :                   'It\'s been a while. A few easy runs before race day will help shake off the rust.',
    },
    {
      label:  'Runs (8 wks)',
      value:  `${r8w.length}`,
      status: r8w.length >= 16 ? 'good' : r8w.length >= 8 ? 'ok' : 'low',
      tip:    r8w.length >= 16 ? 'Running consistently — frequency is the foundation of endurance fitness.'
            : r8w.length >= 8  ? 'Moderate frequency. Aim for 3–4 runs per week leading up to race day.'
            :                    'Low run count. Short easy runs 3–4× per week build more fitness than occasional long ones.',
    },
  ]

  const goodCount  = checks.filter(c => c.status === 'good').length
  const lowCount   = checks.filter(c => c.status === 'low').length
  const longRunLow = checks[0].status === 'low'

  let verdict, vIcon, vColor
  if (!r8w.length)               { verdict = 'No training data found';   vIcon = '❓'; vColor = '#64748b' }
  else if (longRunLow || lowCount >= 3) { verdict = 'Keep building your base';  vIcon = '🔨'; vColor = '#ef4444' }
  else if (goodCount >= 3)       { verdict = 'Ready to race!';            vIcon = '✅'; vColor = '#22c55e' }
  else if (goodCount >= 2)       { verdict = 'Almost race-ready';         vIcon = '⚡'; vColor = '#f59e0b' }
  else                           { verdict = 'Getting there';             vIcon = '📈'; vColor = '#60a5fa' }

  // Riegel time prediction from PR tab
  const prs    = JSON.parse(localStorage.getItem(PRS_KEY) || '[]')
  const ref10k = prs.find(p => p.distanceKm === 10)
  const ref5k  = prs.find(p => p.distanceKm === 5)
  let pred = null
  if      (ref10k && km > 10) pred = { secs: Math.round(ref10k.totalSeconds * Math.pow(km / 10, 1.06)), src: '10K PR' }
  else if (ref5k  && km > 5)  pred = { secs: Math.round(ref5k.totalSeconds  * Math.pow(km / 5,  1.06)), src: '5K PR'  }

  const SC = { good: '#22c55e', ok: '#f59e0b', low: '#ef4444' }
  const SI = { good: '✅', ok: '⚠️', low: '❌' }
  const tip = (checks.find(c => c.status === 'low') || checks.find(c => c.status === 'ok') || checks[0]).tip

  el.innerHTML = `
    <p class="section-header">Am I Ready? · ${km} km</p>
    <div class="card" style="margin-bottom:0;">
      <div class="card-body">

        <!-- Verdict banner -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-raised);border-radius:10px;margin-bottom:14px;border-left:4px solid ${vColor};">
          <div style="font-size:26px;line-height:1;">${vIcon}</div>
          <div>
            <div style="font-size:15px;font-weight:800;color:${vColor};">${verdict}</div>
            <div style="font-size:12px;color:var(--text-muted);">Last 8 weeks · ${r8w.length} run${r8w.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <!-- 2×2 metrics -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          ${checks.map(c => `
            <div style="background:var(--bg-raised);border-radius:8px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:4px;">${c.label}</div>
              <div style="font-size:17px;font-weight:800;color:${SC[c.status]};">${c.value}</div>
              <div style="font-size:11px;margin-top:2px;">${SI[c.status]}</div>
            </div>`).join('')}
        </div>

        <!-- Predicted finish time -->
        ${pred ? `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-raised);border-radius:8px;margin-bottom:12px;">
          <div style="font-size:18px;">🎯</div>
          <div style="flex:1;">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">Predicted finish · Riegel formula from ${pred.src}</div>
            <div style="font-size:18px;font-weight:800;color:var(--accent);">${_fmtSeconds(pred.secs)}</div>
            <div style="font-size:11px;color:var(--text-muted);">Realistic range: ${_fmtSeconds(Math.round(pred.secs * 0.95))} – ${_fmtSeconds(Math.round(pred.secs * 1.05))}</div>
          </div>
        </div>` : ''}

        <!-- Top tip -->
        <div style="padding:10px 12px;background:var(--bg-raised);border-radius:8px;font-size:13px;line-height:1.5;color:var(--text-muted);">
          💡 ${tip}
        </div>
      </div>
    </div>`
}

// ── Road to Race Day ──────────────────────────────────────────────────────────

function _renderRoadToRaceDay(el, raceDate, distanceKm) {
  const km = parseFloat(distanceKm) || 21.1

  if (!raceDate) {
    el.innerHTML = `
      <p class="section-header">Road to Race Day</p>
      <div class="card" style="margin-bottom:0;">
        <div class="card-body" style="text-align:center;padding:20px 16px;">
          <div style="font-size:13px;color:var(--text-muted);">Enter your race date above to see your training road map.</div>
        </div>
      </div>`
    return
  }

  // ── Date maths ─────────────────────────────────────────────────────────────
  const raceDateMs = new Date(raceDate + 'T00:00:00').getTime()
  const todayD     = new Date(); todayD.setHours(0, 0, 0, 0)
  const todayMs    = todayD.getTime()
  const daysOut    = Math.ceil((raceDateMs - todayMs) / 86400000)

  if (daysOut <= 0) {
    el.innerHTML = `
      <p class="section-header">Road to Race Day</p>
      <div class="card" style="margin-bottom:0;">
        <div class="card-body" style="text-align:center;padding:24px 16px;">
          <div style="font-size:28px;margin-bottom:8px;">🏁</div>
          <div style="font-size:15px;font-weight:700;color:var(--accent);">${daysOut === 0 ? 'Race day — go get it!' : 'Race complete — well done!'}</div>
        </div>
      </div>`
    return
  }

  // ── Strava data ─────────────────────────────────────────────────────────────
  const raw     = localStorage.getItem(ACTS_KEY)
  const allRuns = raw
    ? JSON.parse(raw).filter(a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 500)
    : []
  const now = Date.now()
  const W8  = 56 * 86400000
  const r8w = allRuns.filter(a => now - new Date(a.start_date_local).getTime() < W8)

  // Week buckets for peak week km
  const weekBuckets = new Map()
  r8w.forEach(a => {
    const ws = _roadWeekStart(new Date(a.start_date_local))
    const b  = weekBuckets.get(ws) || { km: 0 }
    b.km    += a.distance / 1000
    weekBuckets.set(ws, b)
  })
  const peakWeekKm = weekBuckets.size
    ? Math.max(...[...weekBuckets.values()].map(b => b.km))
    : 0
  const longestKm = r8w.length ? Math.max(...r8w.map(a => a.distance / 1000)) : 0

  // Current week km
  const dayOfWeek     = todayD.getDay()              // 0 Sun … 6 Sat
  const daysSinceMon  = (dayOfWeek + 6) % 7          // Mon=0 … Sun=6
  const thisWeekMonMs = todayMs - daysSinceMon * 86400000
  const currWeekKm    = weekBuckets.get(thisWeekMonMs)?.km ?? 0

  // ── Phase detection ─────────────────────────────────────────────────────────
  let phase, phaseLabel, taperPct = 0, taperTarget = 0
  if (daysOut <= RACE_IMMINENT_DAYS) {
    phase      = 'imminent'
    phaseLabel = `🏁 Race in ${daysOut} day${daysOut !== 1 ? 's' : ''} — trust your training!`
  } else if (daysOut <= RACE_WEEK_DAYS_MAX) {
    phase = 'raceweek'; taperPct = RACE_WEEK_PCT
    phaseLabel  = `Race week — ${daysOut} days to go`
    taperTarget = peakWeekKm * taperPct
  } else if (daysOut <= TAPER_WEEK2_DAYS_MAX) {
    phase = 'taper2'; taperPct = TAPER_WEEK2_PCT
    phaseLabel  = `Taper week 2 — ${daysOut} days to go`
    taperTarget = peakWeekKm * taperPct
  } else if (daysOut <= TAPER_WEEK3_DAYS_MAX) {
    phase = 'taper3'; taperPct = TAPER_WEEK3_PCT
    phaseLabel  = `Taper week 3 — ${daysOut} days to go`
    taperTarget = peakWeekKm * taperPct
  } else {
    const weeksOut = Math.ceil(daysOut / 7)
    phase      = 'build'
    phaseLabel = `Build phase — ${weeksOut} week${weeksOut !== 1 ? 's' : ''} to race`
  }
  const inTaper = ['taper3', 'taper2', 'raceweek'].includes(phase)

  // ── Long run progression ────────────────────────────────────────────────────
  const targetPeak   = km * PEAK_LONG_RUN_RATIO   // e.g. 21.1 × 0.85 ≈ 17.9 km
  const taperStartMs = raceDateMs - 21 * 86400000  // 3 weeks before race
  const daysToTaper  = Math.ceil((taperStartMs - todayMs) / 86400000)
  const weeksToTaper = Math.max(0, Math.ceil(daysToTaper / 7))

  let progressIcon, progressMsg, progressStatus, weeklyIncrement = 0

  if (!raw) {
    progressIcon = '🔗'; progressStatus = 'nodata'
    progressMsg  = 'Connect Strava in the Runs tab to see your long run plan'
  } else if (longestKm >= targetPeak) {
    progressIcon = '✅'; progressStatus = 'solid'
    progressMsg  = `Long run base is solid (${longestKm.toFixed(1)} km) — protect it through taper`
  } else if (weeksToTaper <= 0) {
    progressIcon = '🔄'; progressStatus = 'tapering'
    progressMsg  = longestKm > 0
      ? `In taper now — ${longestKm.toFixed(1)} km was your peak long run`
      : 'In taper now — no recent long run data found'
  } else {
    weeklyIncrement = (targetPeak - longestKm) / weeksToTaper
    if (weeklyIncrement <= 1.5) {
      progressIcon = '✅'; progressStatus = 'comfortable'
      progressMsg  = `You have time to build comfortably (+${weeklyIncrement.toFixed(2)} km/week)`
    } else if (weeklyIncrement <= 2.5) {
      progressIcon = '⚠️'; progressStatus = 'tight'
      progressMsg  = `Tight but doable — prioritise your long runs (+${weeklyIncrement.toFixed(2)} km/week)`
    } else {
      progressIcon = '❌'; progressStatus = 'aggressive'
      progressMsg  = `Very aggressive build needed (+${weeklyIncrement.toFixed(1)} km/week) — consider adjusting your goal or race`
    }
  }

  const showTable = ['comfortable', 'tight'].includes(progressStatus) && weeksToTaper > 0

  // ── Build week-by-week table rows ───────────────────────────────────────────
  const tableRows = []
  if (showTable) {
    const daysUntilSun = dayOfWeek === 0 ? 0 : 7 - dayOfWeek   // 0 if today is Sun
    for (let w = 1; w <= weeksToTaper; w++) {
      const sunMs  = todayMs + (daysUntilSun + (w - 1) * 7) * 86400000
      const target = Math.min(longestKm + weeklyIncrement * w, targetPeak)
      tableRows.push({ label: `Week ${w}`, date: _fmtDateShort(new Date(sunMs)), target, type: 'build' })
    }
    // 3 taper rows computed back from race date
    tableRows.push({ label: '🔄 Taper W3', date: _fmtDateShort(new Date(raceDateMs - 14 * 86400000)), target: targetPeak * TAPER_WEEK3_PCT, type: 'taper' })
    tableRows.push({ label: '🔄 Taper W2', date: _fmtDateShort(new Date(raceDateMs - 7  * 86400000)), target: targetPeak * TAPER_WEEK2_PCT, type: 'taper' })
    tableRows.push({ label: '🏁 Race Day',  date: _fmtDateShort(new Date(raceDateMs)),                 target: km,                          type: 'race'  })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  el.innerHTML = `
    <p class="section-header">Road to Race Day</p>
    <div class="card" style="margin-bottom:0;">
      <div class="card-body">

        <!-- Phase badge -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-raised);border-radius:10px;margin-bottom:14px;">
          <div style="font-size:20px;">📅</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;">${phaseLabel}</div>
            ${peakWeekKm > 0 ? `<div style="font-size:12px;color:var(--text-muted);">Peak week: ${peakWeekKm.toFixed(0)} km</div>` : ''}
          </div>
        </div>

        ${inTaper && peakWeekKm > 0 ? `
        <!-- Taper volume tracker -->
        <div style="margin-bottom:14px;padding:12px 14px;background:var(--bg-raised);border-radius:10px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px;">This week's volume</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
            <div style="font-size:22px;font-weight:800;color:${currWeekKm > taperTarget ? '#ef4444' : 'var(--accent)'};">${currWeekKm.toFixed(1)} km</div>
            <div style="font-size:12px;color:var(--text-muted);">target ≤ ${taperTarget.toFixed(0)} km&nbsp;(${Math.round(taperPct * 100)}% of peak)</div>
          </div>
          <div style="height:6px;background:var(--bg-card);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${(Math.min(100, taperTarget > 0 ? currWeekKm / taperTarget * 100 : 0)).toFixed(1)}%;background:${currWeekKm > taperTarget ? '#ef4444' : 'var(--accent)'};border-radius:3px;transition:width 0.3s;"></div>
          </div>
          ${currWeekKm > taperTarget ? `<div style="margin-top:6px;font-size:12px;color:#ef4444;">⚠️ Over taper target — keep remaining days easy</div>` : ''}
        </div>` : ''}

        <!-- Long run progression -->
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px;">Long Run Progression · target ${targetPeak.toFixed(0)} km</div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--bg-raised);border-radius:8px;${showTable ? 'margin-bottom:8px;' : ''}">
            <div style="font-size:15px;flex-shrink:0;margin-top:1px;">${progressIcon}</div>
            <div style="font-size:13px;line-height:1.5;">${progressMsg}</div>
          </div>
          ${showTable ? `
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);padding:0 2px 8px;">
            <span>Current: <strong style="color:var(--text);">${longestKm.toFixed(1)} km</strong></span>
            <span>${weeksToTaper} week${weeksToTaper !== 1 ? 's' : ''} to build</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:5px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--bg-raised);">Week</th>
                  <th style="text-align:left;padding:5px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--bg-raised);">Date</th>
                  <th style="text-align:right;padding:5px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--bg-raised);">Target Long Run</th>
                  <th style="text-align:right;padding:5px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--bg-raised);">Actual</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows.map((r, i) => {
                  const isTaper = r.type === 'taper'
                  const isRace  = r.type === 'race'
                  return `<tr style="border-top:${i > 0 ? '1px solid #ffffff08' : 'none'};${isTaper ? 'opacity:0.75;' : ''}">
                    <td style="padding:7px 4px;font-weight:${isRace ? '800' : isTaper ? '500' : '600'};color:${isRace ? 'var(--accent)' : isTaper ? 'var(--text-muted)' : 'var(--text)'};">${r.label}</td>
                    <td style="padding:7px 4px;font-size:12px;color:${isRace ? 'var(--accent)' : 'var(--text-muted)'};">${r.date}</td>
                    <td style="text-align:right;padding:7px 4px;font-weight:${isRace ? '800' : '500'};color:${isRace ? 'var(--accent)' : isTaper ? 'var(--text-muted)' : 'var(--text)'};">${r.target.toFixed(1)} km</td>
                    <td style="text-align:right;padding:7px 4px;color:var(--text-muted);font-size:12px;"></td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
        </div>

      </div>
    </div>`
}

function _roadWeekStart(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.getTime()
}

function _fmtDateShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Race Weekend Timeline ─────────────────────────────────────────────────────

function _renderTimeline(startTime, travelMin, distanceKm) {
  const [sh, sm]   = startTime.split(':').map(Number)
  const startTotal = sh * 60 + sm   // minutes since midnight
  const travel     = parseInt(travelMin) || 60
  const wakeOff    = distanceKm >= 30 ? -240 : distanceKm >= 15 ? -210 : -150

  function fmtTime(off) {
    const t = ((startTotal + off) % 1440 + 1440) % 1440
    const h = Math.floor(t / 60) % 24
    const m = t % 60
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  // Night-before events — times calculated relative to wake time so they
  // automatically adjust for any race start time
  const nightEvents = [
    { off: wakeOff - 10*60, icon: '🍝', label: 'Dinner (night before)',
      desc: 'Familiar carb-heavy meal — pasta, rice, or potato. Moderate portions; don\'t stuff yourself. Avoid high-fibre veg, spicy food, or anything you haven\'t eaten before a long run.' },
    { off: wakeOff - 9*60,  icon: '👟', label: 'Gear check',
      desc: 'Lay out everything: bib + safety pins, race belt, shoes, socks, watch (charged), gels counted, throwaway layers. Pre-set coffee maker. Nothing left to find at 4 AM.' },
    { off: wakeOff - 510,   icon: '💧', label: 'Final hydration',
      desc: 'Sip 400–500 mL water. Urine should be pale yellow. Don\'t overdrink — stop well before bed to avoid bathroom wake-ups disrupting sleep.' },
    { off: wakeOff - 8*60,  icon: '😴', label: 'Lights out',
      desc: 'Aim for 7–8 hrs. Pre-race nerves are completely normal — even lying down quietly counts as recovery. Put your phone on Do Not Disturb; double-check alarms are set.' },
  ]

  const morningEvents = [
    { off: wakeOff,        icon: '⏰', label: 'Wake up',               desc: 'Set two alarms — not the morning to oversleep.' },
    { off: wakeOff + 30,   icon: '🍳', label: 'Breakfast',             desc: 'Familiar carb-heavy meal: oatmeal, bagel, or banana. Coffee if that\'s your normal routine — don\'t experiment today. Zero new foods.' },
    { off: -(travel + 45), icon: '🚗', label: 'Leave home',            desc: 'Build in buffer for traffic, parking, and transit surprises.' },
    { off: -45,            icon: '🏟️', label: 'Arrive at venue',       desc: 'Pick up bib if needed. Locate bag drop and your start corral before anything else.' },
    { off: -35,            icon: '🚻', label: 'Bathroom stop',          desc: 'Do this before warming up — race port-a-potty lineups get very long.' },
    { off: -22,            icon: '🏃', label: 'Warm up',               desc: '8–10 min easy jog + a few short strides. Gets the legs firing and shakes off stiffness before the gun.' },
    { off: -12,            icon: '🍯', label: 'Pre-race gel',          desc: distanceKm >= 15 ? 'Caffeine gel if that\'s your routine. Chase with 200 mL water — never dry.' : 'Optional for shorter races — skip it if you haven\'t practised with gels in training.' },
    { off: -6,             icon: '📍', label: 'Into your start corral', desc: 'Find your pace group. Trust your training. Relax, breathe, smile.' },
    { off: 0,              icon: '🏁', label: 'Race start!',            desc: '', highlight: true },
  ]

  const avoids = [
    { icon: '🍺', text: 'Alcohol — even one drink disrupts sleep quality and hydration for 24 hours' },
    { icon: '🌶️', text: 'New or spicy foods — save restaurant experiments for the post-race meal' },
    { icon: '🏃', text: 'Hard training runs — taper shakeout is 20–30 min easy max, the day before' },
    { icon: '👟', text: 'New shoes or gear — race in exactly what you trained in, nothing untested' },
    { icon: '📺', text: 'Staying up late — the night two days before matters as much as race night' },
    { icon: '💊', text: 'NSAIDs before or during the race (ibuprofen/naproxen) — serious kidney risk at race effort' },
  ]

  function renderEvent(ev, i, arr) {
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;${i < arr.length - 1 ? 'border-bottom:1px solid var(--bg-raised);' : ''}">
        <div style="min-width:70px;text-align:right;flex-shrink:0;padding-top:1px;">
          <span style="font-size:${ev.highlight ? 14 : 12}px;font-weight:700;color:${ev.highlight ? 'var(--accent)' : 'var(--text)'};">${fmtTime(ev.off)}</span>
        </div>
        <div style="font-size:${ev.highlight ? 18 : 15}px;flex-shrink:0;margin-top:-1px;">${ev.icon}</div>
        <div style="flex:1;">
          <div style="font-size:${ev.highlight ? 14 : 13}px;font-weight:${ev.highlight ? 800 : 600};color:${ev.highlight ? 'var(--accent)' : 'var(--text)'};">${ev.label}</div>
          ${ev.desc ? `<div style="font-size:12px;color:var(--text-muted);margin-top:1px;line-height:1.4;">${ev.desc}</div>` : ''}
        </div>
      </div>`
  }

  return `
    <p class="section-header">Race Weekend Timeline</p>
    <div class="card">
      <div class="card-body" style="padding:6px 14px;">

        <!-- Night before -->
        <div style="padding:8px 0 4px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">🌙 Night Before</span>
          <div style="flex:1;height:1px;background:var(--bg-raised);"></div>
        </div>
        ${nightEvents.map((ev, i, arr) => renderEvent(ev, i, arr)).join('')}

        <!-- Race morning -->
        <div style="padding:12px 0 4px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">☀️ Race Morning</span>
          <div style="flex:1;height:1px;background:var(--bg-raised);"></div>
        </div>
        ${morningEvents.map((ev, i, arr) => renderEvent(ev, i, arr)).join('')}

      </div>
    </div>

    <!-- What NOT to do -->
    <div class="card" style="border:1px solid #7f1d1d44;margin-top:0;">
      <div class="card-body">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#ef4444;margin-bottom:10px;">❌ What NOT to do</div>
        ${avoids.map((a, i) => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;${i ? 'border-top:1px solid var(--bg-raised);' : ''}">
            <div style="font-size:15px;flex-shrink:0;">${a.icon}</div>
            <div style="font-size:13px;line-height:1.4;">${a.text}</div>
          </div>`).join('')}
      </div>
    </div>`
}

// ── Parse MM:SS → decimal minutes ────────────────────────────────────────────

function _parsePace(str) {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0], 10), s = parseInt(parts[1], 10)
  if (isNaN(m) || isNaN(s) || s >= 60 || m < 0) return null
  return m + s / 60
}

function _formatPaceDisplay(paceMin) {
  const m = Math.floor(paceMin)
  const s = Math.round((paceMin - m) * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Results ───────────────────────────────────────────────────────────────────

function _renderResults(root, { weight, paceMin, distance, date, startTime, temp, travelMin, level }) {
  const RACE_KM      = distance || 21.1
  const totalMinutes = paceMin * RACE_KM
  const totalHours   = totalMinutes / 60
  const daysOut      = date ? Math.ceil((new Date(date + 'T00:00:00') - new Date()) / 86400000) : null

  const weightKg   = weight * 0.453592
  const calPerMin  = (10.5 * weightKg * 3.5) / 200
  const totalCal   = Math.round(calPerMin * totalMinutes)

  const carbsPerHr = level === 'beginner' ? 30 : level === 'intermediate' ? 45 : 60
  const totalCarbs = Math.round(carbsPerHr * totalHours)
  const gelsNeeded = Math.ceil(totalCarbs / 25)

  const isHot  = temp != null && temp > 22
  const isCold = temp != null && temp < 7
  const totalMl = Math.round(350 * (isHot ? 1.3 : isCold ? 0.85 : 1.0) * totalHours)

  const gelInterval = level === 'beginner' ? 45 : 38
  const gelTimes = []
  let t = level === 'beginner' ? 40 : 35
  while (t < totalMinutes - 10 && gelTimes.length < gelsNeeded) { gelTimes.push(t); t += gelInterval }

  const minToKm = min => (min / paceMin).toFixed(1)

  const aidStations = []
  for (let km = 2.5; km < RACE_KM - 1; km += 2.5) aidStations.push(km.toFixed(1))

  const preRaceMeals = [
    { label: '2–3 hours before', detail: '200–300 kcal of easily digestible carbs (banana, toast, oatmeal)' },
    { label: '30–45 min before', detail: 'Optional: 1 gel or 125 mL sports drink for a carb top-up' },
    { label: '15 min before',    detail: `200–250 mL water, then nothing until km ${(RACE_KM * 0.1).toFixed(0)}` },
  ]

  const el = root.querySelector('#fuel-results')
  el.innerHTML = `
    ${startTime ? _renderTimeline(startTime, travelMin, RACE_KM) : ''}

    ${daysOut !== null ? `
    <div class="card" style="margin:0 12px 12px;">
      <div class="card-body" style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:36px;">📅</div>
        <div>
          <div style="font-size:22px;font-weight:800;color:var(--accent);">${daysOut > 0 ? daysOut : '🏁 Race day!'}</div>
          <div style="font-size:13px;color:var(--text-muted);">${daysOut > 0 ? 'days until race day' : ''}</div>
        </div>
      </div>
    </div>` : ''}

    <p class="section-header">Your Numbers — ${RACE_KM} km @ ${_formatPaceDisplay(paceMin)} /km</p>
    <div class="card">
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
          ${_stat('⏱️', _formatTime(totalMinutes), 'finish time')}
          ${_stat('🔥', totalCal.toLocaleString(), 'kcal burned')}
          ${_stat('🍯', totalCarbs + 'g', 'carbs needed')}
        </div>
        ${isHot  ? `<div style="margin-top:12px;padding:8px 10px;background:#7f1d1d22;border:1px solid #ef4444;border-radius:8px;font-size:13px;color:#ef4444;">🌡️ Hot race day (${temp}°C) — hydration plan adjusted upward</div>` : ''}
        ${isCold ? `<div style="margin-top:12px;padding:8px 10px;background:#1e3a5f22;border:1px solid #60a5fa;border-radius:8px;font-size:13px;color:#60a5fa;">🥶 Cold day (${temp}°C) — don't skip fluids; you still sweat</div>` : ''}
      </div>
    </div>

    <p class="section-header">Gel Plan (${gelsNeeded} gels)</p>
    <div class="card">
      <div class="card-body">
        ${gelTimes.length ? gelTimes.map((t, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i ? 'border-top:1px solid var(--bg-raised);' : ''}">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-raised);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--accent);flex-shrink:0;">${i + 1}</div>
            <div>
              <div style="font-size:14px;font-weight:600;">km ${minToKm(t)} · ${_formatTime(t)}</div>
              <div style="font-size:12px;color:var(--text-muted);">Take with 150–200 mL water; don't chase with sports drink</div>
            </div>
          </div>`).join('') : `<p style="font-size:13px;color:var(--text-muted);">No gels needed for this distance at your pace.</p>`}
        <div style="margin-top:10px;padding:8px 10px;background:var(--bg-raised);border-radius:8px;font-size:13px;color:var(--text-muted);">
          Practise your gel brand in training. Never try a new gel on race day.
        </div>
      </div>
    </div>

    <p class="section-header">Water Strategy (~${totalMl} mL total)</p>
    <div class="card">
      <div class="card-body">
        <div style="font-size:14px;margin-bottom:10px;">${isHot ? 'Drink at EVERY station (150–200 mL each)' : 'Drink at every other station (150–200 mL each)'}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Typical aid stations near km: ${aidStations.join(', ')}</div>
        <div style="padding:8px 10px;background:var(--bg-raised);border-radius:8px;font-size:13px;color:var(--text-muted);">
          Sip, don't gulp. Pinch the cup into a V-shape for easier drinking while running.
        </div>
      </div>
    </div>

    <p class="section-header">Pre-Race Fueling</p>
    <div class="card">
      <div class="card-body">
        ${preRaceMeals.map((m, i) => `
          <div style="padding:8px 0;${i ? 'border-top:1px solid var(--bg-raised);' : ''}">
            <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:2px;">${m.label}</div>
            <div style="font-size:13px;">${m.detail}</div>
          </div>`).join('')}
      </div>
    </div>

    <div style="height:16px;"></div>
  `
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _stat(icon, value, label) {
  return `<div>
    <div style="font-size:22px;">${icon}</div>
    <div style="font-size:20px;font-weight:800;">${value}</div>
    <div style="font-size:11px;color:var(--text-muted);">${label}</div>
  </div>`
}

function _formatTime(minutes) {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function _fmtSeconds(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
