// Victim dashboard. Owner: Seen Man Hong (TP069765). Tables: aid_requests, incident_reports, shelters
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');
const { logActivity } = require('../services/audit');

const router = express.Router();
const guard = [requireLogin, requireRole('victim')];

// Allowed values checked server-side so a tampered form cannot insert junk.
const NEED_TYPES = ['food', 'water', 'medical', 'shelter', 'clothing', 'rescue'];
const INCIDENT_TYPES = [
  'flood', 'landslide', 'fire', 'storm damage',
  'building collapse', 'medical emergency', 'other',
];

function nullIfEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : v;
}

function back(tab, kind, msg) {
  const params = new URLSearchParams({ tab });
  params.set(kind, msg);
  return '/victim/dashboard?' + params.toString();
}

router.get('/dashboard', guard, async (req, res) => {
  const userId = req.session.user.id;
  const q = (req.query.q || '').trim();
  const tab = req.query.tab === 'reports' ? 'reports' : 'shelter';

  try {
    const like = `%${q}%`;
    const [shelters] = await db.query(
      `SELECT id, name, location, capacity, current_occupancy, status,
              GREATEST(capacity - current_occupancy, 0) AS free_spaces
         FROM shelters
        WHERE status <> 'closed'
          AND (name LIKE ? OR location LIKE ?)
        ORDER BY (status = 'open') DESC, free_spaces DESC, name`,
      [like, like]
    );
    const [shelterOptions] = await db.query(
      `SELECT id, name, location, status FROM shelters
        WHERE status <> 'closed'
        ORDER BY name`
    );
    const [requests] = await db.query(
      `SELECT r.*, s.name AS shelter_name, s.location AS shelter_location
         FROM aid_requests r
         LEFT JOIN shelters s ON r.shelter_id = s.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC, r.id DESC`,
      [userId]
    );
    const [reports] = await db.query(
      `SELECT * FROM incident_reports
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC`,
      [userId]
    );
    const [[st]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM aid_requests WHERE user_id = ? AND status <> 'resolved') AS active_requests,
         (SELECT COUNT(*) FROM aid_requests WHERE user_id = ? AND status = 'resolved')   AS resolved_requests,
         (SELECT COUNT(*) FROM incident_reports WHERE user_id = ? AND status <> 'resolved') AS open_reports,
         (SELECT COUNT(*) FROM incident_reports WHERE user_id = ? AND status = 'resolved')  AS resolved_reports,
         (SELECT COUNT(*) FROM shelters WHERE status = 'open'
            AND (capacity - current_occupancy) > 0) AS shelters_with_space`,
      [userId, userId, userId, userId]
    );
    const stats = {
      activeRequests: Number(st.active_requests) || 0,
      sheltersWithSpace: Number(st.shelters_with_space) || 0,
      openReports: Number(st.open_reports) || 0,
      resolved: (Number(st.resolved_requests) || 0) + (Number(st.resolved_reports) || 0),
    };

    res.render('dashboards/victim', {
      shelters, shelterOptions, requests, reports, stats,
      needTypes: NEED_TYPES,
      incidentTypes: INCIDENT_TYPES,
      q,
      tab,
      ok: req.query.ok || null,
      err: req.query.err || null,
    });
  } catch (e) {
    console.error('Victim dashboard error:', e);
    res.render('dashboards/victim', {
      shelters: [], shelterOptions: [], requests: [], reports: [],
      stats: { activeRequests: 0, sheltersWithSpace: 0, openReports: 0, resolved: 0 },
      needTypes: NEED_TYPES, incidentTypes: INCIDENT_TYPES,
      q: '', tab: 'shelter',
      ok: null, err: 'Could not load data. Is the database running?',
    });
  }
});

router.post('/aid-requests', guard, async (req, res) => {
  const needType = (req.body.need_type || '').trim();
  const peopleCount = parseInt(req.body.people_count, 10);
  const shelterId = nullIfEmpty(req.body.shelter_id);

  if (!NEED_TYPES.includes(needType)) {
    return res.redirect(back('shelter', 'err', 'Choose a valid type of aid.'));
  }
  if (Number.isNaN(peopleCount) || peopleCount < 1 || peopleCount > 500) {
    return res.redirect(back('shelter', 'err', 'Number of people must be between 1 and 500.'));
  }

  try {
    if (shelterId) {
      const [found] = await db.query('SELECT id FROM shelters WHERE id = ?', [shelterId]);
      if (found.length === 0) {
        return res.redirect(back('shelter', 'err', 'That shelter no longer exists.'));
      }
    }
    const [ins] = await db.query(
      `INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.session.user.id, shelterId, needType, peopleCount]
    );
    await logActivity(null, req, 'request.created', 'aid_request', ins.insertId, needType);
    res.redirect(back('shelter', 'ok', 'Aid request submitted. A coordinator will review it.'));
  } catch (e) {
    console.error('Create aid request error:', e);
    res.redirect(back('shelter', 'err', 'Could not submit your aid request.'));
  }
});

