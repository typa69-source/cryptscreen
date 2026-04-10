const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db/pool')

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Нужен email и пароль' })
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' })

  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()])
    if (exists.rows.length) return res.status(400).json({ error: 'Email уже зарегистрирован' })

    const hash = await bcrypt.hash(password, 12)
    const result = await db.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hash]
    )
    res.json({ ok: true, userId: result.rows[0].id })
  } catch (e) {
    console.error('register error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Нужен email и пароль' })

  try {
    const result = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' })

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' })

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, email: user.email })
  } catch (e) {
    console.error('login error:', e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
