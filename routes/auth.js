// routes/auth.js — register, login, logout
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const router = express.Router();

const ROLES = ['admin', 'victim', 'volunteer', 'donor'];

// ---------- Registration ----------
router.get('/register', (req, res) => {
  res.render('register', { error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = req.body.role || '';

  // Basic validation
  if (!name || !email || !password || !role) {
    return res.render('register', {
      error: 'All fields are required.',
      form: { name, email, role },
    });
  }
  if (!ROLES.includes(role)) {
    return res.render('register', {
      error: 'Please choose a valid role.',
      form: { name, email, role },
    });
  }
  if (password.length < 6) {
    return res.render('register', {
      error: 'Password must be at least 6 characters.',
      form: { name, email, role },
    });
  }

  try {
    // Reject duplicate emails.
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.render('register', {
        error: 'An account with that email already exists.',
        form: { name, email, role },
      });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );

    return res.redirect('/login?registered=1');
  } catch (err) {
    console.error('Register error:', err);
    return res.render('register', {
      error: 'Something went wrong. Please try again.',
      form: { name, email, role },
    });
  }
});

// ---------- Login ----------
router.get('/login', (req, res) => {
  res.render('login', {
    error: null,
    registered: req.query.registered === '1',
    form: {},
  });
});

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.render('login', {
      error: 'Email and password are required.',
      registered: false,
      form: { email },
    });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('login', {
        error: 'Invalid email or password.',
        registered: false,
        form: { email },
      });
    }

    // Store the essentials in the session.
    req.session.user = { id: user.id, name: user.name, role: user.role };

    return res.redirect(`/${user.role}/dashboard`);
  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', {
      error: 'Something went wrong. Please try again.',
      registered: false,
      form: { email },
    });
  }
});

// ---------- Logout ----------
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
