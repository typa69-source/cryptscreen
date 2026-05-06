const router = require('express').Router()

// Minimal server-side proxy for third-party APIs that block browser CORS.
// Keep this narrow and explicit to avoid turning backend into an open proxy.

// GET /api/proxy/coingecko/markets?page=1..5
router.get('/coingecko/markets', async (req, res) => {
  const page = Math.max(1, Math.min(10, parseInt(req.query.page || '1', 10) || 1))
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`

  try {
    // Node 18+ has global fetch.
    const r = await fetch(url, {
      headers: {
        // Helps avoid some aggressive bot blocks
        'accept': 'application/json',
        'user-agent': 'cryptscreen/1.0 (+render/vercel)',
      },
    })
    const text = await r.text()
    if (!r.ok) return res.status(r.status).send(text)
    res.type('application/json').send(text)
  } catch (e) {
    console.error('proxy coingecko error:', e)
    res.status(502).json({ error: 'Proxy error', message: e?.message || String(e) })
  }
})

module.exports = router

