// Shoe Tracker — log pairs, assign runs, track mileage

const STORE_KEY = 'hm_shoes'

function load() { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') }
function save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)) }

export function initShoes(root) {
  root.innerHTML = `
    <p class="section-header">My Shoes</p>
    <div id="shoe-list"></div>

    <div style="padding: 0 12px 12px;">
      <button id="add-shoe-btn" class="btn btn-primary btn-full">+ Add Shoe</button>
    </div>

    <!-- Add shoe modal -->
    <div id="shoe-modal" class="modal-backdrop" hidden>
      <div class="modal-sheet">
        <h2 class="modal-title">Add Shoe</h2>
        <div class="form-group">
          <label>Brand & Model</label>
          <input id="shoe-name" type="text" placeholder="Nike Vomero 17" />
        </div>
        <div class="row-2">
          <div class="form-group">
            <label>Starting miles</label>
            <input id="shoe-start-miles" type="number" min="0" value="0" />
          </div>
          <div class="form-group">
            <label>Retire at (mi)</label>
            <input id="shoe-retire" type="number" min="1" value="500" />
          </div>
        </div>
        <div class="form-group">
          <label>Date purchased</label>
          <input id="shoe-date" type="date" />
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="shoe-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
          <button id="shoe-save" class="btn btn-primary" style="flex:1">Save</button>
        </div>
      </div>
    </div>

    <!-- Log run modal -->
    <div id="run-modal" class="modal-backdrop" hidden>
      <div class="modal-sheet">
        <h2 class="modal-title">Log Run</h2>
        <input id="run-shoe-id" type="hidden" />
        <div class="form-group">
          <label>Distance (miles)</label>
          <input id="run-miles" type="number" min="0.1" step="0.1" placeholder="6.2" />
        </div>
        <div class="form-group">
          <label>Date</label>
          <input id="run-date" type="date" />
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <input id="run-notes" type="text" placeholder="Easy recovery run" />
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="run-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>
          <button id="run-save" class="btn btn-primary" style="flex:1">Log</button>
        </div>
      </div>
    </div>
  `

  _injectModalStyles()
  _render(root)

  root.querySelector('#add-shoe-btn').addEventListener('click', () => _openShoeModal(root))
  root.querySelector('#shoe-cancel').addEventListener('click', () => _closeModal(root, 'shoe-modal'))
  root.querySelector('#shoe-save').addEventListener('click', () => _saveShoe(root))
  root.querySelector('#run-cancel').addEventListener('click', () => _closeModal(root, 'run-modal'))
  root.querySelector('#run-save').addEventListener('click', () => _saveRun(root))

  // Set today as default date
  const today = new Date().toISOString().split('T')[0]
  root.querySelector('#shoe-date').value = today
  root.querySelector('#run-date').value = today
}

function _render(root) {
  const shoes = load()
  const list = root.querySelector('#shoe-list')

  if (!shoes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👟</div>
        <p>No shoes yet.<br>Add your first pair to start tracking mileage.</p>
      </div>`
    return
  }

  list.innerHTML = shoes.map((shoe, idx) => {
    const used = shoe.startMiles + shoe.runs.reduce((s, r) => s + r.miles, 0)
    const pct = Math.min(100, Math.round((used / shoe.retireMiles) * 100))
    const barClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : ''
    const statusLabel = pct >= 100 ? `<span class="badge badge-danger">Retire</span>`
      : pct >= 70 ? `<span class="badge badge-warning">${pct}%</span>`
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
            ${statusLabel}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
            <span>${used.toFixed(1)} mi</span>
            <span style="color:var(--text-muted);">/ ${shoe.retireMiles} mi</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar ${barClass}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-secondary btn-sm" data-log="${idx}" style="flex:1">+ Log Run</button>
            <button class="btn btn-secondary btn-sm" data-history="${idx}" style="flex:1">History</button>
            <button class="btn btn-danger btn-sm" data-delete="${idx}">✕</button>
          </div>
          <div id="history-${idx}" class="run-history" hidden></div>
        </div>
      </div>`
  }).join('')

  list.querySelectorAll('[data-log]').forEach(btn => {
    btn.addEventListener('click', () => _openRunModal(root, parseInt(btn.dataset.log)))
  })

  list.querySelectorAll('[data-history]').forEach(btn => {
    btn.addEventListener('click', () => _toggleHistory(root, parseInt(btn.dataset.history)))
  })

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this shoe and all its runs?')) return
      const shoes = load()
      shoes.splice(parseInt(btn.dataset.delete), 1)
      save(shoes)
      _render(root)
    })
  })
}

