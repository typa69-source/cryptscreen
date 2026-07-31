const router = require('express').Router()
const auth = require('../middleware/auth')
const db = require('../db/pool')

// ─── SETTINGS ───────────────────────────────────────────────────

// GET /api/user/settings
router.get('/settings', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT settings FROM user_settings WHERE user_id=$1',
      [req.userId]
    )
    res.json({ settings: result.rows[0]?.settings || {} })
  } catch (e) {
    console.error('get settings error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/user/settings
router.post('/settings', auth, async (req, res) => {
  const { settings } = req.body
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Неверный формат настроек' })
  }
  try {
    await db.query(
      `INSERT INTO user_settings (user_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET settings=$2, updated_at=NOW()`,
      [req.userId, JSON.stringify(settings)]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('save settings error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// ─── DRAWINGS ────────────────────────────────────────────────────

// GET /api/user/drawings/:symbol
router.get('/drawings/:symbol', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT drawings FROM user_drawings WHERE user_id=$1 AND symbol=$2',
      [req.userId, req.params.symbol.toUpperCase()]
    )
    res.json({ drawings: result.rows[0]?.drawings || [] })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// GET /api/user/drawings  — все рисунки сразу (для загрузки при старте)
router.get('/drawings', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT symbol, drawings FROM user_drawings WHERE user_id=$1',
      [req.userId]
    )
    const map = {}
    for (const row of result.rows) map[row.symbol] = row.drawings
    res.json({ drawings: map })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/user/drawings/:symbol
router.post('/drawings/:symbol', auth, async (req, res) => {
  const { drawings } = req.body
  if (!Array.isArray(drawings)) return res.status(400).json({ error: 'drawings должен быть массивом' })
  try {
    await db.query(
      `INSERT INTO user_drawings (user_id, symbol, drawings, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, symbol) DO UPDATE
       SET drawings=$3, updated_at=NOW()`,
      [req.userId, req.params.symbol.toUpperCase(), JSON.stringify(drawings)]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/user/drawings/:symbol
router.delete('/drawings/:symbol', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM user_drawings WHERE user_id=$1 AND symbol=$2',
      [req.userId, req.params.symbol.toUpperCase()]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// ─── ALERTS ──────────────────────────────────────────────────────

// GET /api/user/alerts
router.get('/alerts', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM user_alerts WHERE user_id=$1 ORDER BY created_at DESC',
      [req.userId]
    )
    res.json({ alerts: result.rows })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/user/alerts
router.post('/alerts', auth, async (req, res) => {
  const { symbol, condition, price, note } = req.body
  if (!symbol || !condition || price == null) {
    return res.status(400).json({ error: 'Нужны symbol, condition, price' })
  }
  if (!['above', 'below'].includes(condition)) {
    return res.status(400).json({ error: 'condition: above или below' })
  }
  try {
    const result = await db.query(
      `INSERT INTO user_alerts (user_id, symbol, condition, price, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.userId, symbol.toUpperCase(), condition, price, note || null]
    )
    res.json({ ok: true, id: result.rows[0].id })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/user/alerts/:id
router.delete('/alerts/:id', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM user_alerts WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// PATCH /api/user/alerts/:id/toggle
router.patch('/alerts/:id/toggle', auth, async (req, res) => {
  try {
    await db.query(
      'UPDATE user_alerts SET active = NOT active WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// ─── PROFILE ─────────────────────────────────────────────────────

// GET /api/user/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, created_at FROM users WHERE id=$1',
      [req.userId]
    )
    res.json(result.rows[0] || {})
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
