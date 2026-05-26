// Routes — Strava activities as stacked transparent polylines + run list

const CREDS_KEY      = 'hm_strava_creds'
const TOKENS_KEY     = 'hm_strava_tokens'
const ACTIVITIES_KEY = 'hm_strava_activities'

const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_URL   = 'https://www.strava.com/api/v3'

let map            = null
let polylineLayers = new Map()  // activityId → L.polyline
let selectedId     = null

export function initHeatmap(root) {
  const params = new URLSearchParams(window.location.search)
  const code   = params.get('code')
  const error  = params.get('error')
  if (error) history.replaceState({}, '', window.location.pathname)
  _render(root, error ? null : code)
}

// ── State router ──────────────────────────────────────────────────────────────

function _render(root, oauthCode) {
  const creds  = _getCreds()
  const tokens = _getTokens()
  if (!creds)    return _renderSetup(root)
  if (oauthCode) return _renderExchanging(root, oauthCode)
  if (!tokens)   return _renderConnect(root, creds)
  _renderMap(root, creds, tokens)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function _renderSetup(root) {
  root.innerHTML = `
    <p class="section-header">Connect to Strava</p>
    <div class="card">
      <div class="card-body">
        <ol style="font-size:13px;color:var(--text-muted);line-height:1.8;padding-left:18px;margin-bottom:16px;">
          <li>Go to <strong style="color:var(--text);">strava.com/settings/api</strong></li>
          <li>Create an app (any name/website)</li>
          <li>Set <strong style="color:var(--text);">Authorization Callback Domain</strong> to <code style="color:var(--accent);">yungnet.github.io</code></li>
          <li>Paste your Client ID and Secret below</li>
        </ol>
        <div class="form-group">
          <label>Client ID</label>
          <input id="strava-client-id" type="number" placeholder="12345" inputmode="numeric" />
        </div>
        <div class="form-group">
          <label>Client Secret</label>
          <input id="strava-client-secret" type="password" placeholder="••••••••••••••••••••" />
        </div>
        <button id="save-creds" class="btn btn-primary btn-full">Save & Connect →</button>
      </div>
    </div>`

  root.querySelector('#save-creds').addEventListener('click', () => {
    const id     = root.querySelector('#strava-client-id').value.trim()
    const secret = root.querySelector('#strava-client-secret').value.trim()
    if (!id || !secret) return
    localStorage.setItem(CREDS_KEY, JSON.stringify({ clientId: id, clientSecret: secret }))
    _render(root, null)
  })
}

// ── Connect ───────────────────────────────────────────────────────────────────

function _renderConnect(root, creds) {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:48px 24px;text-align:center;">
      <div style="font-size:64px;margin-bottom:20px;">🏃</div>
      <h2 style="margin-bottom:8px;">Connect Strava</h2>
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:28px;line-height:1.6;max-width:300px;">
        Authorize read access to pull your runs and display them as route overlays.
      </p>
      <button id="connect-btn" class="btn btn-primary" style="padding:14px 36px;font-size:16px;">Connect with Strava</button>
      <button id="reset-creds" class="btn btn-secondary btn-sm" style="margin-top:16px;">Change credentials</button>
    </div>`

  root.querySelector('#connect-btn').addEventListener('click', () => {
    const url = new URL(STRAVA_AUTH_URL)
    url.searchParams.set('client_id',     creds.clientId)
    url.searchParams.set('redirect_uri',  _redirectUri())
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope',         'activity:read_all,profile:read_all')
    window.location.href = url.toString()
  })

  root.querySelector('#reset-creds').addEventListener('click', () => {
    localStorage.removeItem(CREDS_KEY)
    localStorage.removeItem(TOKENS_KEY)
    _render(root, null)
  })
}

// ── OAuth exchange ────────────────────────────────────────────────────────────

async function _renderExchanging(root, code) {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:48px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">⏳</div>
      <p style="color:var(--text-muted);">Connecting to Strava…</p>
    </div>`

  history.replaceState({}, '', window.location.pathname)
  const creds = _getCreds()
  try {
    const res  = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret, code, grant_type: 'authorization_code' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`)
    _saveTokens(data)
    _renderMap(root, creds, _getTokens())
  } catch (err) {
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:48px 24px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">❌</div>
        <p style="color:var(--danger);margin-bottom:20px;">${err.message}</p>
        <button id="try-again" class="btn btn-secondary">Try again</button>
      </div>`
    root.querySelector('#try-again').addEventListener('click', () => _render(root, null))
  }
}

// ── Map view ──────────────────────────────────────────────────────────────────

function _renderMap(root, creds, tokens) {
  root.innerHTML = `
    <div class="route-toolbar">
      <span id="rt-athlete" class="rt-label"></span>
      <button id="rt-refresh"    class="btn btn-secondary btn-sm">↻ Refresh</button>
      <button id="rt-disconnect" class="btn btn-secondary btn-sm">Disconnect</button>
    </div>
    <div id="leaflet-map"></div>
    <div id="run-list-panel">
      <div id="run-list-inner"></div>
    </div>`

  _injectRouteStyles()

  root.querySelector('#rt-refresh').addEventListener('click', () => {
    localStorage.removeItem(ACTIVITIES_KEY)
    polylineLayers.clear()
    selectedId = null
    _loadAndRender(root, creds, tokens)
  })
  root.querySelector('#rt-disconnect').addEventListener('click', () => {
    if (!confirm('Disconnect Strava and clear cached data?')) return
    localStorage.removeItem(TOKENS_KEY)
    localStorage.removeItem(ACTIVITIES_KEY)
    polylineLayers.clear()
    selectedId = null
    _render(root, null)
  })

  _initMap(root.querySelector('#leaflet-map'))
  _loadAndRender(root, creds, tokens)
}

async function _loadAndRender(root, creds, tokens) {
  const listInner = root.querySelector('#run-list-inner')
  if (listInner) listInner.innerHTML = `<div class="rt-loading">Loading runs…</div>`

  const freshTokens = await _ensureFreshToken(creds, tokens)
  if (!freshTokens) { localStorage.removeItem(TOKENS_KEY); _render(root, null); return }

  try {
    const activities = await _fetchRunActivities(freshTokens.accessToken)
    const totalKm    = activities.reduce((s, a) => s + a.distance / 1000, 0)

    const athleteEl = root.querySelector('#rt-athlete')
    if (athleteEl) {
      athleteEl.textContent = `${freshTokens.athleteName || 'My runs'} · ${activities.length} runs · ${totalKm.toFixed(0)} km`
    }

    _drawPolylines(activities)
    _renderRunList(root, activities)
  } catch (err) {
    if (listInner) listInner.innerHTML = `<div class="rt-loading" style="color:var(--danger);">Error: ${err.message}</div>`
  }
}

// ── Leaflet map ───────────────────────────────────────────────────────────────

function _initMap(el) {
  import('leaflet').then(({ default: L }) => {
    window._L = L
    map = L.map(el, { zoomControl: true }).setView([37.7749, -122.4194], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    map._ready = true
  })
}

function _drawPolylines(activities) {
  const poll = setInterval(() => {
    if (!map?._ready || !window._L) return
    clearInterval(poll)

    const L = window._L

    // Clear existing layers
    polylineLayers.forEach(layer => map.removeLayer(layer))
    polylineLayers.clear()

    const allLatLngs = []

    activities.forEach(a => {
      if (!a.map?.summary_polyline) return
      const pts = _decodePolyline(a.map.summary_polyline)
      if (!pts.length) return

      const layer = L.polyline(pts, {
        color:   '#f97316',
        weight:  2.5,
        opacity: 0.25,
      }).addTo(map)

      layer.on('click', () => _selectRun(a.id))
      polylineLayers.set(a.id, layer)
      allLatLngs.push(...pts)
    })

    if (allLatLngs.length) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [20, 20] })
    }
  }, 80)
}

