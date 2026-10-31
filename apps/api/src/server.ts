import express from 'express'
import { config } from './core/config.js'
import { bookingRoutes } from './modules/booking/routes.js'
import { proofRoutes } from './modules/proof/routes.js'
import { proofFileRoutes, user } from './modules/proof/files.js'
import { proofFeedbackRoutes } from './modules/proof/feedback.js'
import { billingRoutes } from './modules/billing/routes.js'
import { supportRoutes } from './modules/support/routes.js'

const app = express()
app.disable('x-powered-by')
// nginx runs on this machine, so rate limits must key on the visitor it reports rather than on nginx.
app.set('trust proxy', 'loopback')
// Paystack signs the exact request bytes, so keep them for webhook verification.
const keepRawBody = (request: unknown, _response: unknown, buffer: Buffer) => { (request as { rawBody?: Buffer }).rawBody = buffer }
const normalBody = express.json({ limit: '8mb', verify: keepRawBody })
const uploadBody = express.json({ limit: '28mb', verify: keepRawBody })
const uploadPath = /^\/api\/proof\/(projects\/[^/]+\/files|deliverables\/[^/]+\/versions)$/
// Only signed-in creators may send a large body, so strangers cannot use uploads to exhaust memory.
app.use((request, response, next) => {
  if (request.method !== 'POST' || !uploadPath.test(request.path)) return normalBody(request, response, next)
  user(request).then((userId) => (userId ? uploadBody : normalBody)(request, response, next)).catch(next)
})
const webOrigin = config.webOrigin
const localDevelopmentOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']
const allowedOrigins = new Set(process.env.NODE_ENV === 'production' ? [webOrigin] : [webOrigin, ...localDevelopmentOrigins])
app.use((request, response, next) => {
  const origin = request.header('origin')
  if (origin && allowedOrigins.has(origin)) {
    response.set('Access-Control-Allow-Origin', origin)
    response.set('Access-Control-Allow-Credentials', 'true')
  }
  response.set('Vary', 'Origin')
  response.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.path.startsWith('/api/') && request.path !== '/api/billing/webhook' && !allowedOrigins.has(origin ?? '')) return response.status(403).json({ error: 'Cross-origin request rejected.' })
  next()
})

app.get('/api/health', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({ status: 'ok' })
})
bookingRoutes(app)
proofRoutes(app)
proofFileRoutes(app)
proofFeedbackRoutes(app)
billingRoutes(app)
supportRoutes(app)

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' })
})

app.listen(config.port, config.host, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})
