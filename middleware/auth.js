// Authentication and role guards shared by every dashboard.
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.session || !req.session.user) return res.redirect('/login');
    // Wrong role: bounce to the user's own dashboard instead of exposing another's.
    if (req.session.user.role !== role) {
      return res.redirect(`/${req.session.user.role}/dashboard`);
    }
    return next();
  };
}

module.exports = { requireLogin, requireRole };
