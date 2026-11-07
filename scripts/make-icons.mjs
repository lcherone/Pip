import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4)
  data.copy(out, 8)
  out.writeInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 8 + data.length)
  return out
}

function crc(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c
}

function dot(pixels, width, x, y, radius, color, alpha = 255) {
  const [r, g, b] = color
  for (let yy = Math.floor(y - radius); yy <= y + radius; yy++) {
    for (let xx = Math.floor(x - radius); xx <= x + radius; xx++) {
      const dx = xx - x
      const dy = yy - y
      if (xx < 0 || yy < 0 || xx >= width || yy >= pixels.length / 4 / width) continue
      if (dx * dx + dy * dy > radius * radius) continue
      const i = (yy * width + xx) * 4
      const edge = 1 - Math.max(0, Math.sqrt(dx * dx + dy * dy) - (radius - 1.2))
      const a = Math.max(0, Math.min(255, alpha * Math.min(1, edge)))
      const src = a / 255
      pixels[i] = pixels[i] * (1 - src) + r * src
      pixels[i + 1] = pixels[i + 1] * (1 - src) + g * src
      pixels[i + 2] = pixels[i + 2] * (1 - src) + b * src
      pixels[i + 3] = Math.min(255, pixels[i + 3] + a)
    }
  }
}

function coverRound(x, y, size, radius) {
  const left = x < radius
  const right = x >= size - radius
  const top = y < radius
  const bottom = y >= size - radius
  if ((left || right) && (top || bottom)) {
    const cx = (left ? radius : size - radius) - 0.5
    const cy = (top ? radius : size - radius) - 0.5
    return Math.max(0, Math.min(1, radius - Math.hypot(x - cx, y - cy) + 0.8))
  }
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
  return edge < 0 ? 0 : edge < 1 ? 0.7 : 1
}

function fillRound(pixels, size, radius, color) {
  const [r, g, b] = color
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverRound(x, y, size, radius)
      if (a <= 0) continue
      const i = (y * size + x) * 4
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
      pixels[i + 3] = Math.round(255 * a)
    }
  }
}

function draw(size, template = false) {
  const pixels = Buffer.alloc(size * size * 4)
  const fur = template ? [0, 0, 0] : [226, 164, 75]
  const cream = template ? [0, 0, 0] : [255, 246, 234]
  const dark = template ? [0, 0, 0] : [58, 43, 41]
  const s = size / 64
  if (!template) fillRound(pixels, size, size * 0.22, [255, 241, 220])
  dot(pixels, size, 32 * s, 40 * s, 15 * s, fur)
  dot(pixels, size, 20 * s, 20 * s, 7.5 * s, fur)
  dot(pixels, size, 44 * s, 20 * s, 7.5 * s, fur)
  dot(pixels, size, 32 * s, 33 * s, 13 * s, fur)
  dot(pixels, size, 40 * s, 41 * s, 6.4 * s, cream, template ? 0 : 255)
  if (!template) {
    dot(pixels, size, 26.5 * s, 30 * s, 2.15 * s, dark)
    dot(pixels, size, 35 * s, 30 * s, 2.15 * s, dark)
    dot(pixels, size, 31.5 * s, 36 * s, 1.55 * s, dark)
    dot(pixels, size, 47 * s, 49 * s, 3.6 * s, fur)
  }
  return png(size, size, pixels)
}

const root = path.resolve(import.meta.dirname, '..', 'resources')
fs.mkdirSync(root, { recursive: true })
fs.writeFileSync(path.join(root, 'icon.png'), draw(512))
fs.writeFileSync(path.join(root, 'trayTemplate.png'), draw(22, true))
console.log('wrote resources/icon.png and resources/trayTemplate.png')
