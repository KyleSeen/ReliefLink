// routes/admin.js — Admin dashboard + two functionalities
//   1) Manage Shelters   (shelters table)
//   2) Assign Volunteers (tasks table + users table)
// Owner: Salman
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();

// Every route here requires being logged in AS an admin.
const guard = [requireLogin, requireRole('admin')];

// Helper: turn empty form values into real SQL NULLs.
function nullIfEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : v;
}

// ---------------------------------------------------------------
// DASHBOARD — loads all data for both features and renders the page
// ---------------------------------------------------------------
router.get('/dashboard', guard, async (req, res) => {
  try {
    const [shelters] = await db.query(
      'SELECT * FROM shelters ORDER BY created_at DESC, id DESC'
    );
    const [volunteers] = await db.query(
      "SELECT id, name, email, availability FROM users WHERE role = 'volunteer' ORDER BY name"
    );
    const [tasks] = await db.query(
      `SELECT t.*, u.name AS volunteer_name, s.name AS shelter_name
         FROM tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         LEFT JOIN shelters s ON t.shelter_id = s.id
        ORDER BY t.created_at DESC, t.id DESC`
    );

    res.render('dashboards/admin', {
      shelters,
      volunteers,
      tasks,
      ok: req.query.ok || null,
      err: req.query.err || null,
      tab: req.query.tab === 'tasks' ? 'tasks' : 'shelters',
    });
  } catch (e) {
    console.error('Admin dashboard error:', e);
    res.render('dashboards/admin', {
      shelters: [], volunteers: [], tasks: [],
      ok: null, err: 'Could not load data. Is the database running?', tab: 'shelters',
    });
  }
});

// ===============================================================
// FEATURE 1 — MANAGE SHELTERS
// ===============================================================

// Add a shelter
router.post('/shelters', guard, async (req, res) => {
  const name = (req.body.name || '').trim();
  const location = (req.body.location || '').trim();
  const capacity = parseInt(req.body.capacity, 10);

  if (!name || !location || Number.isNaN(capacity) || capacity < 0) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' +
      encodeURIComponent('Shelter needs a name, location, and a capacity of 0 or more.'));
  }
  try {
    await db.query(
      "INSERT INTO shelters (name, location, capacity, current_occupancy, status) VALUES (?, ?, ?, 0, 'open')",
      [name, location, capacity]
    );
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter added.'));
  } catch (e) {
    console.error('Add shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not add shelter.'));
  }
});

// Update a shelter's occupancy + status
router.post('/shelters/:id/update', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const occupancy = parseInt(req.body.current_occupancy, 10);
  const status = req.body.status;
  const allowed = ['open', 'full', 'closed'];

  if (Number.isNaN(id) || Number.isNaN(occupancy) || occupancy < 0 || !allowed.includes(status)) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' +
      encodeURIComponent('Invalid shelter update.'));
  }
  try {
    await db.query(
      'UPDATE shelters SET current_occupancy = ?, status = ? WHERE id = ?',
      [occupancy, status, id]
    );
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter updated.'));
  } catch (e) {
    console.error('Update shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not update shelter.'));
  }
});

// Delete a shelter
router.post('/shelters/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Invalid shelter.'));
  }
  try {
    await db.query('DELETE FROM shelters WHERE id = ?', [id]);
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter deleted.'));
  } catch (e) {
    console.error('Delete shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not delete shelter.'));
  }
});

// ===============================================================
// FEATURE 2 — ASSIGN VOLUNTEERS (via tasks)
// ===============================================================

// Create a task and (optionally) assign it to a volunteer
router.post('/tasks', guard, async (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const shelterId = nullIfEmpty(req.body.shelter_id);
  const assignedTo = nullIfEmpty(req.body.assigned_to);

  if (!title) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' +
      encodeURIComponent('A task needs a title.'));
  }
  const status = assignedTo ? 'accepted' : 'open';
  try {
    await db.query(
      'INSERT INTO tasks (title, description, shelter_id, assigned_to, status) VALUES (?, ?, ?, ?, ?)',
      [title, description || null, shelterId, assignedTo, status]
    );
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent('Task created.'));
  } catch (e) {
    console.error('Create task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not create task.'));
  }
});

// Assign / reassign / unassign a volunteer on an existing task
router.post('/tasks/:id/assign', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const assignedTo = nullIfEmpty(req.body.assigned_to);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Invalid task.'));
  }
  // Assigning someone moves an open task to 'accepted'; clearing it returns to 'open'.
  const status = assignedTo ? 'accepted' : 'open';
  try {
    await db.query(
      'UPDATE tasks SET assigned_to = ?, status = ? WHERE id = ?',
      [assignedTo, status, id]
    );
    const msg = assignedTo ? 'Volunteer assigned.' : 'Task unassigned.';
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent(msg));
  } catch (e) {
    console.error('Assign task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not assign volunteer.'));
  }
});

// Delete a task
router.post('/tasks/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Invalid task.'));
  }
  try {
    await db.query('DELETE FROM tasks WHERE id = ?', [id]);
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent('Task deleted.'));
  } catch (e) {
    console.error('Delete task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not delete task.'));
  }
});

module.exports = router;
