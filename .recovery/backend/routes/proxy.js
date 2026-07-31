const router = require('express').Router()

// Minimal server-side proxy for third-party APIs that block browser CORS.
// Keep this narrow and explicit to avoid turning backend into an open proxy.

// GET /api/proxy/coingecko/markets?page=1..5
const _cgCache = new Map() // page -> { ts, body, status }
const CG_TTL_MS = 6 * 60 * 60 * 1000
const CG_MAX_PAGE = 5

router.get('/coingecko/markets', async (req, res) => {
  const pageRaw = parseInt(req.query.page || '1', 10)
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(CG_MAX_PAGE, pageRaw)) : 1
  const url = new URL('https://api.coingecko.com/api/v3/coins/markets')
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('order', 'market_cap_desc')
  url.searchParams.set('per_page', '250')
  url.searchParams.set('page', String(page))

  try {
    const cached = _cgCache.get(page)
    if (cached && Date.now() - cached.ts < CG_TTL_MS && cached.status === 200) {
      res.set('x-cache', 'hit')
      res.type('application/json').send(cached.body)
      return
    }

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15000)
    const r = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'cryptscreen/1.0',
      },
    })
    clearTimeout(t)
    const text = await r.text()
    if (r.ok) {
      _cgCache.set(page, { ts: Date.now(), body: text, status: 200 })
      res.set('x-cache', 'miss')
      res.type('application/json').send(text)
      return
    }

    if (cached && cached.status === 200) {
      res.set('x-cache', 'stale')
      res.type('application/json').send(cached.body)
      return
    }

    return res.status(r.status).send(text)
  } catch (e) {
    console.error('proxy coingecko error:', e.message || e)
    const cached = _cgCache.get(page)
    if (cached && cached.status === 200) {
      res.set('x-cache', 'stale-error')
      res.type('application/json').send(cached.body)
      return
    }
    res.status(502).json({ error: 'Proxy error' })
  }
})

module.exports = router

