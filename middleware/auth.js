const jwt = require('jsonwebtoken');
const db = require('../database/database');

function requireAuth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = db.prepare('SELECT id, email, name, role, is_active FROM admins WHERE id = ?').get(decoded.id);
    if (!admin || !admin.is_active) {
      res.clearCookie('admin_token');
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    res.clearCookie('admin_token');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAuthPage(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.redirect('/admin/login.html');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = db.prepare('SELECT id, is_active FROM admins WHERE id = ?').get(decoded.id);
    if (!admin || !admin.is_active) {
      res.clearCookie('admin_token');
      return res.redirect('/admin/login.html');
    }
    next();
  } catch {
    res.clearCookie('admin_token');
    return res.redirect('/admin/login.html');
  }
}

module.exports = { requireAuth, requireAuthPage };
