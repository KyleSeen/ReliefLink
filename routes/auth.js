// Authentication: register, login, logout. Table: users
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logActivity } = require('../services/audit');

const router = express.Router();

const ROLES = ['admin', 'victim', 'volunteer', 'donor'];

router.get('/register', (req, res) => {
  res.render('register', { error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = req.body.role || '';

  if (!name || !email || !password || !role) {
    return res.render('register', {
      error: 'Enter your name, email, password, and role.',
      form: { name, email, role },
    });
  }
  if (!ROLES.includes(role)) {
    return res.render('register', {
      error: 'Choose a valid role.',
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
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.render('register', {
        error: 'An account with that email already exists.',
        form: { name, email, role },
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const [ins] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    await logActivity(null, { session: { user: { id: ins.insertId, name, role } } },
      'auth.register', 'user', ins.insertId, `${role}`);

    return res.redirect('/login?registered=1');
  } catch (err) {
    console.error('Register error:', err);
    return res.render('register', {
      error: 'Something went wrong. Try again.',
      form: { name, email, role },
    });
  }
});

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
      error: 'Enter your email and password.',
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

    req.session.user = { id: user.id, name: user.name, role: user.role };
    await logActivity(null, req, 'auth.login', 'user', user.id, null);
    return res.redirect(`/${user.role}/dashboard`);
  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', {
      error: 'Something went wrong. Try again.',
      registered: false,
      form: { email },
    });
  }
});

router.get('/logout', async (req, res) => {
  await logActivity(null, req, 'auth.logout', 'user',
    req.session.user ? req.session.user.id : null, null);
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
