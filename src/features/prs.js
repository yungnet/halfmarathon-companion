// Personal Records tracker
// Preset distances always shown (even empty). Custom distances in a separate section.

const STORE_KEY = 'hm_prs'

const PRESETS = [
  { label: '5K',            distanceKm: 5    },
  { label: '10K',           distanceKm: 10   },
  { label: 'Half Marathon', distanceKm: 21.1 },
  { label: 'Marathon',      distanceKm: 42.2 },
]

export function initPRs(root) {
  _render(root)
}

// ── Render ────────────────────────────────────────────────────────────────────

function _render(root, statusMsg) {
  const prs    = _load()
  const custom = prs.filter(p => !PRESETS.some(pr => pr.distanceKm === p.distanceKm))
  const hasStrava = !!localStorage.getItem('hm_strava_activities')

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 0;">
      <p class="section-header" style="margin:0;flex:1;">Race PRs</p>
      ${hasStrava ? `<button id="pr-strava-btn" class="btn btn-secondary btn-sm" style="flex-shrink:0;">🔄 Find from Strava</button>` : ''}
    </div>
    ${statusMsg ? `<div style="margin:6px 14px 0;padding:8px 12px;background:var(--bg-surface);border-radius:8px;font-size:13px;color:var(--success);border-left:3px solid var(--success);">${statusMsg}</div>` : ''}

    <div style="height:4px;"></div>
    ${PRESETS.map(preset => {
      const pr = prs.find(p => p.distanceKm === preset.distanceKm)
      return pr ? _prCardHTML(pr, preset.label) : _emptyCardHTML(preset)
    }).join('')}

    <p class="section-header" style="margin-top:8px;">Other Distances</p>

    ${custom.length ? custom.map(pr => _prCardHTML(pr, null, true)).join('') : `
      <div style="padding:12px 14px 4px;font-size:13px;color:var(--text-muted);">
        No other PRs yet.
      </div>`}

    <button id="pr-add-btn" class="btn btn-secondary btn-full" style="margin:12px 14px 0;width:calc(100% - 28px);">
      + Add PR
    </button>

    <div style="height:24px;"></div>
  `

  _injectStyles()

  // Find from Strava
  root.querySelector('#pr-strava-btn')?.addEventListener('click', () => _autoDetect(root))

  // Preset "Set PR" / "Edit" buttons
  root.querySelectorAll('[data-preset-km]').forEach(btn => {
    btn.addEventListener('click', () =>
      _openModal(root, { distanceKm: parseFloat(btn.dataset.presetKm), label: btn.dataset.presetLabel })
    )
  })

  // Edit buttons on filled cards
  root.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pr = _load().find(p => p.id === +btn.dataset.editId)
      if (pr) _openModal(root, null, pr)
    })
  })

  // Delete buttons
  root.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this PR?')) return
      _save(_load().filter(p => p.id !== +btn.dataset.deleteId))
      _render(root)
    })
  })

  // Add PR (custom)
  root.querySelector('#pr-add-btn').addEventListener('click', () => _openModal(root, null))
}

// ── Card HTML ─────────────────────────────────────────────────────────────────

function _prCardHTML(pr, overrideLabel, showDelete = false) {
  const label = overrideLabel || pr.label
  const time  = _fmtTime(pr.totalSeconds)
  const pace  = _fmtPace(pr.totalSeconds, pr.distanceKm)
  const date  = pr.date
    ? new Date(pr.date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return `
    <div class="pr-card">
      <div class="pr-card-header">
        <div class="pr-label">${label} <span class="pr-km">${pr.distanceKm} km</span></div>
        <div class="pr-actions">
          ${showDelete ? `<button class="pr-btn pr-btn-del" data-delete-id="${pr.id}" title="Delete">✕</button>` : ''}
          <button class="pr-btn" data-edit-id="${pr.id}" title="Edit">Edit</button>
        </div>
      </div>
      <div class="pr-time">${time}</div>
      <div class="pr-sub">
        <span class="pr-pace">${pace} /km</span>
        ${pr.raceName ? `<span class="pr-race">${pr.raceName}${date ? ' · ' + date : ''}</span>` : (date ? `<span class="pr-race">${date}</span>` : '')}
      </div>
    </div>`
}

function _emptyCardHTML(preset) {
  return `
    <div class="pr-card pr-card-empty">
      <div class="pr-card-header">
        <div class="pr-label">${preset.label} <span class="pr-km">${preset.distanceKm} km</span></div>
      </div>
      <div class="pr-empty-time">—</div>
      <button class="btn btn-secondary btn-sm pr-set-btn"
        data-preset-km="${preset.distanceKm}"
        data-preset-label="${preset.label}">Set PR</button>
    </div>`
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function _openModal(root, preset, existing) {
  // preset  = { distanceKm, label } for a pre-filled new entry
  // existing = full pr object for editing

  const isEdit    = !!existing
  const distKm    = existing?.distanceKm ?? preset?.distanceKm ?? ''
  const distLabel = existing?.label      ?? preset?.label      ?? ''
  const isPreset  = !!preset || PRESETS.some(p => p.distanceKm === distKm)

  const sec  = existing?.totalSeconds ?? 0
  const hh   = Math.floor(sec / 3600)
  const mm   = Math.floor((sec % 3600) / 60)
  const ss   = sec % 60

  const modal = document.createElement('div')
  modal.className = 'pr-modal-overlay'
  modal.innerHTML = `
    <div class="pr-modal">
      <div class="pr-modal-header">
        <span class="pr-modal-title">${isEdit ? 'Edit PR' : 'Add PR'}</span>
        <button id="pr-modal-close" class="pr-btn">✕</button>
      </div>

      <!-- Distance -->
      <div class="form-group" id="pr-dist-wrap" ${isPreset ? 'style="display:none"' : ''}>
        <label>Distance (km)</label>
        <input id="pr-dist-km" type="number" step="0.1" min="0.1" max="500"
          placeholder="e.g. 15" inputmode="decimal"
          value="${(!isPreset && distKm) ? distKm : ''}" />
      </div>
      <div class="form-group" id="pr-dist-label-wrap" ${isPreset ? 'style="display:none"' : ''}>
        <label>Label (optional)</label>
        <input id="pr-dist-label" type="text" placeholder="e.g. 15K"
          value="${(!isPreset && distLabel) ? distLabel : ''}" />
      </div>
      ${isPreset ? `<div style="padding:0 0 12px;font-size:14px;font-weight:700;color:var(--text);">${distLabel} · ${distKm} km</div>` : ''}

      <!-- Time -->
      <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Finish Time</label>
      <div class="pr-time-row">
        <div class="pr-time-field">
          <input id="pr-h" type="number" min="0" max="23" placeholder="0" inputmode="numeric" value="${hh || ''}" />
          <span>h</span>
        </div>
        <div class="pr-time-sep">:</div>
        <div class="pr-time-field">
          <input id="pr-m" type="number" min="0" max="59" placeholder="00" inputmode="numeric" value="${mm || ''}" />
          <span>m</span>
        </div>
        <div class="pr-time-sep">:</div>
        <div class="pr-time-field">
          <input id="pr-s" type="number" min="0" max="59" placeholder="00" inputmode="numeric" value="${ss || ''}" />
          <span>s</span>
        </div>
      </div>

      <!-- Race name -->
      <div class="form-group" style="margin-top:14px;">
        <label>Race name (optional)</label>
        <input id="pr-race" type="text" placeholder="e.g. Ottawa Race Weekend"
          value="${existing?.raceName ?? ''}" />
      </div>

      <!-- Date -->
      <div class="form-group">
        <label>Date (optional)</label>
        <input id="pr-date" type="date" value="${existing?.date ?? ''}" />
      </div>

      <button id="pr-save" class="btn btn-primary btn-full" style="margin-top:6px;">
        ${isEdit ? 'Save Changes' : 'Save PR'}
      </button>
    </div>`

  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.querySelector('#pr-modal-close').addEventListener('click', close)
  modal.addEventListener('click', e => { if (e.target === modal) close() })

  modal.querySelector('#pr-save').addEventListener('click', () => {
    const h  = parseInt(modal.querySelector('#pr-h').value)  || 0
    const m  = parseInt(modal.querySelector('#pr-m').value)  || 0
    const s  = parseInt(modal.querySelector('#pr-s').value)  || 0
    const totalSec = h * 3600 + m * 60 + s

    if (totalSec <= 0) { alert('Enter a finish time.'); return }
    if (m >= 60 || s >= 60) { alert('Minutes and seconds must be 0–59.'); return }

    let km    = distKm
    let label = distLabel

    if (!isPreset) {
      km = parseFloat(modal.querySelector('#pr-dist-km').value)
      if (!km || km <= 0) { alert('Enter a valid distance.'); return }
      label = modal.querySelector('#pr-dist-label').value.trim() || `${km} km`
    }

    const raceName = modal.querySelector('#pr-race').value.trim()
    const date     = modal.querySelector('#pr-date').value

    const prs = _load().filter(p => isEdit ? p.id !== existing.id : true)

    // For preset distances: replace any existing entry for that distance
    const filtered = isPreset
      ? prs.filter(p => p.distanceKm !== km)
      : prs

    filtered.push({
      id:           isEdit ? existing.id : Date.now(),
      distanceKm:   km,
      label,
      totalSeconds: totalSec,
      raceName,
      date,
    })

    _save(filtered)
    close()
    _render(root)
  })
}

// ── Auto-detect from Strava ───────────────────────────────────────────────────

// Distance scan ranges in metres.
// Upper bounds are intentionally generous — GPS and crowd-weaving routinely
// adds 200–600 m to a race recording (e.g. a HM can read 21.6–21.9 km).
const SCAN_RANGES = {
  5:    [4700,  5600],
  10:   [9700,  10800],
  21.1: [20800, 22500],
  42.2: [41900, 43500],
}

function _autoDetect(root) {
  const raw = localStorage.getItem('hm_strava_activities')
  if (!raw) return  // button is hidden when no activities, but guard anyway

  const runs = JSON.parse(raw).filter(
    a => (a.type === 'Run' || a.sport_type === 'Run') && a.distance > 0
  )

  const prs    = _load()
  let added    = 0
  let updated  = 0

  PRESETS.forEach((preset, i) => {
    const [lo, hi] = SCAN_RANGES[preset.distanceKm]
    const candidates = runs.filter(a => a.distance >= lo && a.distance <= hi)
    if (!candidates.length) return

    // Fastest moving time wins
    const best = candidates.reduce((b, a) => a.moving_time < b.moving_time ? a : b)
    const existing = prs.find(p => p.distanceKm === preset.distanceKm)

    if (!existing) {
      prs.push({
        id:           Date.now() + i,
        distanceKm:   preset.distanceKm,
        label:        preset.label,
        totalSeconds: best.moving_time,
        raceName:     best.name,
        date:         best.start_date_local?.split('T')[0] ?? '',
      })
      added++
    } else if (best.moving_time < existing.totalSeconds) {
      existing.totalSeconds = best.moving_time
      existing.raceName     = best.name
      existing.date         = best.start_date_local?.split('T')[0] ?? ''
      updated++
    }
  })

  if (added + updated === 0) {
    _render(root, '✓ No new PRs found — your existing times are already your best, or no matching runs in your history.')
    return
  }

  _save(prs)
  const parts = []
  if (added)   parts.push(`${added} new PR${added   > 1 ? 's' : ''} added`)
  if (updated) parts.push(`${updated} PR${updated > 1 ? 's' : ''} updated`)
  _render(root, `✓ ${parts.join(' · ')} from your Strava history`)
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _load() { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') }
function _save(prs) { localStorage.setItem(STORE_KEY, JSON.stringify(prs)) }

// ── Formatting ────────────────────────────────────────────────────────────────

function _fmtTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s}`
    : `${m}:${s}`
}

