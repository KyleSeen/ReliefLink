// Donor dashboard. Owner: Yap Sin Ni. Tables: donations, aid_requests, shelters
const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const db = require('../config/db');
const { logActivity } = require('../services/audit');

const router = express.Router();
const guard = [requireLogin, requireRole('donor')];

// Must match the victim's need types, otherwise the shortfall join
// (donations.item_type = aid_requests.need_type) never matches.
const NEED_TYPES = ['food', 'water', 'medical', 'shelter', 'clothing', 'rescue'];

router.get('/dashboard', guard, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [donations] = await db.query(
      'SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [userId]
    );
    const [shortfall] = await db.query(
      `SELECT r.need_type AS category,
              SUM(r.people_count) * 3            AS units_needed,
              COALESCE(d.total_pledged, 0)       AS units_pledged,
              GREATEST(SUM(r.people_count) * 3 - COALESCE(d.total_pledged, 0), 0) AS shortfall
         FROM aid_requests r
         LEFT JOIN (
               SELECT item_type, SUM(quantity) AS total_pledged
                 FROM donations
                GROUP BY item_type
         ) d ON d.item_type = r.need_type
        WHERE r.status <> 'resolved'
        GROUP BY r.need_type, d.total_pledged
        ORDER BY shortfall DESC`
    );
    const [shelters] = await db.query(
      `SELECT *, GREATEST(capacity - current_occupancy, 0) AS spots_left
         FROM shelters
        ORDER BY spots_left ASC`
    );
    const [[stats]] = await db.query(
      `SELECT COUNT(*) AS pledge_count, COALESCE(SUM(quantity), 0) AS units_pledged
         FROM donations WHERE user_id = ?`,
      [userId]
    );
    const categoriesShort = shortfall.filter(s => Number(s.shortfall) > 0).length;

    res.render('dashboards/donor', {
      donations, shortfall, shelters,
      needTypes: NEED_TYPES,
      stats: {
        pledges: Number(stats.pledge_count) || 0,
        unitsPledged: Number(stats.units_pledged) || 0,
        categoriesShort,
      },
      ok: req.query.ok || null,
      err: req.query.err || null,
      tab: req.query.tab === 'needs' ? 'needs' : 'donations',
    });
  } catch (e) {
    console.error('Donor dashboard error:', e);
    res.render('dashboards/donor', {
      donations: [], shortfall: [], shelters: [],
      needTypes: NEED_TYPES,
      stats: { pledges: 0, unitsPledged: 0, categoriesShort: 0 },
      ok: null, err: 'Could not load data. Is the database running?', tab: 'donations',
    });
  }
});

router.post('/donations', guard, async (req, res) => {
  const userId = req.session.user.id;
  const itemType = (req.body.item_type || '').trim();
  const quantity = parseInt(req.body.quantity, 10);

  if (!NEED_TYPES.includes(itemType) || Number.isNaN(quantity) || quantity <= 0) {
    return res.redirect('/donor/dashboard?tab=donations&err=' +
      encodeURIComponent('Choose a category and a quantity greater than 0.'));
  }
  try {
    const [ins] = await db.query(
      "INSERT INTO donations (user_id, item_type, quantity, status) VALUES (?, ?, ?, 'pledged')",
      [userId, itemType, quantity]
    );
    await logActivity(null, req, 'pledge.created', 'donation', ins.insertId, `${quantity} ${itemType}`);
    res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Donation pledged.'));
  } catch (e) {
    console.error('Create donation error:', e);
    res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not save pledge.'));
  }
});

router.post('/donations/:id/update', guard, async (req, res) => {
  const userId = req.session.user.id;
  const id = parseInt(req.params.id, 10);
  const itemType = (req.body.item_type || '').trim();
  const quantity = parseInt(req.body.quantity, 10);

  if (Number.isNaN(id) || !NEED_TYPES.includes(itemType) || Number.isNaN(quantity) || quantity <= 0) {
    return res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Invalid update.'));
  }
  try {
    // status = 'pledged' stops edits once a pledge has been received.
    const [result] = await db.query(
      "UPDATE donations SET item_type = ?, quantity = ? WHERE id = ? AND user_id = ? AND status = 'pledged'",
      [itemType, quantity, id, userId]
    );
    if (result.affectedRows === 0) {
      return res.redirect('/donor/dashboard?tab=donations&err=' +
        encodeURIComponent('That pledge can no longer be edited because it has been received.'));
    }
    await logActivity(null, req, 'pledge.updated', 'donation', id, `${quantity} ${itemType}`);
    res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Pledge updated.'));
  } catch (e) {
    console.error('Update donation error:', e);
    res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not update pledge.'));
  }
});

router.post('/donations/:id/delete', guard, async (req, res) => {
  const userId = req.session.user.id;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Invalid donation.'));
  }
  try {
    await db.query(
      "DELETE FROM donations WHERE id = ? AND user_id = ? AND status = 'pledged'",
      [id, userId]
    );
    await logActivity(null, req, 'pledge.withdrawn', 'donation', id, null);
    res.redirect('/donor/dashboard?tab=donations&ok=' + encodeURIComponent('Pledge cancelled.'));
  } catch (e) {
    console.error('Delete donation error:', e);
    res.redirect('/donor/dashboard?tab=donations&err=' + encodeURIComponent('Could not cancel pledge.'));
  }
});

module.exports = router;
