require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const db = require('./db/pool')

const app = express()
const PORT = process.env.PORT || 3001

// ─── MIDDLEWARE ──────────────────────────────────────────────────
const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean))
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / non-browser requests
    if (!origin) return cb(null, true)
    if (allowedOrigins.has(origin)) return cb(null, true)
    if (/\.vercel\.app$/.test(origin)) return cb(null, true)
    return cb(null, false)
  },
  credentials: true,
}))
// Harden JSON parser and add basic security headers.
app.use(express.json({ limit: '2mb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// Rate-limit auth endpoints to slow down brute-force / credential-stuffing.
// 10 attempts per 15 min per IP for login/register; this is well above any
// realistic user retry rate but blocks scripted attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите 15 минут.' },
})

// ─── ROUTES ─────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'))
app.use('/api/user', require('./routes/user'))
app.use('/api/proxy', require('./routes/proxy'))

// Health: всегда отдаём признаки env (без секретов) + при наличии URL — пинг БД
app.get('/health', async (req, res) => {
  const payload = {
    ok: true,
    ts: Date.now(),
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,
  }
  if (!process.env.DATABASE_URL) {
    payload.db = 'not_configured'
    return res.json(payload)
  }
  try {
    const t0 = Date.now()
    await db.query('SELECT 1')
    payload.db = 'ok'
    payload.dbPingMs = Date.now() - t0
    return res.json(payload)
  } catch (e) {
    console.error('health db check:', e.message)
    payload.ok = false
    payload.db = 'error'
    payload.dbMessage =
      process.env.NODE_ENV === 'development' ? e.message : 'database_unreachable'
    return res.status(503).json(payload)
  }
})

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// ─── START ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ CryptScreen backend running on port ${PORT}`)
  console.log(`   DB: ${process.env.DATABASE_URL ? '✓ configured' : '✗ DATABASE_URL missing!'}`)
  console.log(`   JWT: ${process.env.JWT_SECRET ? '✓ configured' : '✗ JWT_SECRET missing!'}`)
})
