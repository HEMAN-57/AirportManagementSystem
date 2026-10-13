const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
require('dotenv').config();

// Register new user (passenger or staff)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'passenger', passport_number, phone_number } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please enter name, email, and password' });
    }

    const userExist = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userRole = ['staff', 'admin'].includes(role) ? role : 'passenger';

    await db.query('BEGIN');

    const newUser = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name.trim(), email.toLowerCase().trim(), password_hash, userRole]
    );

    const userObj = newUser.rows[0];

    // If registered as passenger, automatically provision passenger profile
    if (userRole === 'passenger') {
      const names = name.trim().split(' ');
      const firstName = names[0] || 'Passenger';
      const lastName = names.slice(1).join(' ') || 'User';
      const passport = passport_number || `IND${Math.floor(1000000 + Math.random() * 9000000)}`;
      const phone = phone_number || '+91-98000-00000';

      await db.query(
        `INSERT INTO passengers (user_id, first_name, last_name, passport_number, date_of_birth, gender, email, phone_number)
         VALUES ($1, $2, $3, $4, '1995-01-01', 'O', $5, $6)
         ON CONFLICT (passport_number) DO NOTHING`,
        [userObj.id, firstName, lastName, passport, userObj.email, phone]
      );
    }

    await db.query('COMMIT');

    const payload = {
      user: {
        id: userObj.id,
        name: userObj.name,
        email: userObj.email,
        role: userObj.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'supersecret_ams_jwt_key_2026',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({ token, user: payload.user });
      }
    );
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter both email and password' });
    }

    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'supersecret_ams_jwt_key_2026',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: payload.user });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get Current User Profile
router.get('/me', auth, async (req, res) => {
  try {
    const userRes = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    let passenger = null;

    if (user.role === 'passenger') {
      const pRes = await db.query('SELECT * FROM passengers WHERE user_id = $1', [user.id]);
      if (pRes.rows.length > 0) {
        passenger = pRes.rows[0];
      }
    }

    res.json({ user, passenger });
  } catch (err) {
    console.error('Fetch profile error:', err.message);
    res.status(500).json({ error: 'Server error retrieving user profile' });
  }
});

module.exports = router;