function _selectRun(actId) {
  // Deselect previous
  if (selectedId && polylineLayers.has(selectedId)) {
    polylineLayers.get(selectedId).setStyle({ color: '#f97316', weight: 2.5, opacity: 0.25 })
  }

  if (selectedId === actId) {
    // Clicking same run deselects
    selectedId = null
    document.querySelectorAll('.run-list-item').forEach(el => el.classList.remove('selected'))
    return
  }

  selectedId = actId

  // Highlight selected polyline in blue
  if (polylineLayers.has(actId)) {
    const layer = polylineLayers.get(actId)
    layer.setStyle({ color: '#3b82f6', weight: 4, opacity: 1 })
    layer.bringToFront()
    map.fitBounds(layer.getBounds(), { padding: [32, 32] })
  }

  // Highlight list item
  document.querySelectorAll('.run-list-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === String(actId))
  })

  // Scroll list item into view
  const el = document.querySelector(`.run-list-item[data-id="${actId}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ── Run list ──────────────────────────────────────────────────────────────────

function _renderRunList(root, activities) {
  const inner = root.querySelector('#run-list-inner')
  if (!inner) return

  const withRoutes = activities.filter(a => a.map?.summary_polyline)
  const noRoute    = activities.length - withRoutes.length

  if (!activities.length) {
    inner.innerHTML = `<div class="rt-loading">No runs found.</div>`
    return
  }

  inner.innerHTML = `
    <div class="rt-list-header">
      ${activities.length} runs${noRoute ? ` · ${noRoute} without GPS hidden` : ''}
    </div>
    ${withRoutes.map(a => {
      const km   = (a.distance / 1000).toFixed(2)
      const pace = _formatPace(a.moving_time, a.distance)
      const time = _formatDuration(a.moving_time)
      const date = new Date(a.start_date_local).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
      const hr   = a.average_heartrate ? `· <span style="color:#ef4444;">♥ ${Math.round(a.average_heartrate)}</span>` : ''
      return `
        <div class="run-list-item" data-id="${a.id}">
          <div class="rli-top">
            <span class="rli-name">${a.name}</span>
            <span class="rli-dist">${km} km</span>
          </div>
          <div class="rli-bottom">
            <span class="rli-date">${date}</span>
            <span class="rli-meta">${pace} /km · ${time} ${hr}</span>
          </div>
        </div>`
    }).join('')}`

  inner.querySelectorAll('.run-list-item').forEach(el => {
    el.addEventListener('click', () => _selectRun(parseInt(el.dataset.id)))
  })
}

// ── Strava API ────────────────────────────────────────────────────────────────

async function _fetchRunActivities(accessToken) {
  const cached = localStorage.getItem(ACTIVITIES_KEY)
  if (cached) return JSON.parse(cached)

  const activities = []
  let page = 1
  while (true) {
    const res   = await fetch(`${STRAVA_API_URL}/athlete/activities?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Strava API ${res.status}`)
    const batch = await res.json()
    if (!batch.length) break
    activities.push(...batch.filter(a => a.type === 'Run' || a.sport_type === 'Run'))
    if (batch.length < 100) break
    if (++page > 10) break
  }

  localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(activities))
  return activities
}

async function _ensureFreshToken(creds, tokens) {
  if (tokens.expiresAt > Date.now() / 1000 + 60) return tokens
  try {
    const res  = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }),
    })
    const data = await res.json()
    if (data.errors) return null
    _saveTokens(data)
    return _getTokens()
  } catch { return null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _decodePolyline(encoded) {
  const pts = []; let i = 0, lat = 0, lng = 0
  while (i < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    pts.push([lat / 1e5, lng / 1e5])
  }
  return pts
}

function _formatPace(movingTimeSec, distanceMeters) {
  if (!distanceMeters) return '—'
  const minPerKm = (movingTimeSec / 60) / (distanceMeters / 1000)
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function _formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = (seconds % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`
}

