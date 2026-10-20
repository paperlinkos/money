import express from 'express'
import { config } from './core/config.js'
import { bookingRoutes } from './modules/booking/routes.js'
import { proofRoutes } from './modules/proof/routes.js'
import { proofFileRoutes } from './modules/proof/files.js'
import { proofFeedbackRoutes } from './modules/proof/feedback.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
app.use((request, response, next) => { response.set('Access-Control-Allow-Origin', webOrigin); response.set('Access-Control-Allow-Credentials', 'true'); response.set('Vary', 'Origin'); response.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token'); if (request.method === 'OPTIONS') return response.sendStatus(204); if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.path.startsWith('/api/') && request.header('origin') !== webOrigin) return response.status(403).json({ error: 'Cross-origin request rejected.' }); next() })

app.get('/api/health', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({ status: 'ok' })
})
bookingRoutes(app)
proofRoutes(app)
proofFileRoutes(app)
proofFeedbackRoutes(app)

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' })
})

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})
