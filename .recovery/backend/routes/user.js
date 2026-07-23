const router = require('express').Router()
const auth = require('../middleware/auth')
const db = require('../db/pool')

const MAX_SETTINGS_SIZE = 512 * 1024

function sanitizeSymbol(sym) {
  if (typeof sym !== 'string') return null
  const s = sym.trim().toUpperCase()
  return /^[A-Z0-9]{1,20}$/.test(s) ? s : null
}

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
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'Неверный формат настроек' })
  }
  let json
  try {
    json = JSON.stringify(settings)
  } catch {
    return res.status(400).json({ error: 'Неверный формат настроек' })
  }
  if (json.length > MAX_SETTINGS_SIZE) {
    return res.status(413).json({ error: 'Настройки слишком большие' })
  }
  try {
    await db.query(
      `INSERT INTO user_settings (user_id, settings, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET settings=$2::jsonb, updated_at=NOW()`,
      [req.userId, json]
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
  const sym = sanitizeSymbol(req.params.symbol)
  if (!sym) return res.status(400).json({ error: 'Некорректный символ' })
  try {
    const result = await db.query(
      'SELECT drawings FROM user_drawings WHERE user_id=$1 AND symbol=$2',
      [req.userId, sym]
    )
    res.json({ drawings: result.rows[0]?.drawings || [] })
  } catch (e) {
    console.error('get drawings error:', e)
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
  const sym = sanitizeSymbol(req.params.symbol)
  if (!sym) return res.status(400).json({ error: 'Некорректный символ' })
  const { drawings } = req.body
  if (!Array.isArray(drawings)) return res.status(400).json({ error: 'drawings должен быть массивом' })
  let json
  try {
    json = JSON.stringify(drawings)
  } catch {
    return res.status(400).json({ error: 'Некорректный формат drawings' })
  }
  if (json.length > MAX_SETTINGS_SIZE) {
    return res.status(413).json({ error: 'drawings слишком большие' })
  }
  try {
    await db.query(
      `INSERT INTO user_drawings (user_id, symbol, drawings, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, symbol) DO UPDATE
       SET drawings=$3::jsonb, updated_at=NOW()`,
      [req.userId, sym, json]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('save drawings error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/user/drawings/:symbol
router.delete('/drawings/:symbol', auth, async (req, res) => {
  const sym = sanitizeSymbol(req.params.symbol)
  if (!sym) return res.status(400).json({ error: 'Некорректный символ' })
  try {
    await db.query(
      'DELETE FROM user_drawings WHERE user_id=$1 AND symbol=$2',
      [req.userId, sym]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('delete drawings error:', e)
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
  const sym = sanitizeSymbol(symbol)
  if (!sym || !condition || price == null) {
    return res.status(400).json({ error: 'Нужны symbol, condition, price' })
  }
  if (!['above', 'below'].includes(condition)) {
    return res.status(400).json({ error: 'condition: above или below' })
  }
  const priceNum = Number(price)
  if (!isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: 'price должен быть положительным числом' })
  }
  const noteStr = note != null ? String(note).slice(0, 500) : null
  try {
    const result = await db.query(
      `INSERT INTO user_alerts (user_id, symbol, condition, price, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.userId, sym, condition, priceNum, noteStr]
    )
    res.json({ ok: true, id: result.rows[0].id })
  } catch (e) {
    console.error('save alert error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// DELETE /api/user/alerts/:id
router.delete('/alerts/:id', auth, async (req, res) => {
  const id = Number(req.params.id)
  if (!isFinite(id) || id <= 0) return res.status(400).json({ error: 'Некорректный id' })
  try {
    await db.query(
      'DELETE FROM user_alerts WHERE id=$1 AND user_id=$2',
      [id, req.userId]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('delete alert error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// PATCH /api/user/alerts/:id/toggle
router.patch('/alerts/:id/toggle', auth, async (req, res) => {
  const id = Number(req.params.id)
  if (!isFinite(id) || id <= 0) return res.status(400).json({ error: 'Некорректный id' })
  try {
    await db.query(
      'UPDATE user_alerts SET active = NOT active WHERE id=$1 AND user_id=$2',
      [id, req.userId]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('toggle alert error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// ─── PROFILE ─────────────────────────────────────────────────────

// GET /api/user/me
router.get('/me', auth, async (req, res) => {
  const id = Number(req.userId)
  if (!isFinite(id) || id <= 0) return res.status(400).json({ error: 'Некорректный пользователь' })
  try {
    const result = await db.query(
      'SELECT id, email, created_at FROM users WHERE id=$1',
      [id]
    )
    res.json(result.rows[0] || {})
  } catch (e) {
    console.error('profile error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
