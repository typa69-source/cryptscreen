const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.startsWith('postgresql://localhost')
    || process.env.NODE_ENV === 'development'
    || process.env.PG_SSL_DISABLED === '1'
    ? false
    : { rejectUnauthorized: false },
  // Render free tier sometimes needs IPv4; only force when connecting to Render-like hosts.
  connectionTimeoutMillis: 10000,
  // Keep idle connections alive in serverless-ish environments.
  idleTimeoutMillis: 30000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message)
})

module.exports = pool
