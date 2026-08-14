// Shared notification helper. Pass an existing connection to join a caller's
// transaction, or null to use the pool. Owner: shared service.
const pool = require('../config/db');

async function notify(conn, userId, type, message, link) {
  const runner = conn || pool;
  await runner.query(
    'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
    [userId, type, message, link || null]
  );
}

// Notify every admin (used for system events like a shelter filling up).
async function notifyAdmins(conn, type, message, link) {
  const runner = conn || pool;
  const [admins] = await runner.query("SELECT id FROM users WHERE role = 'admin'");
  for (const a of admins) {
    await runner.query(
      'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)',
      [a.id, type, message, link || null]
    );
  }
}

module.exports = { notify, notifyAdmins };
