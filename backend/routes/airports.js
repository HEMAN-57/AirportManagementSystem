const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/airports - List all master airports
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM airports ORDER BY city ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch airports error:', err.message);
    res.status(500).json({ error: 'Server error retrieving airports' });
  }
});

// GET /api/airports/stats - Live airport operational statistics
router.get('/stats', async (req, res) => {
  try {
    const flightsCount = await db.query(
      "SELECT COUNT(*) AS total, COUNT(CASE WHEN delay_minutes = 0 THEN 1 END) AS on_time FROM flight_schedules_log WHERE flight_date = CURRENT_DATE"
    );

    const activeFlights = await db.query(
      "SELECT COUNT(*) AS active FROM flight_schedules_log WHERE flight_status IN ('BOARDING', 'AIRBORNE', 'SCHEDULED')"
    );

    const gatesCount = await db.query(
      "SELECT COUNT(*) AS total_gates, COUNT(CASE WHEN gate_status = 'OCCUPIED' THEN 1 END) AS occupied_gates FROM terminals_gates"
    );

    const bookingsCount = await db.query(
      "SELECT COUNT(*) AS total_bookings FROM bookings_tickets"
    );

    const baggageCount = await db.query(
      "SELECT COUNT(*) AS total_bags, COUNT(CASE WHEN baggage_status IN ('CHECKED_IN', 'SORTED', 'LOADED_ON_AIRCRAFT') THEN 1 END) AS in_transit FROM baggage"
    );

    const total = parseInt(flightsCount.rows[0].total) || 1;
    const onTime = parseInt(flightsCount.rows[0].on_time) || 0;
    const onTimePct = Math.round((onTime / total) * 100);

    res.json({
      total_flights_today: parseInt(flightsCount.rows[0].total),
      active_flights: parseInt(activeFlights.rows[0].active),
      on_time_percentage: onTimePct,
      total_gates: parseInt(gatesCount.rows[0].total_gates),
      occupied_gates: parseInt(gatesCount.rows[0].occupied_gates),
      total_bookings: parseInt(bookingsCount.rows[0].total_bookings),
      total_baggage: parseInt(baggageCount.rows[0].total_baggage),
      baggage_in_transit: parseInt(baggageCount.rows[0].in_transit),
    });
  } catch (err) {
    console.error('Fetch stats error:', err.message);
    res.status(500).json({ error: 'Server error retrieving operational statistics' });
  }
});

// GET /api/airports/:id/gates - Gates for a specific airport
router.get('/:id/gates', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tg.*, f.flight_number, fsl.flight_status
       FROM terminals_gates tg
       LEFT JOIN flight_schedules_log fsl ON tg.gate_id = fsl.gate_id AND fsl.flight_status IN ('BOARDING', 'GATE_CLOSED', 'SCHEDULED')
       LEFT JOIN flights f ON fsl.flight_id = f.flight_id
       WHERE tg.airport_id = $1
       ORDER BY tg.terminal_code, tg.gate_number`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch gates error:', err.message);
    res.status(500).json({ error: 'Server error retrieving gates' });
  }
});

module.exports = router;