router.post('/aid-requests/:id/update', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const needType = (req.body.need_type || '').trim();
  const peopleCount = parseInt(req.body.people_count, 10);
  const shelterId = nullIfEmpty(req.body.shelter_id);

  if (Number.isNaN(id) || !NEED_TYPES.includes(needType)) {
    return res.redirect(back('shelter', 'err', 'Invalid aid request update.'));
  }
  if (Number.isNaN(peopleCount) || peopleCount < 1 || peopleCount > 500) {
    return res.redirect(back('shelter', 'err', 'Number of people must be between 1 and 500.'));
  }

  try {
    // user_id and status in the WHERE clause block editing someone else's
    // request, or one a coordinator has already picked up.
    const [result] = await db.query(
      `UPDATE aid_requests
          SET need_type = ?, people_count = ?, shelter_id = ?
        WHERE id = ? AND user_id = ? AND status = 'pending'`,
      [needType, peopleCount, shelterId, id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('shelter', 'err',
        'That request can no longer be edited because a coordinator has picked it up.'));
    }
    await logActivity(null, req, 'request.updated', 'aid_request', id, needType);
    res.redirect(back('shelter', 'ok', 'Aid request updated.'));
  } catch (e) {
    console.error('Update aid request error:', e);
    res.redirect(back('shelter', 'err', 'Could not update your aid request.'));
  }
});

router.post('/aid-requests/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect(back('shelter', 'err', 'Invalid aid request.'));
  }
  try {
    const [result] = await db.query(
      `DELETE FROM aid_requests WHERE id = ? AND user_id = ? AND status = 'pending'`,
      [id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('shelter', 'err',
        'That request can no longer be withdrawn because it is being handled.'));
    }
    await logActivity(null, req, 'request.withdrawn', 'aid_request', id, null);
    res.redirect(back('shelter', 'ok', 'Aid request withdrawn.'));
  } catch (e) {
    console.error('Delete aid request error:', e);
    res.redirect(back('shelter', 'err', 'Could not withdraw your aid request.'));
  }
});

router.post('/reports', guard, async (req, res) => {
  const type = (req.body.type || '').trim();
  const location = (req.body.location || '').trim();
  const description = (req.body.description || '').trim();

  if (!INCIDENT_TYPES.includes(type)) {
    return res.redirect(back('reports', 'err', 'Choose a valid emergency type.'));
  }
  if (!location) {
    return res.redirect(back('reports', 'err', 'Enter where the emergency is.'));
  }
  if (description.length < 10) {
    return res.redirect(back('reports', 'err', 'Describe the emergency in at least 10 characters.'));
  }

  try {
    const [ins] = await db.query(
      `INSERT INTO incident_reports (user_id, type, location, description, status)
       VALUES (?, ?, ?, ?, 'submitted')`,
      [req.session.user.id, type, location, description]
    );
    await logActivity(null, req, 'report.created', 'incident_report', ins.insertId, type);
    res.redirect(back('reports', 'ok', 'Emergency report submitted.'));
  } catch (e) {
    console.error('Create report error:', e);
    res.redirect(back('reports', 'err', 'Could not submit your report.'));
  }
});

router.post('/reports/:id/update', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const type = (req.body.type || '').trim();
  const location = (req.body.location || '').trim();
  const description = (req.body.description || '').trim();

  if (Number.isNaN(id) || !INCIDENT_TYPES.includes(type) || !location) {
    return res.redirect(back('reports', 'err', 'Invalid report update.'));
  }
  if (description.length < 10) {
    return res.redirect(back('reports', 'err', 'Describe the emergency in at least 10 characters.'));
  }

  try {
    const [result] = await db.query(
      `UPDATE incident_reports
          SET type = ?, location = ?, description = ?
        WHERE id = ? AND user_id = ? AND status = 'submitted'`,
      [type, location, description, id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('reports', 'err',
        'That report can no longer be edited because responders are acting on it.'));
    }
    await logActivity(null, req, 'report.updated', 'incident_report', id, type);
    res.redirect(back('reports', 'ok', 'Report updated.'));
  } catch (e) {
    console.error('Update report error:', e);
    res.redirect(back('reports', 'err', 'Could not update your report.'));
  }
});

router.post('/reports/:id/delete', guard, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect(back('reports', 'err', 'Invalid report.'));
  }
  try {
    const [result] = await db.query(
      `DELETE FROM incident_reports WHERE id = ? AND user_id = ? AND status = 'submitted'`,
      [id, req.session.user.id]
    );
    if (result.affectedRows === 0) {
      return res.redirect(back('reports', 'err',
        'That report can no longer be retracted because responders are acting on it.'));
    }
    await logActivity(null, req, 'report.withdrawn', 'incident_report', id, null);
    res.redirect(back('reports', 'ok', 'Report retracted.'));
  } catch (e) {
    console.error('Delete report error:', e);
    res.redirect(back('reports', 'err', 'Could not retract your report.'));
  }
});

module.exports = router;
