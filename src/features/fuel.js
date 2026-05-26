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
            <input id="f-weight" type="number" min="80" max="350" placeholder="155" value="${saved.weight || ''}" />
          </div>
          <div class="form-group">
            <label>Goal pace (min/mi)</label>
            <input id="f-pace" type="number" min="5" max="20" step="0.1" placeholder="9.5" value="${saved.pace || ''}" />
          </div>
        </div>
        <div class="row-2">
          <div class="form-group">
            <label>Race date</label>
            <input id="f-date" type="date" value="${saved.raceDate || ''}" />
          </div>
          <div class="form-group">
            <label>Temp (°F)</label>
            <input id="f-temp" type="number" min="-10" max="120" placeholder="65" value="${saved.temp || ''}" />
          </div>
        </div>
        <div class="form-group">
          <label>Experience level</label>
          <select id="f-level">
            <option value="beginner" ${saved.level === 'beginner' ? 'selected' : ''}>Beginner (first race)</option>
            <option value="intermediate" ${saved.level === 'intermediate' || !saved.level ? 'selected' : ''}>Intermediate</option>
            <option value="experienced" ${saved.level === 'experienced' ? 'selected' : ''}>Experienced</option>
          </select>
        </div>
        <button id="calc-btn" class="btn btn-primary btn-full">Calculate Strategy</button>
      </div>
    </div>

    <div id="fuel-results"></div>
  `

  root.querySelector('#calc-btn').addEventListener('click', () => {
    const weight = parseFloat(root.querySelector('#f-weight').value)
    const pace   = parseFloat(root.querySelector('#f-pace').value)
    const date   = root.querySelector('#f-date').value
    const temp   = parseFloat(root.querySelector('#f-temp').value)
    const level  = root.querySelector('#f-level').value

    if (!weight || !pace) {
      alert('Please enter at least your weight and goal pace.')
      return
    }

    localStorage.setItem(STORE_KEY, JSON.stringify({ weight, pace, raceDate: date, temp, level }))
    _renderResults(root, { weight, pace, date, temp, level })
  })

  // Auto-calculate if saved prefs exist
  if (saved.weight && saved.pace) {
    _renderResults(root, {
      weight: saved.weight, pace: saved.pace,
      date: saved.raceDate, temp: saved.temp, level: saved.level || 'intermediate'
    })
  }
}

function _renderResults(root, { weight, pace, date, temp, level }) {
  const totalMinutes = pace * 13.1
  const totalHours = totalMinutes / 60
  const daysOut = date ? Math.ceil((new Date(date) - new Date()) / 86400000) : null

  // ── Calorie & fluid estimates ─────────────────────
  // MET for running ≈ 10.5; VO2 adjustment by pace
  const weightKg = weight * 0.453592
  const calPerMin = (10.5 * weightKg * 3.5) / 200   // rough kcal/min
  const totalCal = Math.round(calPerMin * totalMinutes)

  // Carbs needed: ~30–60g/hr depending on level; beginner can tolerate less
  const carbsPerHr = level === 'beginner' ? 30 : level === 'intermediate' ? 45 : 60
  const totalCarbs = Math.round(carbsPerHr * totalHours)

  // Typical gel: ~25g carbs, ~100 kcal
  const gelsNeeded = Math.ceil(totalCarbs / 25)

  // Heat adjustment
  const isHot = temp && temp > 72
  const isCold = temp && temp < 45
  const hydrationFactor = isHot ? 1.3 : isCold ? 0.85 : 1.0

  // Fluid: ~16–24 oz/hr baseline
  const ozPerHr = 20 * hydrationFactor
  const totalOz = Math.round(ozPerHr * totalHours)

  // ── Gel timing ────────────────────────────────────
  // First gel 30–45 min in, then every 30–45 min
  const gelInterval = level === 'beginner' ? 45 : 38
  const gelTimes = []
  let t = level === 'beginner' ? 40 : 35
  while (t < totalMinutes - 10 && gelTimes.length < gelsNeeded) {
    gelTimes.push(t)
    t += gelInterval
  }

  // Convert minutes to mile markers
  function minToMile(min) { return (min / pace).toFixed(1) }

  // ── Water station strategy ────────────────────────
  // HM typically has aid stations every ~1.5 mi
  const aidStations = []
  for (let mi = 2; mi <= 12; mi += 1.5) {
    aidStations.push(mi.toFixed(1))
  }

  const drinkAtStation = isHot
    ? 'Drink at EVERY station (4–6 oz each)'
    : 'Drink at every other station (4–6 oz each)'

  // ── Pre-race ─────────────────────────────────────
  const preRaceMeals = [
    { label: '2–3 hours before', detail: '200–300 kcal of easily digestible carbs (banana, toast, oatmeal)' },
    { label: '30–45 min before', detail: 'Optional: 1 gel or 4 oz sports drink for a carb top-up' },
    { label: '15 min before', detail: '8–10 oz water, then nothing until mile 2' },
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

    <p class="section-header">Your Numbers</p>
    <div class="card">
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
          ${_stat('⏱️', _formatTime(totalMinutes), 'finish time')}
          ${_stat('🔥', totalCal.toLocaleString(), 'kcal burned')}
          ${_stat('🍯', totalCarbs + 'g', 'carbs needed')}
        </div>
        ${isHot ? `<div style="margin-top:12px;padding:8px 10px;background:#7f1d1d22;border:1px solid var(--danger);border-radius:8px;font-size:13px;color:var(--danger);">🌡️ Hot race day (${temp}°F) — hydration plan adjusted upward</div>` : ''}
        ${isCold ? `<div style="margin-top:12px;padding:8px 10px;background:#1e3a5f22;border:1px solid #60a5fa;border-radius:8px;font-size:13px;color:#60a5fa;">🥶 Cold day (${temp}°F) — don't skip fluids; you still sweat</div>` : ''}
      </div>
    </div>

    <p class="section-header">Gel Plan (${gelsNeeded} gels)</p>
    <div class="card">
      <div class="card-body">
        ${gelTimes.map((t, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i ? 'border-top:1px solid var(--bg-raised);' : ''}">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-raised);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--accent);flex-shrink:0;">${i + 1}</div>
            <div>
              <div style="font-size:14px;font-weight:600;">Mile ${minToMile(t)} · ${_formatTime(t)}</div>
              <div style="font-size:12px;color:var(--text-muted);">Take with 4–6 oz water; don't chase with sports drink</div>
            </div>
          </div>`).join('')}
        <div style="margin-top:10px;padding:8px 10px;background:var(--bg-raised);border-radius:8px;font-size:13px;color:var(--text-muted);">
          Practice your gel brand in training. Never take a new gel on race day.
        </div>
      </div>
    </div>

    <p class="section-header">Water Strategy (~${totalOz} oz total)</p>
    <div class="card">
      <div class="card-body">
        <div style="font-size:14px;margin-bottom:10px;">${drinkAtStation}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Typical aid stations near miles: ${aidStations.join(', ')}</div>
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
