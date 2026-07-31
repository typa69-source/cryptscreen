require('dotenv').config()
const express = require('express')
const cors = require('cors')

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

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// ─── START ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ CryptScreen backend running on port ${PORT}`)
  console.log(`   DB: ${process.env.DATABASE_URL ? '✓ configured' : '✗ DATABASE_URL missing!'}`)
  console.log(`   JWT: ${process.env.JWT_SECRET ? '✓ configured' : '✗ JWT_SECRET missing!'}`)
})
