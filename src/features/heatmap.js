// Route Heatmap — GPX import + Leaflet heat overlay

let map = null

export function initHeatmap(root) {
  root.innerHTML = `
    <div class="heatmap-toolbar">
      <label class="import-btn btn btn-primary btn-sm">
        + Import GPX
        <input type="file" id="gpx-input" accept=".gpx" multiple hidden />
      </label>
      <button id="clear-routes" class="btn btn-secondary btn-sm">Clear</button>
    </div>
    <div id="leaflet-map"></div>
    <div id="route-list"></div>
  `

  // Inline toolbar styles
  Object.assign(root.querySelector('.heatmap-toolbar').style, {
    display: 'flex',
    gap: '8px',
    padding: '10px 12px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    alignItems: 'center',
  })

  const mapEl = root.querySelector('#leaflet-map')
  mapEl.style.cssText = 'height: calc(100dvh - var(--header-h) - var(--tab-h) - 52px - 44px); min-height: 280px;'

  _initMap(mapEl)
  _loadSavedRoutes()

  root.querySelector('#gpx-input').addEventListener('change', e => {
    Array.from(e.target.files).forEach(f => _importGPX(f))
    e.target.value = ''
  })

  root.querySelector('#clear-routes').addEventListener('click', () => {
    if (!confirm('Remove all imported routes?')) return
    localStorage.removeItem('hm_routes')
    location.reload()
  })
}

function _initMap(el) {
  // dynamic import so Leaflet only loads when this tab is opened
  import('leaflet').then(({ default: L }) => {
    window._L = L
    map = L.map(el, { zoomControl: true }).setView([37.7749, -122.4194], 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    map._heatPoints = []
    _loadSavedRoutes()
    map._ready = true
  })
}

function _importGPX(file) {
  const reader = new FileReader()
  reader.onload = e => {
    const text = e.target.result
    const points = _parseGPX(text)
    if (!points.length) return alert('No track points found in GPX.')

    const saved = JSON.parse(localStorage.getItem('hm_routes') || '[]')
    saved.push({ name: file.name, date: new Date().toISOString(), points })
    localStorage.setItem('hm_routes', JSON.stringify(saved))

    _renderRoute({ name: file.name, points }, true)
    _renderRouteList(saved)
  }
  reader.readAsText(file)
}

function _parseGPX(text) {
  const parser = new DOMParser()
  const xml = parser.parseFromString(text, 'application/xml')
  const trkpts = xml.querySelectorAll('trkpt')
  return Array.from(trkpts).map(pt => [
    parseFloat(pt.getAttribute('lat')),
    parseFloat(pt.getAttribute('lon')),
  ])
}

function _renderRoute(route, fitBounds) {
  const waitForMap = setInterval(() => {
    if (!map || !map._ready || !window._L) return
    clearInterval(waitForMap)

    const L = window._L
    map._heatPoints = map._heatPoints || []
    route.points.forEach(p => map._heatPoints.push([p[0], p[1], 0.5]))

    if (map._heatLayer) map.removeLayer(map._heatLayer)

    // leaflet.heat via dynamic import fallback — draw as polyline if unavailable
    try {
      map._heatLayer = L.heatLayer(map._heatPoints, {
        radius: 14, blur: 18, maxZoom: 17,
        gradient: { 0.3: '#1e40af', 0.6: '#f97316', 1.0: '#ef4444' },
      }).addTo(map)
    } catch {
      L.polyline(route.points, { color: '#f97316', weight: 3, opacity: 0.7 }).addTo(map)
    }

    if (fitBounds && route.points.length) {
      map.fitBounds(L.latLngBounds(route.points), { padding: [24, 24] })
    }
  }, 80)
}

function _loadSavedRoutes() {
  const saved = JSON.parse(localStorage.getItem('hm_routes') || '[]')
  if (!saved.length) return

  // Merge all points for heat, fit to last imported
  const allPoints = saved.flatMap(r => r.points)
  _renderRoute({ name: 'all', points: allPoints }, true)

  const listEl = document.getElementById('route-list')
  if (listEl) _renderRouteList(saved)
}

function _renderRouteList(routes) {
  const el = document.getElementById('route-list')
  if (!el) return
  if (!routes.length) { el.innerHTML = ''; return }

  el.innerHTML = `
    <p class="section-header">Imported routes (${routes.length})</p>
    ${routes.map((r, i) => `
      <div class="card" style="margin:0 12px 8px;">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:14px;font-weight:600;">${r.name}</div>
            <div style="font-size:12px;color:var(--text-muted);">${r.points.length} pts · ${new Date(r.date).toLocaleDateString()}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-delete="${i}">✕</button>
        </div>
      </div>
    `).join('')}
  `

  el.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const saved = JSON.parse(localStorage.getItem('hm_routes') || '[]')
      saved.splice(parseInt(btn.dataset.delete), 1)
      localStorage.setItem('hm_routes', JSON.stringify(saved))
      location.reload()
    })
  })
}
