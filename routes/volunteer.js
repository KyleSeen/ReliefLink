// Volunteer dashboard. Owner: Saeed. Tables: tasks, users, volunteer_logs, aid_requests, notifications
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');
const { notify, notifyAdmins } = require('../services/notify');
const { logActivity } = require('../services/audit');

const router = express.Router();
const guard = [requireLogin, requireRole('volunteer')];

const AVAILABILITY = ['available', 'busy', 'off'];
// A volunteer may only push a task one step forward at a time.
const NEXT_STATUS = { accepted: 'in_progress', in_progress: 'completed' };

function nullIfEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : v;
}

function back(tab, kind, msg) {
  const params = new URLSearchParams({ tab });
  params.set(kind, msg);
  return '/volunteer/dashboard?' + params.toString();
}

router.get('/dashboard', guard, async (req, res) => {
  const userId = req.session.user.id;
  const tab = req.query.tab === 'log' ? 'log' : 'tasks';

  try {
    const [tasks] = await db.query(
      `SELECT t.*, s.name AS shelter_name,
              r.need_type AS request_need, r.people_count AS request_people
         FROM tasks t
         LEFT JOIN shelters s     ON t.shelter_id = s.id
         LEFT JOIN aid_requests r ON t.request_id = r.id
        WHERE t.assigned_to = ?
        ORDER BY FIELD(t.status,'accepted','in_progress','completed'), t.created_at DESC`,
      [userId]
    );
    const [logs] = await db.query(
      `SELECT l.*, t.title AS task_title
         FROM volunteer_logs l
         LEFT JOIN tasks t ON l.task_id = t.id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC, l.id DESC`,
      [userId]
    );
    const [me] = await db.query('SELECT availability FROM users WHERE id = ?', [userId]);
    const availability = me.length ? me[0].availability : 'available';

    const [[taskStats]] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'completed')   AS completed,
              SUM(status = 'in_progress') AS in_progress
         FROM tasks WHERE assigned_to = ?`,
      [userId]
    );
    const [[logStats]] = await db.query(
      'SELECT COUNT(*) AS log_count FROM volunteer_logs WHERE user_id = ?',
      [userId]
    );

    res.render('dashboards/volunteer', {
      tasks, logs, availability,
      stats: {
        total: Number(taskStats.total) || 0,
        completed: Number(taskStats.completed) || 0,
        inProgress: Number(taskStats.in_progress) || 0,
        logs: Number(logStats.log_count) || 0,
      },
      availabilityOptions: AVAILABILITY,
      tab,
      ok: req.query.ok || null,
      err: req.query.err || null,
    });
  } catch (e) {
    console.error('Volunteer dashboard error:', e);
    res.render('dashboards/volunteer', {
      tasks: [], logs: [], availability: 'available',
      stats: { total: 0, completed: 0, inProgress: 0, logs: 0 },
      availabilityOptions: AVAILABILITY, tab: 'tasks',
      ok: null, err: 'Could not load data. Is the database running?',
    });
  }
});

router.post('/tasks/:id/status', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = req.body.status;
  const userId = req.session.user.id;

  if (Number.isNaN(id) || !['in_progress', 'completed'].includes(target)) {
    return res.redirect(back('tasks', 'err', 'Invalid task update.'));
  }

  try {
    // The assigned_to check stops a volunteer touching another volunteer's task
    // by editing the id in the URL.
    const [rows] = await db.query(
      'SELECT id, title, status, request_id FROM tasks WHERE id = ? AND assigned_to = ?',
      [id, userId]
    );
    if (rows.length === 0) {
      return res.redirect(back('tasks', 'err', 'That task is not assigned to you.'));
    }
    const task = rows[0];
    if (NEXT_STATUS[task.status] !== target) {
      return res.redirect(back('tasks', 'err',
        `A task that is "${task.status}" cannot move to "${target}".`));
    }

    if (target !== 'completed') {
      const [result] = await db.query(
        'UPDATE tasks SET status = ? WHERE id = ? AND assigned_to = ?',
        [target, id, userId]
      );
      if (result.affectedRows === 0) {
        return res.redirect(back('tasks', 'err', 'That task is not assigned to you.'));
      }
      await logActivity(null, req, 'task.started', 'task', id, task.title);
      return res.redirect(back('tasks', 'ok', 'Task marked in progress.'));
    }

    // Completing a task resolves the aid request, frees the volunteer, writes a
    // log entry, and notifies the victim and admins. All four writes are one
    // transaction: either everything commits or nothing does, so a completed
    // task can never leave its victim showing as still waiting.
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        "UPDATE tasks SET status = 'completed' WHERE id = ? AND assigned_to = ?",
        [id, userId]
      );

      let victimId = null;
      let needType = null;
      if (task.request_id) {
        const [reqRows] = await conn.query(
          'SELECT user_id, need_type FROM aid_requests WHERE id = ?',
          [task.request_id]
        );
        if (reqRows.length) { victimId = reqRows[0].user_id; needType = reqRows[0].need_type; }
        await conn.query("UPDATE aid_requests SET status = 'resolved' WHERE id = ?", [task.request_id]);
      }

      await conn.query("UPDATE users SET availability = 'available' WHERE id = ?", [userId]);

      await conn.query(
        `INSERT INTO volunteer_logs (user_id, task_id, activity, notes, status)
         VALUES (?, ?, ?, 'Recorded automatically', 'logged')`,
        [userId, id, `Completed: ${task.title}`]
      );

      if (victimId) {
        await notify(conn, victimId, 'task_completed',
          `Your request for ${needType} has been completed.`, '/victim/dashboard');
      }
      await notifyAdmins(conn, 'task_completed', `${task.title} was completed.`, '/admin/dashboard');
      await logActivity(conn, req, 'task.completed', 'task', id, task.title);

      await conn.commit();
      res.redirect(back('tasks', 'ok', 'Task completed. The aid request is resolved and you are marked available.'));
    } catch (txErr) {
      await conn.rollback();
      console.error('Complete-task transaction error:', txErr);
      res.redirect(back('tasks', 'err', 'Could not complete the task. No changes were made.'));
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Task status error:', e);
    res.redirect(back('tasks', 'err', 'Could not update the task.'));
  }
});

router.post('/availability', guard, async (req, res) => {
  const availability = req.body.availability;
  if (!AVAILABILITY.includes(availability)) {
    return res.redirect(back('tasks', 'err', 'Invalid availability value.'));
  }
  try {
    await db.query('UPDATE users SET availability = ? WHERE id = ?',
      [availability, req.session.user.id]);
    await logActivity(null, req, 'availability.set', 'user', req.session.user.id, availability);
    res.redirect(back('tasks', 'ok', 'Availability updated.'));
  } catch (e) {
    console.error('Availability error:', e);
    res.redirect(back('tasks', 'err', 'Could not update availability.'));
  }
});

router.post('/logs', guard, async (req, res) => {
  const userId = req.session.user.id;
  const activity = (req.body.activity || '').trim();
  const notes = (req.body.notes || '').trim();
  const taskId = nullIfEmpty(req.body.task_id);

  if (activity.length < 3) {
    return res.redirect(back('log', 'err', 'Activity must be at least 3 characters.'));
  }
  try {
    if (taskId) {
      const [own] = await db.query(
        'SELECT id FROM tasks WHERE id = ? AND assigned_to = ?', [taskId, userId]);
      if (own.length === 0) {
        return res.redirect(back('log', 'err', 'You can only log against your own tasks.'));
      }
    }
    const [ins] = await db.query(
      `INSERT INTO volunteer_logs (user_id, task_id, activity, notes, status)
       VALUES (?, ?, ?, ?, 'logged')`,
      [userId, taskId, activity, notes || null]
    );
    await logActivity(null, req, 'log.created', 'volunteer_log', ins.insertId, activity);
    res.redirect(back('log', 'ok', 'Log entry added.'));
  } catch (e) {
    console.error('Create log error:', e);
    res.redirect(back('log', 'err', 'Could not add log entry.'));
  }
});

router.post('/logs/:id/update', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const activity = (req.body.activity || '').trim();
  const notes = (req.body.notes || '').trim();

  if (Number.isNaN(id) || activity.length < 3) {
    return res.redirect(back('log', 'err', 'Activity must be at least 3 characters.'));
  }
  try {
    // status = 'logged' stops edits once an entry has been verified.
    const [result] = await db.query(
      `UPDATE volunteer_logs SET activity = ?, notes = ?
        WHERE id = ? AND user_id = ? AND status = 'logged'`,
      [activity, notes || null, id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('log', 'err',
        'That entry can no longer be edited because it has been verified.'));
    }
    await logActivity(null, req, 'log.updated', 'volunteer_log', id, activity);
    res.redirect(back('log', 'ok', 'Log entry updated.'));
  } catch (e) {
    console.error('Update log error:', e);
    res.redirect(back('log', 'err', 'Could not update log entry.'));
  }
});

router.post('/logs/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect(back('log', 'err', 'Invalid log entry.'));
  }
  try {
    const [result] = await db.query(
      `DELETE FROM volunteer_logs WHERE id = ? AND user_id = ? AND status = 'logged'`,
      [id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('log', 'err',
        'That entry can no longer be deleted because it has been verified.'));
    }
    await logActivity(null, req, 'log.deleted', 'volunteer_log', id, null);
    res.redirect(back('log', 'ok', 'Log entry deleted.'));
  } catch (e) {
    console.error('Delete log error:', e);
    res.redirect(back('log', 'err', 'Could not delete log entry.'));
  }
});

module.exports = router;
