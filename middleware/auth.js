// middleware/auth.js — authentication + role guards

// Block access if the user is not logged in.
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// Block a logged-in user from opening a dashboard that isn't theirs.
// Usage: router.get('/dashboard', requireLogin, requireRole('admin'), handler)
function requireRole(role) {
  return function (req, res, next) {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      // Logged in, but wrong role — send them to their own dashboard.
      return res.redirect(`/${req.session.user.role}/dashboard`);
    }
    return next();
  };
}

module.exports = { requireLogin, requireRole };
