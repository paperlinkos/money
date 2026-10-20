import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = resolve(root, '.env')
const fileValues = (() => {
  try {
    return Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]))
  } catch { return {} }
})()
const rawUrl = process.env.VITE_SITE_URL || fileValues.VITE_SITE_URL || 'http://localhost:5173'
const siteUrl = new URL(rawUrl).origin
const publicDir = resolve(root, 'apps/web/public')
const routes = ['/', '/tools', '/tools/invoice', '/tools/debts', '/tools/gear', '/pricing', '/privacy', '/contact', '/feedback']

mkdirSync(publicDir, { recursive: true })
writeFileSync(resolve(publicDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${siteUrl}${route}</loc></url>`).join('\n')}\n</urlset>\n`)
writeFileSync(resolve(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
if (siteUrl.startsWith('http://localhost')) console.warn('SEO files were generated for localhost. Set VITE_SITE_URL to the public HTTPS domain before creating a production release.')
