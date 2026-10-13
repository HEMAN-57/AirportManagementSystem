const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/flights - Fetch all active flights with rich relational details
router.get('/', async (req, res) => {
  try {
    const { type, status, query } = req.query;

    let sql = `
      SELECT 
        fsl.log_id,
        f.flight_id,
        f.flight_number,
        al.airline_id,
        al.airline_name,
        al.iata_code AS airline_iata,
        orig.airport_id AS origin_airport_id,
        orig.iata_code AS origin_iata,
        orig.city AS origin_city,
        orig.airport_name AS origin_airport_name,
        dest.airport_id AS dest_airport_id,
        dest.iata_code AS dest_iata,
        dest.city AS dest_city,
        dest.airport_name AS dest_airport_name,
        f.scheduled_departure,
        f.scheduled_arrival,
        fsl.estimated_departure,
        fsl.estimated_arrival,
        fsl.actual_departure,
        fsl.actual_arrival,
        fsl.flight_date,
        fsl.delay_minutes,
        fsl.delay_reason,
        fsl.flight_status,
        tg.gate_id,
        tg.terminal_code,
        tg.gate_number,
        ac.aircraft_id,
        ac.tail_number,
        ac.model AS aircraft_model,
        ac.total_seats,
        f.base_price,
        (SELECT COUNT(*) FROM bookings_tickets bt WHERE bt.flight_log_id = fsl.log_id) AS booked_passengers
      FROM flight_schedules_log fsl
      JOIN flights f ON fsl.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports orig ON f.origin_airport_id = orig.airport_id
      JOIN airports dest ON f.destination_airport_id = dest.airport_id
      JOIN aircraft ac ON fsl.aircraft_id = ac.aircraft_id
      LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
      WHERE 1=1
    `;

    const params = [];

    // Filter by departure or arrival relative to Mumbai/Delhi base
    if (type === 'departures') {
      params.push('BOM');
      sql += ` AND orig.iata_code = $${params.length}`;
    } else if (type === 'arrivals') {
      params.push('BOM');
      sql += ` AND dest.iata_code = $${params.length}`;
    }

    if (status) {
      params.push(status.toUpperCase());
      sql += ` AND fsl.flight_status = $${params.length}`;
    }

    if (query && query.trim() !== '') {
      params.push(`%${query.trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(f.flight_number) LIKE $${params.length} OR
        LOWER(al.airline_name) LIKE $${params.length} OR
        LOWER(dest.city) LIKE $${params.length} OR
        LOWER(dest.iata_code) LIKE $${params.length} OR
        LOWER(orig.city) LIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY fsl.estimated_departure ASC';

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch flights error:', err.message);
    res.status(500).json({ error: 'Server error retrieving flights' });
  }
});

// GET /api/flights/:id - Detailed flight manifest & telemetry
router.get('/:id', async (req, res) => {
  try {
    const flightRes = await db.query(
      `SELECT 
        fsl.log_id,
        f.flight_id,
        f.flight_number,
        al.airline_name,
        al.iata_code AS airline_iata,
        orig.iata_code AS origin_iata,
        orig.city AS origin_city,
        orig.airport_name AS origin_airport_name,
        dest.iata_code AS dest_iata,
        dest.city AS dest_city,
        dest.airport_name AS dest_airport_name,
        f.scheduled_departure,
        f.scheduled_arrival,
        fsl.estimated_departure,
        fsl.estimated_arrival,
        fsl.actual_departure,
        fsl.actual_arrival,
        fsl.flight_date,
        fsl.delay_minutes,
        fsl.delay_reason,
        fsl.flight_status,
        fsl.runway_id,
        tg.gate_id,
        tg.terminal_code,
        tg.gate_number,
        tg.gate_status,
        ac.aircraft_id,
        ac.tail_number,
        ac.model AS aircraft_model,
        ac.manufacturer,
        ac.total_seats,
        f.base_price
      FROM flight_schedules_log fsl
      JOIN flights f ON fsl.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports orig ON f.origin_airport_id = orig.airport_id
      JOIN airports dest ON f.destination_airport_id = dest.airport_id
      JOIN aircraft ac ON fsl.aircraft_id = ac.aircraft_id
      LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
      WHERE fsl.log_id = $1`,
      [req.params.id]
    );

    if (flightRes.rows.length === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    const flight = flightRes.rows[0];

    // Fetch assigned crew roster
    const crewRes = await db.query(
      `SELECT cs.staff_id, cs.employee_code, cs.first_name, cs.last_name, cs.staff_role, fca.assigned_role
       FROM flight_crew_assignments fca
       JOIN crew_staff cs ON fca.staff_id = cs.staff_id
       WHERE fca.flight_log_id = $1`,
      [req.params.id]
    );

    // Fetch booked passengers count & seat list
    const seatsRes = await db.query(
      `SELECT bt.seat_number, bt.fare_class, bt.payment_status, p.first_name, p.last_name, bp.boarding_status
       FROM bookings_tickets bt
       JOIN passengers p ON bt.passenger_id = p.passenger_id
       LEFT JOIN boarding_passes bp ON bt.ticket_id = bp.ticket_id
       WHERE bt.flight_log_id = $1`,
      [req.params.id]
    );

    flight.crew = crewRes.rows;
    flight.passengers = seatsRes.rows;
    flight.seats_occupied = seatsRes.rows.length;
    flight.seats_available = flight.total_seats - seatsRes.rows.length;

    res.json(flight);
  } catch (err) {
    console.error('Flight detail error:', err.message);
    res.status(500).json({ error: 'Server error retrieving flight details' });
  }
});

// PATCH /api/flights/:id/status - Update flight status, gate, and delays (Staff / Admin role)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { flight_status, gate_id, delay_minutes, delay_reason } = req.body;
    const logId = req.params.id;

    const validStatuses = ['SCHEDULED', 'BOARDING', 'GATE_CLOSED', 'DEPARTED', 'AIRBORNE', 'LANDED', 'CANCELLED', 'DIVERTED'];
    if (flight_status && !validStatuses.includes(flight_status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updateFields = [];
    const params = [logId];

    if (flight_status) {
      params.push(flight_status);
      updateFields.push(`flight_status = $${params.length}`);

      if (flight_status === 'DEPARTED') {
        updateFields.push('actual_departure = CURRENT_TIMESTAMP');
      } else if (flight_status === 'LANDED') {
        updateFields.push('actual_arrival = CURRENT_TIMESTAMP');
      }
    }

    if (gate_id !== undefined) {
      params.push(gate_id || null);
      updateFields.push(`gate_id = $${params.length}`);
    }

    if (delay_minutes !== undefined) {
      params.push(parseInt(delay_minutes) || 0);
      updateFields.push(`delay_minutes = $${params.length}`);
    }

    if (delay_reason !== undefined) {
      params.push(delay_reason || null);
      updateFields.push(`delay_reason = $${params.length}`);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const updateQuery = `
      UPDATE flight_schedules_log 
      SET ${updateFields.join(', ')}
      WHERE log_id = $1
      RETURNING *
    `;

    const updated = await db.query(updateQuery, params);
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Flight log not found' });
    }

    res.json({ message: 'Flight operational status updated successfully', flight: updated.rows[0] });
  } catch (err) {
    console.error('Update status error:', err.message);
    res.status(500).json({ error: err.message || 'Server error updating flight status' });
  }
});

module.exports = router;
