const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Helper to generate unique Bag Tag number
function generateBagTag() {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `BAG-${num}`;
}

// GET /api/baggage/track/:query - Track luggage by Bag Tag Number OR PNR
router.get('/track/:query', async (req, res) => {
  try {
    const query = req.params.query.trim().toUpperCase();

    const sql = `
      SELECT 
        b.baggage_id,
        b.bag_tag_number,
        b.weight_kg,
        b.allowed_weight_kg,
        b.excess_fee_paid,
        b.security_scan_result,
        b.baggage_status,
        b.arrival_carousel,
        bt.ticket_number,
        bt.pnr,
        bt.seat_number,
        p.first_name,
        p.last_name,
        f.flight_number,
        al.airline_name,
        orig.iata_code AS origin_iata,
        orig.city AS origin_city,
        dest.iata_code AS dest_iata,
        dest.city AS dest_city,
        fsl.estimated_departure,
        fsl.estimated_arrival,
        tg.terminal_code,
        tg.gate_number
      FROM baggage b
      JOIN bookings_tickets bt ON b.ticket_id = bt.ticket_id
      JOIN passengers p ON bt.passenger_id = p.passenger_id
      JOIN flight_schedules_log fsl ON bt.flight_log_id = fsl.log_id
      JOIN flights f ON fsl.flight_id = f.flight_id
      JOIN airlines al ON f.airline_id = al.airline_id
      JOIN airports orig ON f.origin_airport_id = orig.airport_id
      JOIN airports dest ON f.destination_airport_id = dest.airport_id
      LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
      WHERE UPPER(b.bag_tag_number) = $1 OR UPPER(bt.pnr) = $1
    `;

    const result = await db.query(sql, [query]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `No baggage found matching query '${query}'. Please check your Bag Tag or PNR.` });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Baggage track error:', err.message);
    res.status(500).json({ error: 'Server error tracking baggage' });
  }
});

// POST /api/baggage/checkin - Register new baggage for a ticket
router.post('/checkin', auth, async (req, res) => {
  try {
    const { ticket_id, weight_kg, allowed_weight_kg = 15.00 } = req.body;

    if (!ticket_id || !weight_kg) {
      return res.status(400).json({ error: 'Ticket ID and luggage weight are required' });
    }

    const weight = parseFloat(weight_kg);
    if (isNaN(weight) || weight <= 0 || weight > 50) {
      return res.status(400).json({ error: 'Baggage weight must be between 0.1 kg and 50 kg' });
    }

    const ticketRes = await db.query('SELECT ticket_id, pnr FROM bookings_tickets WHERE ticket_id = $1', [ticket_id]);
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const bagTag = generateBagTag();
    const carousel = `Carousel ${Math.floor(1 + Math.random() * 8)}`;

    // The database trigger fn_calculate_baggage_excess_fee will automatically calculate excess_fee_paid if weight > allowed_weight
    const newBag = await db.query(
      `INSERT INTO baggage (ticket_id, bag_tag_number, weight_kg, allowed_weight_kg, security_scan_result, baggage_status, arrival_carousel)
       VALUES ($1, $2, $3, $4, 'PASSED', 'CHECKED_IN', $5)
       RETURNING *`,
      [ticket_id, bagTag, weight, parseFloat(allowed_weight_kg), carousel]
    );

    res.status(201).json({
      message: 'Baggage checked in successfully',
      baggage: newBag.rows[0],
    });
  } catch (err) {
    console.error('Baggage checkin error:', err.message);
    res.status(500).json({ error: err.message || 'Server error checking in baggage' });
  }
});

// PATCH /api/baggage/:id/status - Update Baggage logistics status (Staff / Ramp)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { baggage_status, arrival_carousel, security_scan_result } = req.body;
    const bagId = req.params.id;

    const validStatuses = ['CHECKED_IN', 'SCREENED', 'SORTED', 'LOADED_ON_AIRCRAFT', 'TRANSIT', 'CLAIM_CAROUSEL', 'DELIVERED', 'LOST'];
    if (baggage_status && !validStatuses.includes(baggage_status)) {
      return res.status(400).json({ error: `Invalid baggage status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const fields = [];
    const params = [bagId];

    if (baggage_status) {
      params.push(baggage_status);
      fields.push(`baggage_status = $${params.length}`);
    }

    if (arrival_carousel) {
      params.push(arrival_carousel);
      fields.push(`arrival_carousel = $${params.length}`);
    }

    if (security_scan_result) {
      params.push(security_scan_result);
      fields.push(`security_scan_result = $${params.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const updated = await db.query(
      `UPDATE baggage SET ${fields.join(', ')} WHERE baggage_id = $1 RETURNING *`,
      params
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Baggage item not found' });
    }

    res.json({ message: 'Baggage status updated', baggage: updated.rows[0] });
  } catch (err) {
    console.error('Baggage update status error:', err.message);
    res.status(500).json({ error: 'Server error updating baggage status' });
  }
});

module.exports = router;
