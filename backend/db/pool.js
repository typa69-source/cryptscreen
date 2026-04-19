const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Force IPv4 — Render free tier does not support IPv6
  connectionTimeoutMillis: 10000,
})

module.exports = pool
