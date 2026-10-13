const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/crew - List all crew members
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cs.*, al.airline_name, al.iata_code AS airline_iata
       FROM crew_staff cs
       LEFT JOIN airlines al ON cs.airline_id = al.airline_id
       ORDER BY cs.staff_role, cs.last_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch crew error:', err.message);
    res.status(500).json({ error: 'Server error retrieving crew' });
  }
});

// GET /api/crew/flight/:flightLogId - Flight crew roster
router.get('/flight/:flightLogId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT fca.assignment_id, fca.assigned_role, fca.shift_start_time, fca.shift_end_time,
              cs.staff_id, cs.employee_code, cs.first_name, cs.last_name, cs.staff_role, cs.license_number, cs.duty_status
       FROM flight_crew_assignments fca
       JOIN crew_staff cs ON fca.staff_id = cs.staff_id
       WHERE fca.flight_log_id = $1
       ORDER BY cs.staff_role`,
      [req.params.flightLogId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch flight crew error:', err.message);
    res.status(500).json({ error: 'Server error retrieving flight crew assignments' });
  }
});

module.exports = router;
