// Consistency & Streak tracker — appended to the bottom of the run list

const LONG_RUN_KM    = 14            // km threshold for a "long run"
const LOOKBACK_WEEKS = 8             // weeks of history to analyse
const TARGET_KEY     = 'runsPerWeekTarget'
const ACTS_KEY       = 'hm_strava_activities'

/**
 * Appends the Consistency & Streaks section to `container` and binds events.
 * Uses a persistent #streak-section child so it can re-render without
 * disturbing the surrounding run list.
 */
export function initStreakSection(container) {
  let el = container.querySelector('#streak-section')
  if (!el) {
    el = document.createElement('div')
    el.id = 'streak-section'
    container.appendChild(el)
  }
  _render(el)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Monday midnight (local) timestamp for the week containing `date`. */
function _weekStartMs(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()                          // 0 = Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.getTime()
}

/** Local-time YYYY-MM-DD (avoids UTC midnight offset issues). */
function _ds(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Internal render ───────────────────────────────────────────────────────────

function _render(el) {
  const raw = localStorage.getItem(ACTS_KEY)
  if (!raw) { el.innerHTML = ''; return }

  const runs = JSON.parse(raw)
    .filter(a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 500)
  if (!runs.length) { el.innerHTML = ''; return }

  // ── Date → km map (calendar cells) ──────────────────────────────────────────

  const dateKm = new Map()
  runs.forEach(a => {
    const d = a.start_date_local.slice(0, 10)
    dateKm.set(d, (dateKm.get(d) || 0) + a.distance / 1000)
  })

  // ── Week-bucket map: weekStartMs → { count, hasLong, km } ───────────────────

  const weekData = new Map()
  runs.forEach(a => {
    const ws = _weekStartMs(new Date(a.start_date_local))
    if (!weekData.has(ws)) weekData.set(ws, { count: 0, hasLong: false, km: 0 })
    const w = weekData.get(ws)
    w.count++
    w.km += a.distance / 1000
    if (a.distance / 1000 >= LONG_RUN_KM) w.hasLong = true
  })

  const now = new Date(); now.setHours(12, 0, 0, 0)
  const thisWeekMs = _weekStartMs(now)

  // Last LOOKBACK_WEEKS *complete* weeks (oldest first → most recent first in array)
  const pastWeeks = Array.from(
    { length: LOOKBACK_WEEKS },
    (_, i) => thisWeekMs - (i + 1) * 7 * 86400000
  )  // index 0 = last week, index 7 = 8 weeks ago

  // ── Auto target (avg runs/week over last LOOKBACK_WEEKS complete weeks) ──────

  const totalPastRuns = pastWeeks.reduce((s, ws) => s + (weekData.get(ws)?.count || 0), 0)
  const autoTarget    = Math.max(1, Math.round(totalPastRuns / LOOKBACK_WEEKS))
  const isCustom      = !!localStorage.getItem(TARGET_KEY)
  const stored        = parseInt(localStorage.getItem(TARGET_KEY))
  const target        = isCustom && !isNaN(stored) ? stored : autoTarget

  // ── 1. Weekly target hit rate ────────────────────────────────────────────────
  const weeksOnTarget = pastWeeks.filter(ws => (weekData.get(ws)?.count || 0) >= target).length

  // ── 2. Long run streak (consecutive weeks back from last complete week) ──────
  let longRunStreak = 0
  for (const ws of pastWeeks) {
    if (weekData.get(ws)?.hasLong) longRunStreak++
    else break
  }

  // ── 3. Current week runs vs target ──────────────────────────────────────────
  const thisWeekCount = weekData.get(thisWeekMs)?.count || 0
  const weekDone      = thisWeekCount >= target

  // ── Stats (for bottom row) ───────────────────────────────────────────────────
  const avgKm   = +(pastWeeks.reduce((s, ws) => s + (weekData.get(ws)?.km    || 0), 0) / LOOKBACK_WEEKS).toFixed(1)
  const avgRuns = +(totalPastRuns / LOOKBACK_WEEKS).toFixed(1)

  // ── Activity calendar: last 16 weeks ────────────────────────────────────────

  const today    = new Date(); today.setHours(12, 0, 0, 0)
  const todayStr = _ds(today)

  // calStart = Monday at least 111 days before today
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
    const d    = new Date(week[0].ds + 'T12:00:00')
    const prev = wi > 0 ? new Date(calWeeks[wi - 1][0].ds + 'T12:00:00') : null
    const show = !prev || d.getMonth() !== prev.getMonth()
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);overflow:visible;` +
      `white-space:nowrap;line-height:12px;">${show ? d.toLocaleString('default', { month: 'short' }) : ''}</div>`
  })

  ;['M', '', 'W', '', 'F', '', 'S'].forEach((lbl, di) => {
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);` +
      `text-align:right;line-height:16px;padding-right:2px;">${lbl}</div>`
    calWeeks.forEach(week => {
      const c = week[di]
      calHTML +=
        `<div style="width:16px;height:16px;border-radius:2px;background:${cellColor(c.km, c.ds)};"></div>`
    })
  })

  calHTML += '</div></div>'

  // ── HTML ─────────────────────────────────────────────────────────────────────

  el.innerHTML = `
    <div style="border-top:2px solid var(--border);margin-top:8px;">
      <div class="rt-list-header" style="position:static;background:var(--bg-base);">
        Consistency &amp; Streaks
      </div>
      <div style="padding:10px 14px 16px;">

        <!-- Three stat cards -->
        <div style="display:flex;gap:8px;margin-bottom:14px;">

          <!-- 1: Weekly target hit rate -->
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">🎯</div>
            <div style="font-size:18px;font-weight:800;color:var(--accent);line-height:1.2;">
              ${weeksOnTarget}<span style="font-size:12px;font-weight:600;color:var(--text-muted);">/${LOOKBACK_WEEKS}</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">weeks on<br>target</div>
          </div>

          <!-- 2: Long run streak -->
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">🏃</div>
            <div style="font-size:18px;font-weight:800;color:${longRunStreak > 0 ? 'var(--accent)' : 'var(--text-muted)'};line-height:1.2;">
              ${longRunStreak}<span style="font-size:12px;font-weight:600;color:var(--text-muted);">wk</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">long run<br>streak</div>
          </div>

          <!-- 3: Current week progress -->
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">📈</div>
            <div id="streak-target-display" style="font-size:18px;font-weight:800;color:${weekDone ? 'var(--success)' : 'var(--accent)'};line-height:1.2;">
              ${thisWeekCount}/<span id="streak-target-val">${target}</span><button id="streak-edit-btn" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;vertical-align:middle;padding:0 0 2px 2px;-webkit-tap-highlight-color:transparent;" title="Edit weekly target">✏️</button>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3;">this week</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:1px;">${isCustom ? 'custom target' : 'based on avg'}</div>
          </div>

        </div>

        <!-- GitHub-style activity calendar -->
        ${calHTML}

        <!-- Colour legend -->
        <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-bottom:12px;">
          <div style="font-size:10px;color:var(--text-muted);">Less</div>
          ${['var(--bg-raised)', '#7c3aed55', '#f59e0b', '#f97316'].map(c =>
            `<div style="width:12px;height:12px;border-radius:2px;background:${c};flex-shrink:0;"></div>`
          ).join('')}
          <div style="font-size:10px;color:var(--text-muted);">More</div>
        </div>

        <!-- Stats row -->
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
        </div>

      </div>
    </div>
    <div style="height:24px;"></div>`

  // ── Event binding ─────────────────────────────────────────────────────────────

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
      _render(el)
    }

    el.querySelector('#streak-confirm-btn').addEventListener('click', saveAndRender)
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  saveAndRender()
      if (ev.key === 'Escape') _render(el)
    })
  })
}
