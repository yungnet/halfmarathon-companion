// Shoe Tracker — Strava gear sync + run picker

const STORE_KEY           = 'hm_shoes'
const STRAVA_TOKENS_KEY   = 'hm_strava_tokens'
const STRAVA_CREDS_KEY    = 'hm_strava_creds'
const STRAVA_ACTS_KEY     = 'hm_strava_activities'
const STRAVA_TOKEN_URL    = 'https://www.strava.com/oauth/token'
const STRAVA_API_URL      = 'https://www.strava.com/api/v3'

function load()       { return JSON.parse(localStorage.getItem(STORE_KEY)         || '[]')  }
function save(data)   { localStorage.setItem(STORE_KEY, JSON.stringify(data))               }
function getTokens()  { return JSON.parse(localStorage.getItem(STRAVA_TOKENS_KEY) || 'null') }
function getCreds()   { return JSON.parse(localStorage.getItem(STRAVA_CREDS_KEY)  || 'null') }
function getActs()    { return JSON.parse(localStorage.getItem(STRAVA_ACTS_KEY)   || 'null') }
function stravaOn()   { return !!getTokens() }

// ── All logged Strava activity IDs across all shoes (to avoid double-logging) ──
function loggedStravaIds() {
  return new Set(load().flatMap(s => s.runs.map(r => r.stravaId).filter(Boolean)))
}

export function initShoes(root) {
  _render(root)
}

function _render(root) {
  const connected = stravaOn()

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 12px 4px;">
      <span class="section-header" style="padding:0;">My Shoes</span>
      ${connected ? `<button id="sync-gear-btn" class="btn btn-secondary btn-sm">⚡ Sync Strava gear</button>` : ''}
    </div>
    <div id="shoe-list"></div>
    <div style="padding:0 12px 16px;">
      <button id="add-shoe-btn" class="btn btn-primary btn-full">+ Add Shoe</button>
    </div>
    ${_shoeModalHTML()}
    ${_runModalHTML(connected)}
    ${_gearModalHTML()}
  `

  _injectModalStyles()
  _renderList(root)

  // Shoe modal
  root.querySelector('#add-shoe-btn').addEventListener('click', () => _openShoeModal(root))
  root.querySelector('#shoe-cancel').addEventListener('click', () => _closeModal(root, 'shoe-modal'))
  root.querySelector('#shoe-save').addEventListener('click', () => _saveShoe(root))

  // Run modal
  root.querySelector('#run-cancel').addEventListener('click', () => _closeModal(root, 'run-modal'))
  root.querySelector('#run-save').addEventListener('click', () => _saveRun(root))

  if (connected) {
    root.querySelector('#sync-gear-btn').addEventListener('click', () => _syncGear(root))

    root.querySelector('#run-source')?.addEventListener('change', e => {
      const isStrava = e.target.value === 'strava'
      root.querySelector('#strava-picker-wrap').hidden = !isStrava
      const milesInput = root.querySelector('#run-miles')
      const dateInput  = root.querySelector('#run-date')
      milesInput.readOnly = isStrava
      dateInput.readOnly  = isStrava
      if (!isStrava) {
        milesInput.value = ''
        dateInput.value  = new Date().toISOString().split('T')[0]
        root.querySelector('#run-activity-id').value = ''
        root.querySelector('#strava-act-select').value = ''
      }
    })

    root.querySelector('#strava-act-select')?.addEventListener('change', e => {
      _prefillFromActivity(root, e.target.value)
    })
  }

  const today = new Date().toISOString().split('T')[0]
  root.querySelector('#shoe-date').value = today
  root.querySelector('#run-date').value  = today
}

// ── List rendering ────────────────────────────────────────────────────────────

function _renderList(root) {
  const shoes = load()
  const list  = root.querySelector('#shoe-list')

  if (!shoes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👟</div>
        <p>No shoes yet.<br>${stravaOn() ? 'Tap "Sync Strava gear" to import yours, or add manually.' : 'Add your first pair to start tracking mileage.'}</p>
      </div>`
    return
  }

  list.innerHTML = shoes.map((shoe, idx) => {
    const used  = shoe.startKm + shoe.runs.reduce((s, r) => s + r.km, 0)
    const pct   = Math.min(100, Math.round((used / shoe.retireKm) * 100))
    const bar   = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : ''
    const badge = pct >= 100
      ? `<span class="badge badge-danger">Retire</span>`
      : pct >= 70
      ? `<span class="badge badge-warning">${pct}%</span>`
      : `<span class="badge badge-success">${pct}%</span>`

    const lastRun = shoe.runs.length
      ? new Date(shoe.runs[shoe.runs.length - 1].date).toLocaleDateString()
      : 'No runs yet'

    return `
      <div class="card">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
              <div style="font-size:16px;font-weight:700;">${shoe.name}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Last run: ${lastRun}</div>
            </div>
            ${badge}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
            <span>${used.toFixed(1)} km</span>
            <span style="color:var(--text-muted);">/ ${shoe.retireKm} km</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar ${bar}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-secondary btn-sm" data-log="${idx}" style="flex:1">+ Log Run</button>
            <button class="btn btn-secondary btn-sm" data-history="${idx}" style="flex:1">History</button>
            <button class="btn btn-danger btn-sm" data-delete="${idx}">✕</button>
          </div>
          <div id="history-${idx}" hidden></div>
        </div>
      </div>`
  }).join('')

  list.querySelectorAll('[data-log]').forEach(btn =>
    btn.addEventListener('click', () => _openRunModal(root, parseInt(btn.dataset.log))))
  list.querySelectorAll('[data-history]').forEach(btn =>
    btn.addEventListener('click', () => _toggleHistory(root, parseInt(btn.dataset.history))))
  list.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('Delete this shoe and all its runs?')) return
      const shoes = load(); shoes.splice(parseInt(btn.dataset.delete), 1); save(shoes); _renderList(root)
    }))
}

