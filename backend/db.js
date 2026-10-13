const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'airport_management_system',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
      ...(process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== ''
        ? { password: process.env.DB_PASSWORD }
        : {}),
    };

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
