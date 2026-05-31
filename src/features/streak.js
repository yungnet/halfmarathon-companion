// Consistency & Streak tracker — appended to the bottom of the run list

const ACTS_KEY = 'hm_strava_activities'

/**
 * Returns an HTML string to inject at the bottom of #run-list-inner.
 * Reads hm_strava_activities from localStorage — no DOM dependencies.
 */
export function renderStreakHTML() {
  const raw = localStorage.getItem(ACTS_KEY)
  if (!raw) return ''

  const runs = JSON.parse(raw)
    .filter(a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 500)
  if (!runs.length) return ''

  // ── Date → total km map ──────────────────────────────────────────────────────

  const dateKm = new Map()
  runs.forEach(a => {
    const d = a.start_date_local.slice(0, 10)  // 'YYYY-MM-DD' local date
    dateKm.set(d, (dateKm.get(d) || 0) + a.distance / 1000)
  })

  // Local-time date string (avoids UTC midnight offset issues)
  function _ds(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const todayStr = _ds(today)

  // ── Current streak ───────────────────────────────────────────────────────────
  // Count backward from today; if no run today, start from yesterday so a
  // rest day doesn't immediately zero out an active streak.

  let curStreak = 0
  const check = new Date(today)
  if (!dateKm.has(_ds(check))) check.setDate(check.getDate() - 1)
  while (dateKm.has(_ds(check))) {
    curStreak++
    check.setDate(check.getDate() - 1)
  }

  // ── Best-ever streak ─────────────────────────────────────────────────────────

  const allDates = [...dateKm.keys()].sort()
  let bestStreak = 0, runLen = 0
  allDates.forEach((ds, i) => {
    if (i === 0) { runLen = 1; bestStreak = 1; return }
    const prev = new Date(allDates[i - 1] + 'T12:00:00')
    const curr = new Date(ds + 'T12:00:00')
    runLen = Math.round((curr - prev) / 86400000) === 1 ? runLen + 1 : 1
    if (runLen > bestStreak) bestStreak = runLen
  })

  // ── Weekly stats — last 8 weeks ──────────────────────────────────────────────

  const now = Date.now()
  const W8ms = 8 * 7 * 86400000
  const r8w = runs.filter(a => now - new Date(a.start_date_local).getTime() < W8ms)

  const totalKm8w = r8w.reduce((s, a) => s + a.distance / 1000, 0)
  const avgKm     = +(totalKm8w / 8).toFixed(1)
  const avgRuns   = +(r8w.length / 8).toFixed(1)

  // Count distinct run days per week-bucket (0 = this week, 7 = 8 weeks ago)
  const weeklyRunDays = new Array(8).fill(0)
  const seenKeys = new Set()
  r8w.forEach(a => {
    const dStr    = a.start_date_local.slice(0, 10)
    const daysAgo = Math.floor((now - new Date(dStr + 'T12:00:00').getTime()) / 86400000)
    const wi      = Math.min(Math.floor(daysAgo / 7), 7)
    const key     = `${wi}-${dStr}`
    if (!seenKeys.has(key)) { seenKeys.add(key); weeklyRunDays[wi]++ }
  })
  const consistentWeeks = weeklyRunDays.filter(n => n >= 3).length

  // ── Activity calendar — last 16 weeks (Mon → Sun columns) ───────────────────

  // calStart = Monday at least 111 days before today (snapped to Monday)
  const calStart = new Date(today)
  calStart.setDate(calStart.getDate() - 111)
  const dow = calStart.getDay()                              // 0=Sun, 1=Mon…
  calStart.setDate(calStart.getDate() - (dow === 0 ? 6 : dow - 1))

  // Build 16 week-columns, each [Mon, Tue, …, Sun]
  const weeks = []
  const cur = new Date(calStart)
  for (let w = 0; w < 16; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const ds = _ds(new Date(cur))
      week.push({ ds, km: dateKm.get(ds) || 0 })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  function cellColor(km, ds) {
    if (ds > todayStr) return 'transparent'           // future
    if (km === 0)      return 'var(--bg-raised)'      // rest day
    if (km < 5)        return '#7c3aed55'             // short run (faint purple)
    if (km < 10)       return '#f59e0b'               // medium run (amber)
    return '#f97316'                                   // long run (hot orange)
  }

  // CSS grid: row 0 = month labels, rows 1–7 = Mon–Sun
  // col 0 = day-of-week labels, cols 1–16 = week columns
  let calHTML =
    `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0 8px;">` +
    `<div style="display:grid;` +
      `grid-template-columns:14px ${weeks.map(() => '16px').join(' ')};` +
      `grid-template-rows:12px ${Array(7).fill('16px').join(' ')};` +
      `gap:2px;width:fit-content;">`

  // Corner + month labels
  calHTML += '<div></div>'
  weeks.forEach((week, wi) => {
    const d    = new Date(week[0].ds + 'T12:00:00')
    const prev = wi > 0 ? new Date(weeks[wi - 1][0].ds + 'T12:00:00') : null
    const show = !prev || d.getMonth() !== prev.getMonth()
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);` +
      `overflow:visible;white-space:nowrap;line-height:12px;">` +
      `${show ? d.toLocaleString('default', { month: 'short' }) : ''}</div>`
  })

  // Day rows: Mon(0)…Sun(6) — show label on alternating rows
  ;['M', '', 'W', '', 'F', '', 'S'].forEach((lbl, di) => {
    calHTML +=
      `<div style="font-size:9px;color:var(--text-muted);` +
      `text-align:right;line-height:16px;padding-right:2px;">${lbl}</div>`
    weeks.forEach(week => {
      const c = week[di]
      calHTML +=
        `<div style="width:16px;height:16px;border-radius:2px;` +
        `background:${cellColor(c.km, c.ds)};"></div>`
    })
  })

  calHTML += '</div></div>'

  // ── Final HTML ───────────────────────────────────────────────────────────────

  return `
    <div style="border-top:2px solid var(--border);margin-top:8px;">
      <div class="rt-list-header" style="position:static;background:var(--bg-base);">
        Consistency &amp; Streaks
      </div>
      <div style="padding:10px 14px 16px;">

        <!-- Streak chips -->
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">${curStreak > 0 ? '🔥' : '💤'}</div>
            <div style="font-size:22px;font-weight:800;color:${curStreak > 0 ? '#f97316' : 'var(--text-muted)'};">${curStreak}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">day streak</div>
          </div>
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">🏆</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);">${bestStreak}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">best streak</div>
          </div>
          <div style="flex:1;background:var(--bg-raised);border-radius:10px;padding:10px 6px;text-align:center;">
            <div style="font-size:20px;line-height:1.3;">📅</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);">${consistentWeeks}<span style="font-size:13px;font-weight:600;color:var(--text-muted);">/8</span></div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">active weeks</div>
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
            <div style="font-size:11px;color:var(--text-muted);">last 8 weeks</div>
          </div>
          <div style="background:var(--bg-raised);border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:3px;">Runs / week</div>
            <div style="font-size:20px;font-weight:800;">${avgRuns}</div>
            <div style="font-size:11px;color:var(--text-muted);">avg last 8 weeks</div>
          </div>
        </div>

      </div>
    </div>
    <div style="height:24px;"></div>`
}
