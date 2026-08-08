// routes/victim.js — Victim dashboard route (empty shell)
// TEAM (Mangong): add your Victim routes here. They should render sections in
// views/dashboards/victim.ejs and query aid_requests / incident_reports / shelters.
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when you start querying

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('victim'), (req, res) => {
  res.render('dashboards/victim');
});

module.exports = router;
