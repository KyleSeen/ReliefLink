// routes/donor.js — Donor dashboard route (empty shell)
// TEAM (Yap Sin Ni): add your Donor routes here. They should render sections in
// views/dashboards/donor.ejs and query donations / shelters / aid_requests.
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when you start querying

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('donor'), (req, res) => {
  res.render('dashboards/donor');
});

module.exports = router;