function _fmtPace(totalSeconds, distanceKm) {
  const minPerKm = totalSeconds / 60 / distanceKm
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('pr-styles')) return
  const s = document.createElement('style')
  s.id = 'pr-styles'
  s.textContent = `
    .pr-card {
      margin: 0 12px 10px;
      background: var(--bg-surface);
      border-radius: 14px;
      padding: 14px 16px;
      border: 1px solid var(--border);
    }
    .pr-card-empty {
      opacity: 0.65;
    }
    .pr-card-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 6px;
    }
    .pr-label {
      font-size: 13px; font-weight: 700; color: var(--text);
    }
    .pr-km {
      font-size: 12px; font-weight: 400; color: var(--text-muted);
      margin-left: 4px;
    }
    .pr-actions { display: flex; gap: 6px; align-items: center; }
    .pr-btn {
      background: none; border: none; color: var(--text-muted);
      font-size: 12px; font-weight: 600; cursor: pointer;
      padding: 3px 8px; border-radius: 6px;
    }
    .pr-btn:hover { background: var(--bg-raised); }
    .pr-btn-del { color: var(--danger); }

    .pr-time {
      font-size: 38px; font-weight: 800;
      color: var(--accent); letter-spacing: -1px;
      line-height: 1.1; margin-bottom: 6px;
    }
    .pr-empty-time {
      font-size: 38px; font-weight: 800;
      color: var(--border); letter-spacing: -1px;
      line-height: 1.1; margin-bottom: 8px;
    }
    .pr-sub {
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 4px;
    }
    .pr-pace {
      font-size: 13px; font-weight: 700; color: var(--text-muted);
    }
    .pr-race {
      font-size: 12px; color: var(--text-muted);
      text-align: right; flex: 1;
    }
    .pr-set-btn { margin-top: 4px; }

    /* ── Modal ── */
    .pr-modal-overlay {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: flex-end; justify-content: center;
    }
    .pr-modal {
      background: var(--bg-surface);
      border-radius: 16px 16px 0 0;
      padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0));
      width: 100%; max-width: 480px;
      max-height: 88svh; overflow-y: auto;
    }
    .pr-modal-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 18px;
    }
    .pr-modal-title { font-size: 17px; font-weight: 800; }

    .pr-time-row {
      display: flex; align-items: center; gap: 6px;
    }
    .pr-time-field {
      display: flex; align-items: center; gap: 4px; flex: 1;
    }
    .pr-time-field input {
      flex: 1; text-align: center; font-size: 22px; font-weight: 700;
      background: var(--bg-raised); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 6px; color: var(--text);
      width: 0;
    }
    .pr-time-field span {
      font-size: 13px; color: var(--text-muted); font-weight: 600;
    }
    .pr-time-sep {
      font-size: 22px; font-weight: 700; color: var(--text-muted);
      padding-bottom: 2px;
    }
  `
  document.head.appendChild(s)
}
