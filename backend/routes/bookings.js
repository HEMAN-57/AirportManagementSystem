const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Helper to generate random PNR
function generatePNR() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pnr = 'AMS';
  for (let i = 0; i < 3; i++) {
    pnr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pnr;
}

// Helper to generate random Ticket Number
function generateTicketNumber(airlineCode = '098') {
  let num = `${airlineCode}-`;
  for (let i = 0; i < 10; i++) {
    num += Math.floor(Math.random() * 10).toString();
  }
  return num;
}

// GET /api/bookings/my - Fetch all bookings for logged-in user
router.get('/my', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        bt.ticket_id,
        bt.ticket_number,
        bt.pnr,
        bt.booking_date,
        bt.fare_class,
        bt.seat_number,
        bt.base_fare,
        bt.tax_and_surcharges,
        bt.payment_status,
        fsl.log_id AS flight_log_id,
        fsl.flight_date,
        fsl.estimated_departure,
        fsl.estimated_arrival,
        fsl.flight_status,
        f.flight_number,
        al.airline_name,
        al.iata_code AS airline_iata,
        orig.iata_code AS origin_iata,
        orig.city AS origin_city,
        dest.iata_code AS dest_iata,
        dest.city AS dest_city,
        tg.terminal_code,
        tg.gate_number,
        bp.boarding_pass_id,
        bp.sequence_number,
        bp.boarding_group,
        bp.boarding_status,
        p.first_name,
        p.last_name,
        p.passport_number
      FROM bookings_tickets bt
      JOIN passengers p ON bt.passenger_id = p.passenger_id
      JOIN flight_schedules_log fsl ON bt.flight_log_id = fsl.log_id
      JOIN flights f ON fsl.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports orig ON f.origin_airport_id = orig.airport_id
      JOIN airports dest ON f.destination_airport_id = dest.airport_id
      LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
      LEFT JOIN boarding_passes bp ON bt.ticket_id = bp.ticket_id
      WHERE p.user_id = $1 OR p.email = (SELECT email FROM users WHERE id = $1)
      ORDER BY bt.booking_date DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch my bookings error:', err.message);
    res.status(500).json({ error: 'Server error retrieving bookings' });
  }
});

// POST /api/bookings - Book a new flight ticket
router.post('/', auth, async (req, res) => {
  try {
    const { flight_log_id, seat_number, fare_class = 'ECONOMY', first_name, last_name, passport_number, phone_number } = req.body;

    if (!flight_log_id || !seat_number) {
      return res.status(400).json({ error: 'Flight and seat number are required' });
    }

    // Check if seat is already taken on this flight
    const seatCheck = await db.query(
      'SELECT ticket_id FROM bookings_tickets WHERE flight_log_id = $1 AND seat_number = $2',
      [flight_log_id, seat_number.toUpperCase().trim()]
    );
    if (seatCheck.rows.length > 0) {
      return res.status(400).json({ error: `Seat ${seat_number} is already occupied on this flight` });
    }

    // Get flight base price
    const flightRes = await db.query(
      `SELECT f.base_price, f.flight_number, al.iata_code AS airline_iata
       FROM flight_schedules_log fsl
       JOIN flights f ON fsl.flight_id = f.flight_id
       JOIN airlines al ON f.airline_id = al.airline_id
       WHERE fsl.log_id = $1`,
      [flight_log_id]
    );

    if (flightRes.rows.length === 0) {
      return res.status(404).json({ error: 'Flight log not found' });
    }

    const { base_price, airline_iata } = flightRes.rows[0];
    let multiplier = 1.0;
    if (fare_class === 'PREMIUM_ECONOMY') multiplier = 1.4;
    else if (fare_class === 'BUSINESS') multiplier = 2.2;
    else if (fare_class === 'FIRST') multiplier = 3.5;

    const baseFare = parseFloat((base_price * multiplier).toFixed(2));
    const taxes = parseFloat((baseFare * 0.15).toFixed(2));

    await db.query('BEGIN');

    // Find or create passenger linked to this user
    let passengerId;
    const pCheck = await db.query('SELECT passenger_id FROM passengers WHERE user_id = $1', [req.user.id]);

    if (pCheck.rows.length > 0) {
      passengerId = pCheck.rows[0].passenger_id;
    } else {
      const userRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
      const u = userRes.rows[0];
      const fn = first_name || u.name.split(' ')[0];
      const ln = last_name || u.name.split(' ').slice(1).join(' ') || 'User';
      const passport = passport_number || `IND${Math.floor(1000000 + Math.random() * 9000000)}`;
      const phone = phone_number || '+91-98000-00000';

      const newPassenger = await db.query(
        `INSERT INTO passengers (user_id, first_name, last_name, passport_number, date_of_birth, gender, email, phone_number)
         VALUES ($1, $2, $3, $4, '1995-01-01', 'O', $5, $6)
         RETURNING passenger_id`,
        [req.user.id, fn, ln, passport, u.email, phone]
      );
      passengerId = newPassenger.rows[0].passenger_id;
    }

    const pnr = generatePNR();
    const ticketNo = generateTicketNumber(airline_iata === 'AI' ? '098' : '176');

    const newTicket = await db.query(
      `INSERT INTO bookings_tickets 
       (ticket_number, passenger_id, flight_log_id, pnr, fare_class, seat_number, base_fare, tax_and_surcharges, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED')
       RETURNING *`,
      [ticketNo, passengerId, flight_log_id, pnr, fare_class, seat_number.toUpperCase().trim(), baseFare, taxes]
    );

    await db.query('COMMIT');

    res.status(201).json({
      message: 'Flight booked successfully',
      ticket: newTicket.rows[0],
    });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Booking creation error:', err.message);
    res.status(500).json({ error: err.message || 'Server error creating booking' });
  }
});