// ── Strava gear sync ──────────────────────────────────────────────────────────

async function _syncGear(root) {
  const btn = root.querySelector('#sync-gear-btn')
  btn.disabled = true; btn.textContent = 'Loading…'

  const token = await _freshAccessToken()
  if (!token) { btn.disabled = false; btn.textContent = '⚡ Sync Strava gear'; return }

  try {
    let gear = []

    // Strategy 1: /athlete endpoint — only returns shoes with profile:read_all scope
    const res     = await fetch(`${STRAVA_API_URL}/athlete`, { headers: { Authorization: `Bearer ${token}` } })
    const athlete = await res.json()
    if (res.ok && Array.isArray(athlete.shoes) && athlete.shoes.length) {
      gear = athlete.shoes
    }

    // Strategy 2: extract gear IDs from cached activities (works with activity:read_all alone)
    if (!gear.length) {
      const acts    = getActs() || []
      const gearIds = [...new Set(
        acts.filter(a => a.gear_id?.startsWith('g')).map(a => a.gear_id)
      )]

      if (!gearIds.length) throw new Error('No shoe gear IDs found in your cached activities. Make sure you have runs assigned to shoes in Strava, then tap ↻ Refresh on the Routes tab first.')

      const results = await Promise.all(gearIds.map(async id => {
        const r = await fetch(`${STRAVA_API_URL}/gear/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        return r.ok ? r.json() : null
      }))
      gear = results.filter(Boolean)
    }

    const existing        = load()
    const existingGearIds = new Set(existing.map(s => s.stravaGearId).filter(Boolean))
    _openGearModal(root, gear, existingGearIds)
  } catch (err) {
    alert(`Strava sync failed: ${err.message}`)
  } finally {
    btn.disabled = false; btn.textContent = '⚡ Sync Strava gear'
  }
}

function _openGearModal(root, allGear, existingGearIds) {
  const modal = root.querySelector('#gear-modal')

  root.querySelector('#gear-list').innerHTML = allGear.length ? allGear.map(g => {
    const alreadyAdded = existingGearIds.has(g.id)
    const km = (g.distance / 1000).toFixed(0)
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg-raised);cursor:${alreadyAdded ? 'default' : 'pointer'};">
        <input type="checkbox" value="${g.id}" data-name="${g.name}" data-km="${km}"
          ${alreadyAdded ? 'disabled checked' : ''}
          style="width:18px;height:18px;accent-color:var(--accent);" />
        <div>
          <div style="font-size:14px;font-weight:600;">${g.name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${km} km · ${alreadyAdded ? '✓ Already added' : 'Not yet added'}</div>
        </div>
      </label>`
  }).join('') : `
    <div style="padding:16px 0;font-size:14px;color:var(--text-muted);line-height:1.6;">
      <p style="margin-bottom:8px;">No shoes found on your Strava account.</p>
      <p>To use this feature, add your shoes in Strava:<br>
      <strong style="color:var(--text);">strava.com → Settings → My Gear → Add Shoes</strong></p>
      <p style="margin-top:8px;">Or close this and use <strong style="color:var(--text);">"+ Add Shoe"</strong> to add them manually.</p>
    </div>`

  modal.hidden = false

  root.querySelector('#gear-cancel').onclick = () => { modal.hidden = true }
  root.querySelector('#gear-import').onclick = () => {
    const checked = [...root.querySelectorAll('#gear-list input[type=checkbox]:not(:disabled):checked')]
    if (!checked.length) { modal.hidden = true; return }

    const shoes = load()
    const acts  = getActs() || []
    const logged = loggedStravaIds()

    checked.forEach(cb => {
      const gearId   = cb.value
      const gearName = cb.dataset.name

      // Auto-log matching Strava runs not yet assigned anywhere
      const matchingRuns = acts
        .filter(a => a.gear_id === gearId && !logged.has(a.id))
        .map(a => ({
          km:        parseFloat((a.distance / 1000).toFixed(2)),
          date:      a.start_date_local.split('T')[0],
          notes:     a.name || '',
          stravaId:  a.id,
        }))

      shoes.push({
        id:           Date.now() + Math.random(),
        name:         gearName,
        stravaGearId: gearId,
        startKm:   0,
        retireKm:  800,
        purchaseDate: '',
        runs:         matchingRuns,
      })
    })

    save(shoes)
    modal.hidden = true
    _renderList(root)
  }
}

// ── Run modal ─────────────────────────────────────────────────────────────────

function _openRunModal(root, idx) {
  root.querySelector('#run-shoe-id').value = idx
  root.querySelector('#run-miles').value   = ''
  root.querySelector('#run-notes').value   = ''
  root.querySelector('#run-activity-id').value = ''
  root.querySelector('#run-date').value    = new Date().toISOString().split('T')[0]

  if (stravaOn()) {
    _populateActivityPicker(root)
    root.querySelector('#run-source').value  = 'strava'
    root.querySelector('#strava-picker-wrap').hidden = false
    root.querySelector('#manual-entry-wrap').hidden  = true
  }

  root.querySelector('#run-modal').hidden = false
}

function _populateActivityPicker(root) {
  const select = root.querySelector('#strava-act-select')
  if (!select) return

  const acts   = getActs() || []
  const logged = loggedStravaIds()
  const runs   = acts
    .filter(a => (a.type === 'Run' || a.sport_type === 'Run') && !logged.has(a.id))
    .slice(0, 50)

  select.innerHTML = `<option value="">— Pick a run —</option>` +
    runs.map(a => {
      const km   = (a.distance / 1000).toFixed(2)
      const date = new Date(a.start_date_local).toLocaleDateString('en-CA')
      return `<option value="${a.id}">${date} · ${km} km · ${a.name}</option>`
    }).join('')
}

function _prefillFromActivity(root, actId) {
  const acts = getActs() || []
  const a    = acts.find(a => String(a.id) === String(actId))
  if (!a) return
  root.querySelector('#run-miles').value       = (a.distance / 1000).toFixed(2)
  root.querySelector('#run-date').value        = a.start_date_local.split('T')[0]
  root.querySelector('#run-notes').value       = a.name || ''
  root.querySelector('#run-activity-id').value = a.id
}

// ── Save handlers ─────────────────────────────────────────────────────────────

function _saveShoe(root) {
  const name = root.querySelector('#shoe-name').value.trim()
  if (!name) { root.querySelector('#shoe-name').focus(); return }

  const shoes = load()
  shoes.push({
    id:           Date.now(),
    name,
    stravaGearId: null,
    startKm:   parseFloat(root.querySelector('#shoe-start-km').value) || 0,
    retireKm:  parseFloat(root.querySelector('#shoe-retire').value)      || 800,
    purchaseDate: root.querySelector('#shoe-date').value,
    runs:         [],
  })
  save(shoes)
  _closeModal(root, 'shoe-modal')
  _renderList(root)
}

function _saveRun(root) {
  const idx = parseInt(root.querySelector('#run-shoe-id').value)
  const km  = parseFloat(root.querySelector('#run-miles').value)
  if (!km || km <= 0) { root.querySelector('#run-miles').focus(); return }

  const shoes = load()
  shoes[idx].runs.push({
    km,
    date:      root.querySelector('#run-date').value,
    notes:     root.querySelector('#run-notes').value.trim(),
    stravaId:  root.querySelector('#run-activity-id').value || null,
  })
  save(shoes)
  _closeModal(root, 'run-modal')
  _renderList(root)
}

// ── History ───────────────────────────────────────────────────────────────────

function _toggleHistory(root, idx) {
  const el = root.querySelector(`#history-${idx}`)
  if (!el.hidden) { el.hidden = true; return }

  const shoe = load()[idx]
  if (!shoe.runs.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted);margin-top:8px;">No runs logged yet.</p>'
  } else {
    el.innerHTML = `
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
        ${[...shoe.runs].reverse().map(r => `
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid var(--bg-raised);">
            <span style="color:var(--text-muted);">${new Date(r.date).toLocaleDateString('en-CA')}${r.notes ? ` · ${r.notes}` : ''}${r.stravaId ? ' <span style="color:var(--accent);">⚡</span>' : ''}</span>
            <span style="font-weight:600;">${r.km} km</span>
          </div>`).join('')}
      </div>`
  }
  el.hidden = false
}

// ── Strava token refresh ──────────────────────────────────────────────────────

async function _freshAccessToken() {
  const tokens = getTokens()
  const creds  = getCreds()
  if (!tokens || !creds) return null
  if (tokens.expiresAt > Date.now() / 1000 + 60) return tokens.accessToken

  try {
    const res  = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type:    'refresh_token',
      }),
    })
    const data = await res.json()
    if (data.errors) return null
    const updated = { ...tokens, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at }
    localStorage.setItem(STRAVA_TOKENS_KEY, JSON.stringify(updated))
    return updated.accessToken
  } catch { return null }
}

