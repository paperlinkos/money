import sharp from 'sharp'

const longEdge = 1600
const jpegQuality = 60
const maxInputPixels = 100_000_000

// Selects the text to stamp on a project's previews. Needs proof_projects as p and booking_businesses as b.
export const watermarkSql = "coalesce(nullif(p.watermark_text,''),b.name,'Proof preview')"

const xml = (value: string) => value
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function overlay(width: number, height: number, text: string) {
  const fontSize = Math.round(Math.min(64, Math.max(14, Math.max(width, height) * 0.035)))
  const stepX = Math.round(text.length * fontSize * 0.62 + fontSize * 3)
  const stepY = fontSize * 5
  const reach = Math.ceil(Math.hypot(width, height))
  const label = xml(text)
  const rows: string[] = []
  for (let row = 0, y = -reach; y < reach * 2; row += 1, y += stepY) {
    for (let x = -reach + (row % 2) * Math.round(stepX / 2); x < reach * 2; x += stepX) rows.push(`<text x="${x}" y="${y}">${label}</text>`)
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="rotate(-30 ${Math.round(width / 2)} ${Math.round(height / 2)})" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" fill-opacity="0.42" stroke="#000000" stroke-opacity="0.28" stroke-width="1">${rows.join('')}</g></svg>`)
}

// A server with no fonts installed draws blank text, which would pass off an unmarked image as protected.
async function assertWatermarkDraws(text: string) {
  const { channels } = await sharp(overlay(400, 400, text)).ensureAlpha().stats()
  if (!channels[3]?.max) throw Error('Watermark text did not render. Install a font such as DejaVu Sans on the server.')
}

async function render(original: Buffer, text: string) {
  await assertWatermarkDraws(text)
  // Exports with small flaws still open for the client, so they must still get a preview here.
  const { data, info } = await sharp(original, { failOn: 'none', limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 1 })
    .toBuffer({ resolveWithObject: true })
  // Sharp drops EXIF, GPS, and other metadata unless asked to keep it.
  return sharp(data)
    .composite([{ input: overlay(info.width, info.height, text) }])
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toBuffer()
}

// One at a time: large images are memory-hungry and the server is small.
let queue: Promise<unknown> = Promise.resolve()
export function renderPreview(original: Buffer, text: string) {
  const job = queue.then(() => render(original, text))
  queue = job.catch(() => undefined)
  return job
}
