// Consistency & Streak tracker

const LONG_RUN_KM           = 14     // fallback long-run threshold (km) when data is sparse
const LOOKBACK_WEEKS        = 8      // weeks of history to analyse
const DELOAD_DROP_THRESHOLD = 0.30   // ≥30% volume drop vs prior 3-week avg = deload week
const TARGET_KEY            = 'runsPerWeekTarget'
const ACTS_KEY              = 'hm_strava_activities'

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Initialise the standalone Stats tab.
 * Uses full card layout with section-header dividers.
 */
export function initStatsTab(root) {
  root.innerHTML = ''
  _render(root, /*standalone=*/true)
}

/**
 * Appends the Consistency section to the bottom of a run list container.
 * Uses a compact inline layout with a border-top divider.
 * (Kept for potential future use; currently the section lives in its own tab.)
 */
export function initStreakSection(container) {
  let el = container.querySelector('#streak-section')
  if (!el) {
    el = document.createElement('div')
    el.id = 'streak-section'
    container.appendChild(el)
  }
  _render(el, /*standalone=*/false)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Monday midnight (local) timestamp for the week containing `date`. */
function _weekStartMs(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()                              // 0 = Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.getTime()
}

/** Local-time YYYY-MM-DD (avoids UTC midnight offset issues). */
function _ds(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Returns true if the week starting at `ws` is a deload week:
 *   – at least one run that week (rest weeks are not deloads)
 *   – weekly km is ≥ DELOAD_DROP_THRESHOLD lower than the avg of the 3 prior weeks
 */
function _isDeload(ws, weekData) {
  const w = weekData.get(ws)
  if (!w || w.count === 0) return false
  const WK   = 7 * 86400000
  const avg3 = [ws - WK, ws - 2 * WK, ws - 3 * WK]
    .reduce((s, pws) => s + (weekData.get(pws)?.km || 0), 0) / 3
  return avg3 > 0 && w.km < avg3 * (1 - DELOAD_DROP_THRESHOLD)
}

// ── Internal render ───────────────────────────────────────────────────────────

function _render(el, standalone) {
  const raw = localStorage.getItem(ACTS_KEY)
  if (!raw) {
    el.innerHTML = standalone ? _emptyState() : ''
    return
  }

  const runs = JSON.parse(raw)
    .filter(a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 500)
  if (!runs.length) {
    el.innerHTML = standalone ? _emptyState() : ''
    return
  }

  // ── Date → km map (calendar cells) ──────────────────────────────────────────

  const dateKm = new Map()
  runs.forEach(a => {
    const d = a.start_date_local.slice(0, 10)
    dateKm.set(d, (dateKm.get(d) || 0) + a.distance / 1000)
  })

  // ── Week-bucket map: weekStartMs → { count, km, maxRun, hasLong } ────────────
  // hasLong is deferred until after dynamicLongRunKm is known.

  // Strava workout_type === 2 means "Long Run"; name matching /\blong/i catches
  // "Long Run", "longrun", "long-run", etc. while avoiding "along" / "prolong".
  function _isTaggedLong(a) {
    return a.workout_type === 2 || /\blong/i.test(a.name || '')
  }

  const weekData = new Map()
  runs.forEach(a => {
    const ws = _weekStartMs(new Date(a.start_date_local))
    if (!weekData.has(ws)) weekData.set(ws, { count: 0, km: 0, maxRun: 0, hasLong: false, hasTaggedLong: false })
    const w = weekData.get(ws)
    w.count++
    w.km += a.distance / 1000
    if (a.distance / 1000 > w.maxRun) w.maxRun = a.distance / 1000
    if (_isTaggedLong(a)) w.hasTaggedLong = true
  })

  const now = new Date(); now.setHours(12, 0, 0, 0)
  const thisWeekMs = _weekStartMs(now)

  // Last LOOKBACK_WEEKS complete weeks (index 0 = most recently completed week)
  const pastWeeks = Array.from(
    { length: LOOKBACK_WEEKS },
    (_, i) => thisWeekMs - (i + 1) * 7 * 86400000
  )

  // ── Dynamic long-run threshold ────────────────────────────────────────────────
  // 75% of the average "longest run of the week" across recent complete weeks.
  // Adapts to the runner's actual training level. Falls back to LONG_RUN_KM
  // when fewer than 4 weeks have data.

  const weeklyMaxRuns = pastWeeks
    .map(ws => weekData.get(ws)?.maxRun || 0)
    .filter(k => k > 0)

  const dynamicLongRunKm = weeklyMaxRuns.length >= 4
    ? Math.max(5, Math.round(
        weeklyMaxRuns.reduce((s, k) => s + k, 0) / weeklyMaxRuns.length * 0.75
      ))
    : LONG_RUN_KM

  // A week "has a long run" if: Strava tagged it, the name signals it, OR distance qualifies
  weekData.forEach(w => { w.hasLong = w.hasTaggedLong || w.maxRun >= dynamicLongRunKm })

  // ── Deload week detection ─────────────────────────────────────────────────────

  const deloadWeekMsSet = new Set()
  weekData.forEach((_, ws) => { if (_isDeload(ws, weekData)) deloadWeekMsSet.add(ws) })

  // ── Auto target ───────────────────────────────────────────────────────────────

  const totalPastRuns = pastWeeks.reduce((s, ws) => s + (weekData.get(ws)?.count || 0), 0)
  const autoTarget    = Math.max(1, Math.round(totalPastRuns / LOOKBACK_WEEKS))
  const isCustom      = !!localStorage.getItem(TARGET_KEY)
  const stored        = parseInt(localStorage.getItem(TARGET_KEY))
  const target        = isCustom && !isNaN(stored) ? stored : autoTarget

  // ── Metrics ───────────────────────────────────────────────────────────────────

  // 1. Weekly target hit rate
  const weeksOnTarget = pastWeeks.filter(ws => (weekData.get(ws)?.count || 0) >= target).length

  // 2. Long run streak — deload weeks with any run count; rest weeks end the streak
  let longRunStreak = 0
  for (const ws of pastWeeks) {
    const w        = weekData.get(ws)
    const isDeload = deloadWeekMsSet.has(ws)
    if (!w || w.count === 0) break
    if (isDeload || w.hasLong) longRunStreak++
    else break
  }

  // 3. Current week
  const thisWeekCount = weekData.get(thisWeekMs)?.count || 0
  const weekDone      = thisWeekCount >= target

  // Stats
  const avgKm   = +(pastWeeks.reduce((s, ws) => s + (weekData.get(ws)?.km    || 0), 0) / LOOKBACK_WEEKS).toFixed(1)
  const avgRuns = +(totalPastRuns / LOOKBACK_WEEKS).toFixed(1)

  // ── Activity calendar: last 16 weeks ─────────────────────────────────────────

  const today    = new Date(); today.setHours(12, 0, 0, 0)
  const todayStr = _ds(today)

  const calStart = new Date(today)
  calStart.setDate(calStart.getDate() - 111)
  const calDow = calStart.getDay()
  calStart.setDate(calStart.getDate() - (calDow === 0 ? 6 : calDow - 1))

  const calWeeks = []
  const cur = new Date(calStart)
  for (let w = 0; w < 16; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const ds = _ds(new Date(cur))
      week.push({ ds, km: dateKm.get(ds) || 0 })
      cur.setDate(cur.getDate() + 1)
    }
    calWeeks.push(week)
  }

  function cellColor(km, ds) {
    if (ds > todayStr) return 'transparent'
    if (km === 0)      return 'var(--bg-raised)'
    if (km < 5)        return '#7c3aed55'
    if (km < 10)       return '#f59e0b'
    return '#f97316'
  }

  let calHTML =
    `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0 8px;">` +
    `<div style="display:grid;` +
      `grid-template-columns:14px ${calWeeks.map(() => '16px').join(' ')};` +
      `grid-template-rows:12px ${Array(7).fill('16px').join(' ')};` +
      `gap:2px;width:fit-content;">`

  calHTML += '<div></div>'
  calWeeks.forEach((week, wi) => {
    const weekMs     = _weekStartMs(new Date(week[0].ds + 'T12:00:00'))
    const isDeloadWk = deloadWeekMsSet.has(weekMs)
    const d          = new Date(week[0].ds + 'T12:00:00')
    const prev       = wi > 0 ? new Date(calWeeks[wi - 1][0].ds + 'T12:00:00') : null
    const showMonth  = !prev || d.getMonth() !== prev.getMonth()
    let label        = showMonth ? d.toLocaleString('default', { month: 'short' }) : ''
    if (isDeloadWk)  label += `<span style="color:#60a5fa;"> ↓</span>`
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);overflow:visible;` +
      `white-space:nowrap;line-height:12px;">${label}</div>`
  })

  ;['M', '', 'W', '', 'F', '', 'S'].forEach((lbl, di) => {
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);` +
      `text-align:right;line-height:16px;padding-right:2px;">${lbl}</div>`
    calWeeks.forEach(week => {
      const weekMs     = _weekStartMs(new Date(week[0].ds + 'T12:00:00'))
      const isDeloadWk = deloadWeekMsSet.has(weekMs)
      const c          = week[di]
      const ring       = isDeloadWk && c.km > 0 && c.ds <= todayStr
        ? 'outline:1px solid #3b82f660;outline-offset:-1px;'
        : ''
      calHTML +=
        `<div style="width:16px;height:16px;border-radius:2px;` +
        `background:${cellColor(c.km, c.ds)};${ring}"></div>`
    })
  })

  calHTML += '</div></div>'

  // ── Build HTML pieces (shared between both modes) ─────────────────────────────

  const chipsHTML = `
    <div style="display:flex;gap:8px;">
      <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
        <div style="font-size:20px;line-height:1.3;">🎯</div>
        <div style="font-size:18px;font-weight:800;color:var(--accent);line-height:1.2;">
          ${weeksOnTarget}<span style="font-size:12px;font-weight:600;color:var(--text-muted);">/${LOOKBACK_WEEKS}</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">weeks on<br>target</div>
      </div>
      <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
        <div style="font-size:20px;line-height:1.3;">🏃</div>
        <div style="font-size:18px;font-weight:800;color:${longRunStreak > 0 ? 'var(--accent)' : 'var(--text-muted)'};line-height:1.2;">
          ${longRunStreak}<span style="font-size:12px;font-weight:600;color:var(--text-muted);">wk</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">long run<br>streak</div>
        <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">≥${dynamicLongRunKm}km · deload ok</div>
      </div>
      <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
        <div style="font-size:20px;line-height:1.3;">📈</div>
        <div id="streak-target-display" style="font-size:18px;font-weight:800;color:${weekDone ? 'var(--success)' : 'var(--accent)'};line-height:1.2;">
          ${thisWeekCount}/<span id="streak-target-val">${target}</span><button id="streak-edit-btn" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;vertical-align:middle;padding:0 0 2px 2px;-webkit-tap-highlight-color:transparent;" title="Edit weekly target">✏️</button>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">this week</div>
        <div style="font-size:9px;color:var(--text-muted);margin-top:1px;">${isCustom ? 'custom target' : 'based on avg'}</div>
      </div>
    </div>`

  const legendHTML = `
    <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-bottom:4px;">
      <div style="font-size:10px;color:var(--text-muted);">Less</div>
      ${['var(--bg-raised)', '#7c3aed55', '#f59e0b', '#f97316'].map(c =>
        `<div style="width:12px;height:12px;border-radius:2px;background:${c};flex-shrink:0;"></div>`
      ).join('')}
      <div style="font-size:10px;color:var(--text-muted);">More</div>
    </div>
    <div style="font-size:10px;color:#60a5fa;text-align:right;">↓ = deload week detected</div>`

  const statsGridHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div style="background:var(--bg-raised);border-radius:8px;padding:10px 12px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:3px;">Avg km / week</div>
        <div style="font-size:20px;font-weight:800;">${avgKm}</div>
        <div style="font-size:11px;color:var(--text-muted);">last ${LOOKBACK_WEEKS} weeks</div>
      </div>
      <div style="background:var(--bg-raised);border-radius:8px;padding:10px 12px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:3px;">Runs / week</div>
        <div style="font-size:20px;font-weight:800;">${avgRuns}</div>
        <div style="font-size:11px;color:var(--text-muted);">avg last ${LOOKBACK_WEEKS} weeks</div>
      </div>
    </div>`

  // ── Compose HTML ──────────────────────────────────────────────────────────────

  if (standalone) {
    el.innerHTML = `
      <p class="section-header">Consistency &amp; Streaks</p>
      <div class="card">
        <div class="card-body">${chipsHTML}</div>
      </div>

      <p class="section-header">Activity · 16 Weeks</p>
      <div class="card">
        <div class="card-body" style="padding:14px 12px 10px;">
          ${calHTML}
          ${legendHTML}
        </div>
      </div>

      <p class="section-header">Volume</p>
      <div class="card">
        <div class="card-body">${statsGridHTML}</div>
      </div>
      <div style="height:16px;"></div>`
  } else {
    el.innerHTML = `
      <div style="border-top:2px solid var(--border);margin-top:8px;">
        <div class="rt-list-header" style="position:static;background:var(--bg-base);">
          Consistency &amp; Streaks
        </div>
        <div style="padding:10px 14px 16px;">
          <div style="margin-bottom:14px;">${chipsHTML}</div>
          ${calHTML}
          ${legendHTML}
          <div style="margin-top:12px;">${statsGridHTML}</div>
        </div>
      </div>
      <div style="height:24px;"></div>`
  }

  // ── Event binding (same for both modes) ───────────────────────────────────────

  el.querySelector('#streak-edit-btn')?.addEventListener('click', e => {
    e.stopPropagation()
    const display = el.querySelector('#streak-target-display')
    const curVal  = parseInt(el.querySelector('#streak-target-val')?.textContent) || autoTarget

    display.innerHTML = `
      <input id="streak-target-input" type="number" inputmode="numeric" min="1" max="14" value="${curVal}"
        style="width:38px;background:var(--bg-surface);border:1px solid var(--accent);border-radius:4px;
               color:var(--text);font-size:14px;padding:2px 4px;text-align:center;"/>
      <button id="streak-confirm-btn"
        style="background:var(--accent);color:#fff;border:none;border-radius:4px;
               font-size:12px;padding:2px 6px;cursor:pointer;margin-left:2px;vertical-align:middle;">✓</button>`

    const input = el.querySelector('#streak-target-input')
    input.focus()
    input.select()

    function saveAndRender() {
      const v = parseInt(input.value)
      if (!isNaN(v) && v >= 1 && v <= 14) localStorage.setItem(TARGET_KEY, v)
      _render(el, standalone)
    }

    el.querySelector('#streak-confirm-btn').addEventListener('click', saveAndRender)
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  saveAndRender()
      if (ev.key === 'Escape') _render(el, standalone)
    })
  })
}

function _emptyState() {
  return `
    <p class="section-header">Consistency &amp; Streaks</p>
    <div class="card">
      <div class="card-body" style="text-align:center;padding:40px 16px;">
        <div style="font-size:40px;margin-bottom:10px;">📊</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:6px;">No training data yet</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.5;">
          Connect Strava on the Runs tab to see your consistency stats and activity calendar.
        </div>
      </div>
    </div>`
}
