const router = require('express').Router()

// Minimal server-side proxy for third-party APIs that block browser CORS.
// Keep this narrow and explicit to avoid turning backend into an open proxy.

// GET /api/proxy/coingecko/markets?page=1..5
const _cgCache = new Map() // page -> { ts, body, status }
const CG_TTL_MS = 6 * 60 * 60 * 1000

router.get('/coingecko/markets', async (req, res) => {
  const page = Math.max(1, Math.min(10, parseInt(req.query.page || '1', 10) || 1))
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`

  try {
    const cached = _cgCache.get(page)
    if (cached && Date.now() - cached.ts < CG_TTL_MS && cached.status === 200) {
      res.set('x-cache', 'hit')
      res.type('application/json').send(cached.body)
      return
    }

    // Node 18+ has global fetch.
    const r = await fetch(url, {
      headers: {
        // Helps avoid some aggressive bot blocks
        'accept': 'application/json',
        'user-agent': 'cryptscreen/1.0 (+render/vercel)',
      },
    })
    const text = await r.text()
    if (r.ok) {
      _cgCache.set(page, { ts: Date.now(), body: text, status: 200 })
      res.set('x-cache', 'miss')
      res.type('application/json').send(text)
      return
    }

    // If CoinGecko is rate limiting (429) or temporarily failing, serve stale cache if available.
    if (cached && cached.status === 200) {
      res.set('x-cache', 'stale')
      res.type('application/json').send(cached.body)
      return
    }

    return res.status(r.status).send(text)
  } catch (e) {
    console.error('proxy coingecko error:', e)
    const cached = _cgCache.get(page)
    if (cached && cached.status === 200) {
      res.set('x-cache', 'stale-error')
      res.type('application/json').send(cached.body)
      return
    }
    res.status(502).json({ error: 'Proxy error', message: e?.message || String(e) })
  }
})

module.exports = router

