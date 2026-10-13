const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files for seamless browser access
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/flights', require('./routes/flights'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/baggage', require('./routes/baggage'));
app.use('/api/airports', require('./routes/airports'));
app.use('/api/crew', require('./routes/crew'));
app.use('/api/database', require('./routes/database'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    system: 'Airport Management System (AMS) API',
    database: 'PostgreSQL 16+',
    timestamp: new Date().toISOString()
  });
});

// Auto-seed schema on fresh database deployments (e.g. Render, Railway, Docker)
async function autoSeedDatabase() {
  try {
    const res = await db.query("SELECT to_regclass('public.airports')");
    if (!res.rows[0].to_regclass) {
      console.log('🔄 Fresh database detected. Executing schema.sql...');
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await db.query(sql);
        console.log('✅ PostgreSQL schema and seed data initialized successfully!');
      }
    }
  } catch (err) {
    console.log('ℹ️ Database check completed:', err.message);
  }
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`✈️ Airport Management System Server running on http://localhost:${PORT}`);
  console.log(`📡 Frontend accessible at http://localhost:${PORT}/index.html`);
  await autoSeedDatabase();
});
