// Shared audit-log helper. user_name and user_role are denormalised so history
// survives a user being deleted. A logging failure must never roll back the
// user's real action, so this catches and continues. Owner: shared service.
const pool = require('../config/db');

async function logActivity(conn, req, action, entityType, entityId, detail) {
  const runner = conn || pool;
  const u = (req && req.session && req.session.user) || {};
  try {
    await runner.query(
      `INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id || null, u.name || 'Unknown', u.role || 'unknown', action,
       entityType || null, entityId || null, detail || null]
    );
  } catch (e) {
    console.error('Audit log write failed (ignored):', e.message);
  }
}

module.exports = { logActivity };
