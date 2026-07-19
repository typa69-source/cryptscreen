const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db/pool')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LEN = 254
const MAX_PASSWORD_LEN = 128

function validateEmailPassword(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Нужен email и пароль' })
    return null
  }
  if (String(email).length > MAX_EMAIL_LEN || String(password).length > MAX_PASSWORD_LEN) {
    res.status(400).json({ error: 'Слишком длинные данные' })
    return null
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    res.status(400).json({ error: 'Некорректный email' })
    return null
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Пароль минимум 6 символов' })
    return null
  }
  return { email: String(email).trim().toLowerCase(), password }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const vp = validateEmailPassword(req, res)
  if (!vp) return
  const { email, password } = vp

  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email])
    if (exists.rows.length) return res.status(400).json({ error: 'Email уже зарегистрирован' })

    const hash = await bcrypt.hash(password, 12)
    const result = await db.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
      [email, hash]
    )
    res.json({ ok: true, userId: result.rows[0].id })
  } catch (e) {
    console.error('register error:', e.message, e.code || '')
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const vp = validateEmailPassword(req, res)
  if (!vp) return
  const { email, password } = vp
  if (!process.env.JWT_SECRET) {
    console.error('login: JWT_SECRET is not set (Render / .env)')
    return res.status(503).json({ error: 'Сервер не настроен: задайте JWT_SECRET' })
  }

  try {
    const result = await db.query('SELECT id, email, password FROM users WHERE email=$1', [email])
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' })

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' })

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, email: user.email })
  } catch (e) {
    console.error('login error:', e.message, e.code || '')
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
