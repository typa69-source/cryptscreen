require('dotenv').config()
const express = require('express')
const cors = require('cors')
const db = require('./db/pool')

const app = express()
const PORT = process.env.PORT || 3001

// ─── MIDDLEWARE ──────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    /\.vercel\.app$/,           // любой Vercel preview URL
  ],
  credentials: true
}))
app.use(express.json({ limit: '2mb' }))

// ─── ROUTES ─────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'))
app.use('/api/user', require('./routes/user'))
app.use('/api/proxy', require('./routes/proxy'))

// Health check (+ опционально проверка Postgres для диагностики логина)
app.get('/health', async (req, res) => {
  const payload = { ok: true, ts: Date.now() }
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
