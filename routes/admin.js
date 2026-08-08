// routes/admin.js — Admin dashboard route (empty shell)
// TEAM (Salman): add your Admin routes here. They should render sections in
// views/dashboards/admin.ejs and query the shelters / tasks / users tables.
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when you start querying

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('admin'), (req, res) => {
  res.render('dashboards/admin');
});

module.exports = router;
