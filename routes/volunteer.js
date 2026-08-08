// routes/volunteer.js — Volunteer dashboard route (empty shell)
// TEAM (Saeed): add your Volunteer routes here. They should render sections in
// views/dashboards/volunteer.ejs and query the tasks / users tables.
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when you start querying

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('volunteer'), (req, res) => {
  res.render('dashboards/volunteer');
});

module.exports = router;