function _redirectUri() { return window.location.origin + window.location.pathname }
function _getCreds()    { return JSON.parse(localStorage.getItem(CREDS_KEY)   || 'null') }
function _getTokens()   { return JSON.parse(localStorage.getItem(TOKENS_KEY)  || 'null') }
function _saveTokens(data) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify({
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    data.expires_at,
    athleteName:  data.athlete ? `${data.athlete.firstname} ${data.athlete.lastname}` : null,
  }))
}

// ── Styles ────────────────────────────────────────────────────────────────────

function _injectRouteStyles() {
  if (document.getElementById('route-styles')) return
  const s = document.createElement('style')
  s.id = 'route-styles'
  s.textContent = `
    /* Only apply flex layout when the tab is actually active — fixes draw-on-top glitch */
    #tab-heatmap.active {
      display: flex !important; flex-direction: column; overflow: hidden;
    }
    #tab-heatmap.active #heatmap-root {
      display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0;
    }
    #run-list-panel { flex: 1; min-height: 0; overflow-y: auto; }

    .route-toolbar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; flex-shrink: 0;
      background: var(--bg-surface); border-bottom: 1px solid var(--border);
    }
    .rt-label {
      flex: 1; font-size: 12px; color: var(--text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #leaflet-map {
      height: 42dvh; min-height: 220px; flex-shrink: 0;
    }
    #run-list-panel {
      flex: 1; overflow-y: auto;
      border-top: 1px solid var(--border);
    }
    .rt-list-header {
      padding: 8px 14px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.6px;
      color: var(--text-muted); border-bottom: 1px solid var(--border);
      position: sticky; top: 0; background: var(--bg-base); z-index: 1;
    }
    .rt-loading {
      padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 14px;
    }
    .run-list-item {
      padding: 10px 14px; border-bottom: 1px solid var(--border);
      cursor: pointer; transition: background 0.12s;
    }
    .run-list-item:active, .run-list-item:hover { background: var(--bg-surface); }
    .run-list-item.selected { background: var(--bg-surface); border-left: 3px solid var(--danger); }
    .rli-top {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 3px;
    }
    .rli-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
    .rli-dist { font-size: 14px; font-weight: 700; color: var(--accent); flex-shrink: 0; }
    .rli-bottom { display: flex; justify-content: space-between; }
    .rli-date  { font-size: 12px; color: var(--text-muted); }
    .rli-meta  { font-size: 12px; color: var(--text-muted); }
  `
  document.head.appendChild(s)
}