// ── Modal HTML ────────────────────────────────────────────────────────────────

function _closeModal(root, id) { root.querySelector(`#${id}`).hidden = true }
function _openShoeModal(root)  {
  root.querySelector('#shoe-name').value        = ''
  root.querySelector('#shoe-start-km').value = '0'
  root.querySelector('#shoe-retire').value      = '800'
  root.querySelector('#shoe-modal').hidden       = false
}

function _shoeModalHTML() { return `
  <div id="shoe-modal" class="modal-backdrop" hidden>
    <div class="modal-sheet">
      <h2 class="modal-title">Add Shoe</h2>
      <div class="form-group">
        <label>Brand &amp; Model</label>
        <input id="shoe-name" type="text" placeholder="Nike Vomero 17" />
      </div>
      <div class="row-2">
        <div class="form-group">
          <label>Starting km</label>
          <input id="shoe-start-km" type="number" min="0" value="0" />
        </div>
        <div class="form-group">
          <label>Retire at (km)</label>
          <input id="shoe-retire" type="number" min="1" value="800" />
        </div>
      </div>
      <div class="form-group">
        <label>Date purchased</label>
        <input id="shoe-date" type="date" />
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button id="shoe-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="shoe-save"   class="btn btn-primary"   style="flex:1">Save</button>
      </div>
    </div>
  </div>`
}

