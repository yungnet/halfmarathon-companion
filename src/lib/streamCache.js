// Strava stream fetcher with LRU localStorage cache

const INDEX_KEY  = 'hm_stream_index'
const STREAM_PFX = 'hm_stream_'
const TOKENS_KEY = 'hm_strava_tokens'
const CREDS_KEY  = 'hm_strava_creds'
const API_BASE   = 'https://www.strava.com/api/v3'
const TOKEN_URL  = 'https://www.strava.com/oauth/token'
const MAX_BYTES  = 4 * 1024 * 1024  // 4 MB total cache

export async function fetchStream(activityId) {
  const cached = _getCached(activityId)
  if (cached) return cached

  const token = await _freshToken()
  if (!token) throw new Error('Not authenticated — connect Strava on the Routes tab first')

  const res = await fetch(
    `${API_BASE}/activities/${activityId}/streams` +
    `?keys=heartrate,velocity_smooth,time,distance&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Strava stream API returned ${res.status}`)

  const data = await res.json()
  _cache(activityId, data)
  return data
}

// ── Cache ─────────────────────────────────────────────────────────────────────

function _getCached(id) {
  const raw = localStorage.getItem(STREAM_PFX + id)
  if (!raw) return null
  // Bump LRU timestamp
  const idx = _getIndex()
  const e   = idx.find(e => e.id === id)
  if (e) { e.ts = Date.now(); _saveIndex(idx) }
  return JSON.parse(raw)
}

function _cache(id, data) {
  const str   = JSON.stringify(data)
  const bytes = str.length * 2  // rough UTF-16 byte estimate
  const idx   = _getIndex().filter(e => e.id !== id)

  idx.push({ id, ts: Date.now(), bytes })
  idx.sort((a, b) => a.ts - b.ts)  // oldest first

  // Evict oldest entries until under 4 MB
  let total = idx.reduce((s, e) => s + e.bytes, 0)
  while (total > MAX_BYTES && idx.length > 1) {
    const evicted = idx.shift()
    localStorage.removeItem(STREAM_PFX + evicted.id)
    total -= evicted.bytes
  }
  _saveIndex(idx)

  try {
    localStorage.setItem(STREAM_PFX + id, str)
  } catch {
    // Quota exceeded — evict one more and retry once
    if (idx.length > 0) {
      const e = idx.shift()
      localStorage.removeItem(STREAM_PFX + e.id)
      _saveIndex(idx)
      try { localStorage.setItem(STREAM_PFX + id, str) } catch { /* give up */ }
    }
  }
}

function _getIndex()     { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') }
function _saveIndex(idx) { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)) }

// ── Token refresh (duplicated here to avoid circular dep) ─────────────────────

async function _freshToken() {
  const tokens = JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null')
  const creds  = JSON.parse(localStorage.getItem(CREDS_KEY)  || 'null')
  if (!tokens || !creds) return null
  if (tokens.expiresAt > Date.now() / 1000 + 60) return tokens.accessToken
  try {
    const res  = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: creds.clientId, client_secret: creds.clientSecret,
        refresh_token: tokens.refreshToken, grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    if (data.errors) return null
    const updated = { ...tokens, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at }
    localStorage.setItem(TOKENS_KEY, JSON.stringify(updated))
    return updated.accessToken
  } catch { return null }
}