// POST /api/bookings/:id/checkin - Online Check-in & Boarding Pass Issuance
router.post('/:id/checkin', auth, async (req, res) => {
  try {
    const ticketId = req.params.id;

    // Check ticket exists
    const ticketRes = await db.query(
      `SELECT bt.*, fsl.flight_status, fsl.flight_date, p.user_id 
       FROM bookings_tickets bt
       JOIN flight_schedules_log fsl ON bt.flight_log_id = fsl.log_id
       JOIN passengers p ON bt.passenger_id = p.passenger_id
       WHERE bt.ticket_id = $1`,
      [ticketId]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketRes.rows[0];

    // Check if already checked in
    const existingPass = await db.query('SELECT * FROM boarding_passes WHERE ticket_id = $1', [ticketId]);
    if (existingPass.rows.length > 0) {
      return res.json({ message: 'Passenger is already checked in', boarding_pass: existingPass.rows[0] });
    }

    // Sequence number logic
    const countRes = await db.query(
      'SELECT COUNT(*) FROM boarding_passes bp JOIN bookings_tickets bt ON bp.ticket_id = bt.ticket_id WHERE bt.flight_log_id = $1',
      [ticket.flight_log_id]
    );
    const seqNo = parseInt(countRes.rows[0].count) + 1;

    let group = 'ZONE_3';
    if (ticket.fare_class === 'FIRST') group = 'ZONE_1';
    else if (ticket.fare_class === 'BUSINESS') group = 'ZONE_2';

    const newPass = await db.query(
      `INSERT INTO boarding_passes (ticket_id, sequence_number, boarding_group, security_check_cleared, boarding_status)
       VALUES ($1, $2, $3, TRUE, 'ISSUED')
       RETURNING *`,
      [ticketId, seqNo, group]
    );

    res.json({
      message: 'Web check-in complete. Boarding pass issued.',
      boarding_pass: newPass.rows[0],
    });
  } catch (err) {
    console.error('Check-in error:', err.message);
    res.status(500).json({ error: 'Server error processing check-in' });
  }
});

// GET /api/bookings/:id/boarding-pass - Retrieve Digital Boarding Pass
router.get('/:id/boarding-pass', auth, async (req, res) => {
  try {
    const ticketId = req.params.id;

    const passRes = await db.query(
      `SELECT 
        bp.boarding_pass_id,
        bp.sequence_number,
        bp.boarding_group,
        bp.issue_timestamp,
        bp.security_check_cleared,
        bp.boarding_status,
        bt.ticket_number,
        bt.pnr,
        bt.fare_class,
        bt.seat_number,
        p.first_name,
        p.last_name,
        p.passport_number,
        f.flight_number,
        al.airline_name,
        al.iata_code AS airline_iata,
        orig.iata_code AS origin_iata,
        orig.city AS origin_city,
        dest.iata_code AS dest_iata,
        dest.city AS dest_city,
        fsl.flight_date,
        fsl.estimated_departure,
        fsl.estimated_arrival,
        tg.terminal_code,
        tg.gate_number
      FROM boarding_passes bp
      JOIN bookings_tickets bt ON bp.ticket_id = bt.ticket_id
      JOIN passengers p ON bt.passenger_id = p.passenger_id
      JOIN flight_schedules_log fsl ON bt.flight_log_id = fsl.log_id
      JOIN flights f ON fsl.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports orig ON f.origin_airport_id = orig.airport_id
      JOIN airports dest ON f.destination_airport_id = dest.airport_id
      LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
      WHERE bt.ticket_id = $1`,
      [ticketId]
    );

    if (passRes.rows.length === 0) {
      return res.status(404).json({ error: 'Boarding pass not issued yet for this ticket. Please check in first.' });
    }

    res.json(passRes.rows[0]);
  } catch (err) {
    console.error('Fetch boarding pass error:', err.message);
    res.status(500).json({ error: 'Server error retrieving boarding pass' });
  }
});

// DELETE /api/bookings/:id - Cancel Booking
router.delete('/:id', auth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    await db.query('DELETE FROM bookings_tickets WHERE ticket_id = $1', [ticketId]);
    res.json({ message: 'Booking cancelled successfully' });
  } catch (err) {
    console.error('Cancel booking error:', err.message);
    res.status(500).json({ error: 'Server error cancelling booking' });
  }
});

module.exports = router;
