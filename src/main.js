import './style.css'
import { initHeatmap } from './features/heatmap.js'
import { initShoes } from './features/shoes.js'
import { initFuel } from './features/fuel.js'

// ── Tab routing ──────────────────────────────────────
const tabs = document.querySelectorAll('.tab-btn')
const panels = document.querySelectorAll('.tab-panel')

let initialized = { heatmap: false, shoes: false, fuel: false }

function activateTab(name) {
  tabs.forEach(t => {
    const active = t.dataset.tab === name
    t.classList.toggle('active', active)
    t.setAttribute('aria-selected', active)
  })
  panels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`)
  })

  if (!initialized[name]) {
    initialized[name] = true
    if (name === 'heatmap') initHeatmap(document.getElementById('heatmap-root'))
    if (name === 'shoes')   initShoes(document.getElementById('shoes-root'))
    if (name === 'fuel')    initFuel(document.getElementById('fuel-root'))
  }
}

tabs.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab))
})

// Bootstrap the default tab
activateTab('heatmap')

// ── PWA install prompt ───────────────────────────────
let deferredInstall = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredInstall = e
})
