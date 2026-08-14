// Notifications: list, mark one read, mark all read. Table: notifications
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  try {
    const [items] = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [req.session.user.id]
    );
    res.render('notifications', { items, ok: req.query.ok || null });
  } catch (e) {
    console.error('Notifications list error:', e);
    res.render('notifications', { items: [], ok: null });
  }
});

router.post('/:id/read', requireLogin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isNaN(id)) {
    try {
      await db.query(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [id, req.session.user.id]
      );
    } catch (e) { console.error('Mark read error:', e); }
  }
  res.redirect('/notifications');
});

router.post('/read-all', requireLogin, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.session.user.id]
    );
  } catch (e) { console.error('Mark all read error:', e); }
  res.redirect('/notifications?ok=' + encodeURIComponent('All notifications marked read.'));
});

module.exports = router;
