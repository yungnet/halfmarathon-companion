// Run once with: node generate-icons.js
// Generates placeholder PNG icons using canvas (requires node-canvas or just copy SVG approach)
// We'll use a pure SVG-to-PNG approach via built-in APIs if available, otherwise create SVG icons.

const fs = require('fs')
const path = require('path')

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#0f172a"/>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <text x="50%" y="54%" font-size="${size * 0.5}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui">🏃</text>
  <text x="50%" y="84%" font-size="${size * 0.12}" text-anchor="middle" fill="#f97316" font-family="system-ui" font-weight="bold">HMC</text>
</svg>`

const dir = path.join(__dirname, 'public', 'icons')
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(path.join(dir, 'icon-192.svg'), svg(192))
fs.writeFileSync(path.join(dir, 'icon-512.svg'), svg(512))
console.log('SVG icons written. For PNG, open them in a browser and save, or use a converter.')
