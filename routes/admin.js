// Admin dashboard. Owner: Salman. Tables: shelters, tasks, users, aid_requests
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');
const { notify, notifyAdmins } = require('../services/notify');
const { logActivity } = require('../services/audit');

const router = express.Router();
const guard = [requireLogin, requireRole('admin')];

const PAGE_SIZE = 25;

function nullIfEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : v;
}

// A shelter is 'full' once occupancy reaches capacity, otherwise 'open'. A
// manually-set 'closed' is never overridden automatically.
function deriveStatus(occupancy, capacity, currentStatus) {
  if (currentStatus === 'closed') return 'closed';
  return occupancy >= capacity ? 'full' : 'open';
}

router.get('/dashboard', guard, async (req, res) => {
  const allowedTabs = ['shelters', 'tasks', 'requests', 'activity'];
  const tab = allowedTabs.includes(req.query.tab) ? req.query.tab : 'shelters';
  try {
    const [shelters] = await db.query(
      'SELECT * FROM shelters ORDER BY created_at DESC, id DESC'
    );
    const [volunteers] = await db.query(
      "SELECT id, name, email, availability FROM users WHERE role = 'volunteer' AND availability = 'available' ORDER BY name"
    );
    const [tasks] = await db.query(
      `SELECT t.*, u.name AS volunteer_name, s.name AS shelter_name
         FROM tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         LEFT JOIN shelters s ON t.shelter_id = s.id
        ORDER BY t.created_at DESC, t.id DESC`
    );
    // Pending requests scored by urgency: need severity + people + wait time.
    const [aidRequests] = await db.query(
      `SELECT r.*, u.name AS requester_name, s.name AS shelter_name,
              (CASE r.need_type
                 WHEN 'medical' THEN 40
                 WHEN 'water'   THEN 30
                 WHEN 'food'    THEN 20
                 WHEN 'shelter' THEN 25
                 ELSE 10 END
               + LEAST(r.people_count * 3, 30)
               + LEAST(TIMESTAMPDIFF(HOUR, r.created_at, NOW()) * 2, 30)) AS priority_score
         FROM aid_requests r
         JOIN users u ON r.user_id = u.id
         LEFT JOIN shelters s ON r.shelter_id = s.id
        WHERE r.status = 'pending'
        ORDER BY priority_score DESC, r.created_at ASC`
    );
    const [[stats]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM shelters)                                            AS total_shelters,
         (SELECT COUNT(*) FROM shelters WHERE status = 'full')                       AS full_shelters,
         (SELECT COALESCE(SUM(GREATEST(capacity - current_occupancy, 0)), 0)
            FROM shelters)                                                           AS spaces_remaining,
         (SELECT COUNT(*) FROM aid_requests WHERE status = 'pending')                AS pending_requests,
         (SELECT COUNT(*) FROM users WHERE role = 'volunteer'
            AND availability = 'available')                                          AS volunteers_available`
    );

    // Activity log (filtered + paginated). Isolated so a missing table before
    // migration does not blank the whole dashboard.
    let activity = { rows: [], total: 0, page: 1, pages: 1, actions: [], role: '', action: '' };
    try {
      const fRole = ['admin', 'victim', 'volunteer', 'donor'].includes(req.query.role) ? req.query.role : '';
      const fAction = (req.query.action || '').trim();
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

      let where = '1 = 1';
      const params = [];
      if (fRole) { where += ' AND user_role = ?'; params.push(fRole); }
      if (fAction) { where += ' AND action = ?'; params.push(fAction); }

      const [[cnt]] = await db.query(`SELECT COUNT(*) AS total FROM activity_log WHERE ${where}`, params);
      const total = Number(cnt.total) || 0;
      const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
      const offset = (page - 1) * PAGE_SIZE;
      const [rows] = await db.query(
        `SELECT * FROM activity_log WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE} OFFSET ?`,
        [...params, offset]
      );
      const [actions] = await db.query('SELECT DISTINCT action FROM activity_log ORDER BY action');
      activity = { rows, total, page, pages, actions: actions.map(a => a.action), role: fRole, action: fAction };
    } catch (logErr) {
      console.error('Activity log fetch error:', logErr);
    }

    res.render('dashboards/admin', {
      shelters, volunteers, tasks, aidRequests, activity,
      stats: {
        totalShelters: Number(stats.total_shelters) || 0,
        fullShelters: Number(stats.full_shelters) || 0,
        spacesRemaining: Number(stats.spaces_remaining) || 0,
        pendingRequests: Number(stats.pending_requests) || 0,
        volunteersAvailable: Number(stats.volunteers_available) || 0,
      },
      ok: req.query.ok || null,
      err: req.query.err || null,
      tab,
    });
  } catch (e) {
    console.error('Admin dashboard error:', e);
    res.render('dashboards/admin', {
      shelters: [], volunteers: [], tasks: [], aidRequests: [],
      activity: { rows: [], total: 0, page: 1, pages: 1, actions: [], role: '', action: '' },
      stats: { totalShelters: 0, fullShelters: 0, spacesRemaining: 0, pendingRequests: 0, volunteersAvailable: 0 },
      ok: null, err: 'Could not load data. Is the database running?', tab: 'shelters',
    });
  }
});

router.post('/shelters', guard, async (req, res) => {
  const name = (req.body.name || '').trim();
  const location = (req.body.location || '').trim();
  const capacity = parseInt(req.body.capacity, 10);

  if (!name || !location || Number.isNaN(capacity) || capacity < 0) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' +
      encodeURIComponent('Enter a name, location, and a capacity of 0 or more.'));
  }
  try {
    const [r] = await db.query(
      "INSERT INTO shelters (name, location, capacity, current_occupancy, status) VALUES (?, ?, ?, 0, 'open')",
      [name, location, capacity]
    );
    await logActivity(null, req, 'shelter.created', 'shelter', r.insertId, name);
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter added.'));
  } catch (e) {
    console.error('Add shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not add shelter.'));
  }
});

router.post('/shelters/:id/update', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  let occupancy = parseInt(req.body.current_occupancy, 10);
  const chosenStatus = req.body.status;
  const allowed = ['open', 'full', 'closed'];

  if (Number.isNaN(id) || Number.isNaN(occupancy) || occupancy < 0 || !allowed.includes(chosenStatus)) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' +
      encodeURIComponent('Invalid shelter update.'));
  }
  try {
    const [rows] = await db.query('SELECT name, capacity, status FROM shelters WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Shelter not found.'));
    }
    const capacity = rows[0].capacity;
    const wasFull = rows[0].status === 'full';
    occupancy = Math.min(occupancy, capacity);
    const status = deriveStatus(occupancy, capacity, chosenStatus);
    await db.query(
      'UPDATE shelters SET current_occupancy = ?, status = ? WHERE id = ?',
      [occupancy, status, id]
    );
    await logActivity(null, req, 'shelter.updated', 'shelter', id, rows[0].name);
    if (status === 'full' && !wasFull) {
      await notifyAdmins(null, 'shelter_full', `${rows[0].name} is now full.`, '/admin/dashboard');
    }
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter updated.'));
  } catch (e) {
    console.error('Update shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not update shelter.'));
  }
});

router.post('/shelters/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Invalid shelter.'));
  }
  try {
    const [rows] = await db.query('SELECT name, current_occupancy FROM shelters WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Shelter not found.'));
    }
    if (rows[0].current_occupancy > 0) {
      return res.redirect('/admin/dashboard?tab=shelters&err=' +
        encodeURIComponent('Cannot delete a shelter that still has people in it. Move them out first.'));
    }
    await db.query('DELETE FROM shelters WHERE id = ?', [id]);
    await logActivity(null, req, 'shelter.deleted', 'shelter', id, rows[0].name);
    res.redirect('/admin/dashboard?tab=shelters&ok=' + encodeURIComponent('Shelter deleted.'));
  } catch (e) {
    console.error('Delete shelter error:', e);
    res.redirect('/admin/dashboard?tab=shelters&err=' + encodeURIComponent('Could not delete shelter.'));
  }
});

router.post('/tasks', guard, async (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const shelterId = nullIfEmpty(req.body.shelter_id);
  const assignedTo = nullIfEmpty(req.body.assigned_to);

  if (!title) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Enter a task title.'));
  }
  const status = assignedTo ? 'accepted' : 'open';
  try {
    const [r] = await db.query(
      'INSERT INTO tasks (title, description, shelter_id, assigned_to, status) VALUES (?, ?, ?, ?, ?)',
      [title, description || null, shelterId, assignedTo, status]
    );
    await logActivity(null, req, 'task.created', 'task', r.insertId, title);
    if (assignedTo) {
      await notify(null, assignedTo, 'task_assigned', `You have been assigned: ${title}.`, '/volunteer/dashboard');
    }
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent('Task created.'));
  } catch (e) {
    console.error('Create task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not create task.'));
  }
});

router.post('/tasks/:id/assign', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const assignedTo = nullIfEmpty(req.body.assigned_to);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Invalid task.'));
  }
  const status = assignedTo ? 'accepted' : 'open';
  try {
    const [rows] = await db.query('SELECT title FROM tasks WHERE id = ?', [id]);
    await db.query(
      'UPDATE tasks SET assigned_to = ?, status = ? WHERE id = ?',
      [assignedTo, status, id]
    );
    const title = rows.length ? rows[0].title : 'a task';
    await logActivity(null, req, 'task.assigned', 'task', id, title);
    if (assignedTo) {
      await notify(null, assignedTo, 'task_assigned', `You have been assigned: ${title}.`, '/volunteer/dashboard');
    }
    const msg = assignedTo ? 'Volunteer assigned.' : 'Task unassigned.';
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent(msg));
  } catch (e) {
    console.error('Assign task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not assign volunteer.'));
  }
});

router.post('/tasks/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Invalid task.'));
  }
  try {
    await db.query('DELETE FROM tasks WHERE id = ?', [id]);
    await logActivity(null, req, 'task.deleted', 'task', id, null);
    res.redirect('/admin/dashboard?tab=tasks&ok=' + encodeURIComponent('Task deleted.'));
  } catch (e) {
    console.error('Delete task error:', e);
    res.redirect('/admin/dashboard?tab=tasks&err=' + encodeURIComponent('Could not delete task.'));
  }
});

// Turn a pending aid request into a task inside a transaction: link them, mark
// the request assigned, book people into the shelter under the capacity rule,
// notify the victim, and notify admins if the shelter fills up.
router.post('/aid-requests/:id/raise-task', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/admin/dashboard?tab=requests&err=' + encodeURIComponent('Invalid request.'));
  }

  try {
    const [reqRows] = await db.query(
      `SELECT r.*, u.name AS requester_name
         FROM aid_requests r JOIN users u ON r.user_id = u.id
        WHERE r.id = ? AND r.status = 'pending'`,
      [id]
    );
    if (reqRows.length === 0) {
      return res.redirect('/admin/dashboard?tab=requests&err=' +
        encodeURIComponent('That request has already been handled.'));
    }
    const request = reqRows[0];
    const title =
      `Deliver ${request.need_type} for ${request.requester_name} (${request.people_count} people)`;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let shelterFilled = null;
      if (request.shelter_id) {
        const [sh] = await conn.query(
          'SELECT id, name, capacity, current_occupancy, status FROM shelters WHERE id = ? FOR UPDATE',
          [request.shelter_id]
        );
        if (sh.length === 0) {
          await conn.rollback();
          return res.redirect('/admin/dashboard?tab=requests&err=' +
            encodeURIComponent('The shelter on that request no longer exists.'));
        }
        const shelter = sh[0];
        const free = shelter.capacity - shelter.current_occupancy;
        if (free < request.people_count) {
          await conn.rollback();
          return res.redirect('/admin/dashboard?tab=requests&err=' +
            encodeURIComponent(
              `Not enough room at that shelter (${free} space(s) left, ${request.people_count} needed).`));
        }
        const newOcc = Math.min(shelter.current_occupancy + request.people_count, shelter.capacity);
        const newStatus = deriveStatus(newOcc, shelter.capacity, shelter.status);
        await conn.query(
          'UPDATE shelters SET current_occupancy = ?, status = ? WHERE id = ?',
          [newOcc, newStatus, shelter.id]
        );
        if (newStatus === 'full' && shelter.status !== 'full') shelterFilled = shelter.name;
      }

      const [tr] = await conn.query(
        `INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
         VALUES (?, NULL, ?, ?, NULL, 'open')`,
        [title, request.id, request.shelter_id]
      );
      await conn.query("UPDATE aid_requests SET status = 'assigned' WHERE id = ?", [request.id]);

      await notify(conn, request.user_id, 'request_assigned',
        `Your request for ${request.need_type} is now being handled.`, '/victim/dashboard');
      if (shelterFilled) {
        await notifyAdmins(conn, 'shelter_full', `${shelterFilled} is now full.`, '/admin/dashboard');
      }
      await logActivity(conn, req, 'task.raised', 'task', tr.insertId, title);

      await conn.commit();
      res.redirect('/admin/dashboard?tab=tasks&ok=' +
        encodeURIComponent('Task raised from aid request. Now assign a volunteer.'));
    } catch (txErr) {
      await conn.rollback();
      console.error('Raise-task transaction error:', txErr);
      res.redirect('/admin/dashboard?tab=requests&err=' +
        encodeURIComponent('Could not raise the task. No changes were made.'));
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Raise-task error:', e);
    res.redirect('/admin/dashboard?tab=requests&err=' + encodeURIComponent('Could not raise the task.'));
  }
});

module.exports = router;