function _runModalHTML(stravaConnected) { return `
  <div id="run-modal" class="modal-backdrop" hidden>
    <div class="modal-sheet">
      <h2 class="modal-title">Log Run</h2>
      <input id="run-shoe-id"     type="hidden" />
      <input id="run-activity-id" type="hidden" />

      ${stravaConnected ? `
      <div class="form-group">
        <label>Source</label>
        <select id="run-source">
          <option value="strava">Pick from Strava</option>
          <option value="manual">Enter manually</option>
        </select>
      </div>
      <div id="strava-picker-wrap" class="form-group">
        <label>Strava activity</label>
        <select id="strava-act-select"><option value="">— Pick a run —</option></select>
      </div>` : ''}

      <div class="row-2">
        <div class="form-group">
          <label>Distance (km)</label>
          <input id="run-miles" type="number" min="0.1" step="0.01" placeholder="10.0" ${stravaConnected ? 'readonly' : ''} />
        </div>
        <div class="form-group">
          <label>Date</label>
          <input id="run-date" type="date" ${stravaConnected ? 'readonly' : ''} />
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input id="run-notes" type="text" placeholder="Easy recovery, track workout…" />
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button id="run-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="run-save"   class="btn btn-primary"   style="flex:1">Log</button>
      </div>
    </div>
  </div>`
}

function _gearModalHTML() { return `
  <div id="gear-modal" class="modal-backdrop" hidden>
    <div class="modal-sheet">
      <h2 class="modal-title">Import Strava Gear</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
        Select shoes to import. Historical runs already assigned in Strava will be logged automatically.
      </p>
      <div id="gear-list"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button id="gear-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button id="gear-import" class="btn btn-primary"   style="flex:1">Import selected</button>
      </div>
    </div>
  </div>`
}

function _injectModalStyles() {
  if (document.getElementById('shoe-modal-styles')) return
  const s = document.createElement('style')
  s.id = 'shoe-modal-styles'
  s.textContent = `
    .modal-backdrop { position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;backdrop-filter:blur(4px); }
    .modal-backdrop[hidden] { display:none !important; }
    .modal-sheet { background:var(--bg-surface);border-top:1px solid var(--border);border-radius:20px 20px 0 0;padding:20px 16px calc(20px + var(--safe-bot));width:100%;max-height:85dvh;overflow-y:auto; }
    .modal-title { font-size:18px;font-weight:700;margin-bottom:16px; }
  `
  document.head.appendChild(s)
}