function _toggleHistory(root, idx) {
  const el = root.querySelector(`#history-${idx}`)
  if (!el.hidden) { el.hidden = true; return }

  const shoe = load()[idx]
  if (!shoe.runs.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted);margin-top:8px;">No runs logged yet.</p>'
  } else {
    el.innerHTML = `
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
        ${[...shoe.runs].reverse().map((r, i) => `
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--bg-raised);">
            <span>${new Date(r.date).toLocaleDateString()}${r.notes ? ` · ${r.notes}` : ''}</span>
            <span style="font-weight:600;">${r.miles} mi</span>
          </div>`).join('')}
      </div>`
  }
  el.hidden = false
}

function _openShoeModal(root) {
  root.querySelector('#shoe-name').value = ''
  root.querySelector('#shoe-start-miles').value = '0'
  root.querySelector('#shoe-retire').value = '500'
  root.querySelector('#shoe-modal').hidden = false
}

function _openRunModal(root, idx) {
  root.querySelector('#run-shoe-id').value = idx
  root.querySelector('#run-miles').value = ''
  root.querySelector('#run-notes').value = ''
  root.querySelector('#run-date').value = new Date().toISOString().split('T')[0]
  root.querySelector('#run-modal').hidden = false
}

function _closeModal(root, id) {
  root.querySelector(`#${id}`).hidden = true
}

function _saveShoe(root) {
  const name = root.querySelector('#shoe-name').value.trim()
  if (!name) { root.querySelector('#shoe-name').focus(); return }

  const shoes = load()
  shoes.push({
    id: Date.now(),
    name,
    startMiles: parseFloat(root.querySelector('#shoe-start-miles').value) || 0,
    retireMiles: parseFloat(root.querySelector('#shoe-retire').value) || 500,
    purchaseDate: root.querySelector('#shoe-date').value,
    runs: [],
  })
  save(shoes)
  _closeModal(root, 'shoe-modal')
  _render(root)
}

function _saveRun(root) {
  const idx = parseInt(root.querySelector('#run-shoe-id').value)
  const miles = parseFloat(root.querySelector('#run-miles').value)
  if (!miles || miles <= 0) { root.querySelector('#run-miles').focus(); return }

  const shoes = load()
  shoes[idx].runs.push({
    miles,
    date: root.querySelector('#run-date').value,
    notes: root.querySelector('#run-notes').value.trim(),
  })
  save(shoes)
  _closeModal(root, 'run-modal')
  _render(root)
}

function _injectModalStyles() {
  if (document.getElementById('shoe-modal-styles')) return
  const s = document.createElement('style')
  s.id = 'shoe-modal-styles'
  s.textContent = `
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: flex-end;
      backdrop-filter: blur(4px);
    }
    .modal-backdrop[hidden] { display: none !important; }
    .modal-sheet {
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      border-radius: 20px 20px 0 0;
      padding: 20px 16px calc(20px + var(--safe-bot));
      width: 100%;
      max-height: 85dvh;
      overflow-y: auto;
    }
    .modal-title {
      font-size: 18px; font-weight: 700;
      margin-bottom: 16px;
    }
  `
  document.head.appendChild(s)
}
