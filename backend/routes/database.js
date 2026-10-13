const express = require('express');
const router = express.Router();
const db = require('../db');

const ALLOWED_TABLES = [
  'airports',
  'terminals_gates',
  'airlines',
  'aircraft',
  'flights',
  'flight_schedules_log',
  'passengers',
  'bookings_tickets',
  'boarding_passes',
  'baggage',
  'crew_staff',
  'flight_crew_assignments',
  'users'
];

// GET /api/database/tables - List all tables with row count
router.get('/tables', async (req, res) => {
  try {
    const tables = [];
    for (const t of ALLOWED_TABLES) {
      const countRes = await db.query(`SELECT COUNT(*) AS count FROM ${t}`);
      tables.push({
        table_name: t,
        row_count: parseInt(countRes.rows[0].count) || 0,
      });
    }
    res.json(tables);
  } catch (err) {
    console.error('Database tables fetch error:', err.message);
    res.status(500).json({ error: 'Server error retrieving database tables' });
  }
});

// GET /api/database/table/:name - Fetch records & schema for a table
router.get('/table/:name', async (req, res) => {
  try {
    const tableName = req.params.name.toLowerCase().trim();
    if (!ALLOWED_TABLES.includes(tableName)) {
      return res.status(400).json({ error: 'Invalid or restricted table name' });
    }

    // Get column definitions
    const colsRes = await db.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    // Get data rows (omit password_hash for users table)
    let selectClause = '*';
    if (tableName === 'users') {
      selectClause = 'id, name, email, role, created_at';
    }

    const dataRes = await db.query(`SELECT ${selectClause} FROM ${tableName} ORDER BY 1 ASC LIMIT 100`);

    res.json({
      table_name: tableName,
      columns: colsRes.rows,
      rows: dataRes.rows,
      total_rows: dataRes.rows.length,
    });
  } catch (err) {
    console.error('Table fetch error:', err.message);
    res.status(500).json({ error: 'Server error retrieving table data' });
  }
});

// GET /api/database/triggers - List database triggers
router.get('/triggers', async (req, res) => {
  try {
    const triggersRes = await db.query(
      `SELECT trigger_name, event_manipulation, event_object_table, action_timing
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'`
    );
    res.json(triggersRes.rows);
  } catch (err) {
    console.error('Triggers fetch error:', err.message);
    res.status(500).json({ error: 'Server error retrieving triggers' });
  }
});

module.exports = router;
