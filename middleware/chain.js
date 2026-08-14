// Shared relief-chain counts. Runs for any logged-in user and sets
// res.locals.chain so the chain strip renders on every dashboard.
// Reading the tasks table for counts is not volunteer logic.
const db = require('../config/db');

module.exports = async function chain(req, res, next) {
  if (!req.session || !req.session.user) return next();
  try {
    const [[c]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM aid_requests WHERE status = 'pending')                  AS pending_requests,
         (SELECT COUNT(*) FROM tasks WHERE status = 'open')                             AS open_tasks,
         (SELECT COUNT(*) FROM tasks WHERE status IN ('accepted','in_progress'))        AS active_tasks,
         (SELECT COUNT(*) FROM aid_requests WHERE status = 'resolved')                  AS resolved_requests`
    );
    res.locals.chain = {
      pendingRequests: Number(c.pending_requests) || 0,
      openTasks: Number(c.open_tasks) || 0,
      activeTasks: Number(c.active_tasks) || 0,
      resolvedRequests: Number(c.resolved_requests) || 0,
    };

    const [[n]] = await db.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.session.user.id]
    );
    res.locals.unreadCount = Number(n.unread) || 0;
  } catch (e) {
    console.error('Chain counts error:', e);
    res.locals.chain = {};
    res.locals.unreadCount = 0;
  }
  next();
};
