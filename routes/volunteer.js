// routes/volunteer.js — Volunteer dashboard route (empty shell)
// TEAM (Saeed): add your Volunteer routes here. They should render sections in
// views/dashboards/volunteer.ejs and query the tasks / users tables.
//
// NOTE FOR OWNER (Saeed): when you build the task status route and a task reaches
// 'completed', call the shared helpers inside your transaction to notify the
// victim and admin and to record the audit entry. Do not add these anywhere else.
//   const { notify } = require('../services/notify');
//   const { logActivity } = require('../services/audit');
//   -> notify(conn, victimUserId, 'task_completed', message, '/victim/dashboard')
//   -> notify(conn, adminId,      'task_completed', message, '/admin/dashboard')
//   -> logActivity(conn, req, 'task.completed', 'task', taskId, taskTitle)
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
// const db = require('../config/db'); // uncomment when you start querying

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('volunteer'), (req, res) => {
  res.render('dashboards/volunteer');
});

module.exports = router;
