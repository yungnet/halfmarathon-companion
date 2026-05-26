// Race Day Fuel Calculator

const STORE_KEY = 'hm_fuel_prefs'

export function initFuel(root) {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')

  root.innerHTML = `
    <p class="section-header">Race Info</p>
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
            <label>Temp (°C)</label>
            <input id="f-temp" type="number" min="-30" max="50" placeholder="18"
              inputmode="decimal" value="${saved.temp || ''}" />
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
  `

  // Distance preset buttons
  root.querySelectorAll('.dist-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelector('#f-distance').value = btn.dataset.km
    })
  })

  // Pace field: auto-insert colon after two digits
  root.querySelector('#f-pace').addEventListener('input', e => {
    let v = e.target.value.replace(/[^0-9:]/g, '')
    if (v.length === 2 && !v.includes(':') && e.inputType !== 'deleteContentBackward') {
      v = v + ':'
    }
    e.target.value = v
  })

  root.querySelector('#calc-btn').addEventListener('click', () => {
    const weight   = parseFloat(root.querySelector('#f-weight').value)
    const paceStr  = root.querySelector('#f-pace').value.trim()
    const paceMin  = _parsePace(paceStr)
    const distance = parseFloat(root.querySelector('#f-distance').value) || 21.1
    const date     = root.querySelector('#f-date').value
    const temp     = parseFloat(root.querySelector('#f-temp').value)
    const level    = root.querySelector('#f-level').value

    if (!weight) { root.querySelector('#f-weight').focus(); alert('Please enter your weight.'); return }
    if (!paceMin) { root.querySelector('#f-pace').focus(); alert('Enter pace as MM:SS (e.g. 7:30 for 7 min 30 sec per km).'); return }

    localStorage.setItem(STORE_KEY, JSON.stringify({ weight, pace: paceStr, distance, raceDate: date, temp, level }))
    _renderResults(root, { weight, paceMin, distance, date, temp, level })
  })

  // Auto-calculate if saved prefs exist
  if (saved.weight && saved.pace) {
    const paceMin = _parsePace(saved.pace)
    if (paceMin) {
      _renderResults(root, {
        weight: saved.weight, paceMin,
        distance: saved.distance || 21.1,
        date: saved.raceDate, temp: saved.temp, level: saved.level || 'intermediate',
      })
    }
  }
}

// ── Parse MM:SS → decimal minutes ────────────────────────────────────────────

function _parsePace(str) {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0], 10)
  const s = parseInt(parts[1], 10)
  if (isNaN(m) || isNaN(s) || s >= 60 || m < 0) return null
  return m + s / 60
}

function _formatPaceDisplay(paceMin) {
  const m = Math.floor(paceMin)
  const s = Math.round((paceMin - m) * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Results ───────────────────────────────────────────────────────────────────

function _renderResults(root, { weight, paceMin, distance, date, temp, level }) {
  const RACE_KM      = distance || 21.1
  const totalMinutes = paceMin * RACE_KM
  const totalHours   = totalMinutes / 60
  const daysOut      = date ? Math.ceil((new Date(date) - new Date()) / 86400000) : null

  // ── Calorie & carb estimates ──────────────────────
  const weightKg   = weight * 0.453592
  const calPerMin  = (10.5 * weightKg * 3.5) / 200
  const totalCal   = Math.round(calPerMin * totalMinutes)

  const carbsPerHr = level === 'beginner' ? 30 : level === 'intermediate' ? 45 : 60
  const totalCarbs = Math.round(carbsPerHr * totalHours)
  const gelsNeeded = Math.ceil(totalCarbs / 25)

  // ── Hydration ─────────────────────────────────────
  const isHot  = temp != null && temp > 22
  const isCold = temp != null && temp < 7
  const hydrationFactor = isHot ? 1.3 : isCold ? 0.85 : 1.0
  const mlPerHr  = 350 * hydrationFactor
  const totalMl  = Math.round(mlPerHr * totalHours)

  // ── Gel timing ────────────────────────────────────
  const gelInterval = level === 'beginner' ? 45 : 38
  const gelTimes = []
  let t = level === 'beginner' ? 40 : 35
  while (t < totalMinutes - 10 && gelTimes.length < gelsNeeded) {
    gelTimes.push(t); t += gelInterval
  }

  function minToKm(min) { return (min / paceMin).toFixed(1) }

  // ── Aid stations (every ~2.5 km, skip first 2 km) ─
  const aidStations = []
  for (let km = 2.5; km < RACE_KM - 1; km += 2.5) aidStations.push(km.toFixed(1))

  const drinkAtStation = isHot
    ? 'Drink at EVERY station (150–200 mL each)'
    : 'Drink at every other station (150–200 mL each)'

  const preRaceMeals = [
    { label: '2–3 hours before', detail: '200–300 kcal of easily digestible carbs (banana, toast, oatmeal)' },
    { label: '30–45 min before', detail: 'Optional: 1 gel or 125 mL sports drink for a carb top-up' },
    { label: '15 min before',    detail: `200–250 mL water, then nothing until km ${(RACE_KM * 0.1).toFixed(0)}` },
  ]

  const el = root.querySelector('#fuel-results')
  el.innerHTML = `
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
        ${isHot  ? `<div style="margin-top:12px;padding:8px 10px;background:#7f1d1d22;border:1px solid var(--danger);border-radius:8px;font-size:13px;color:var(--danger);">🌡️ Hot race day (${temp}°C) — hydration plan adjusted upward</div>` : ''}
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
          Practice your gel brand in training. Never try a new gel on race day.
        </div>
      </div>
    </div>

    <p class="section-header">Water Strategy (~${totalMl} mL total)</p>
    <div class="card">
      <div class="card-body">
        <div style="font-size:14px;margin-bottom:10px;">${drinkAtStation}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Typical aid stations near km: ${aidStations.join(', ')}</div>
        <div style="padding:8px 10px;background:var(--bg-raised);border-radius:8px;font-size:13px;color:var(--text-muted);">
          Sip, don't gulp. Pinch the cup into a V-shape for easier drinking while moving.
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
  return `
    <div>
      <div style="font-size:22px;">${icon}</div>
      <div style="font-size:20px;font-weight:800;">${value}</div>
      <div style="font-size:11px;color:var(--text-muted);">${label}</div>
    </div>`
}

function _formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
