const jwt = require('jsonwebtoken')

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization']
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Нет токена' })
  }
  const token = header.slice(7).trim()
  if (!token) return res.status(401).json({ error: 'Нет токена' })
  if (!process.env.JWT_SECRET) {
    console.error('auth: JWT_SECRET is not set')
    return res.status(503).json({ error: 'Сервер не настроен' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const userId = Number(payload?.userId)
    if (!isFinite(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Токен недействителен' })
    }
    req.userId = userId
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Токен недействителен' })
  }
}
