const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { get, run } = require('../database/database');
const { authLimiter } = require('../middleware/security');

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/auth/status — registration is permanently closed
router.get('/status', (req, res) => {
  res.json({ setupRequired: false, adminCount: 1, maxAdmins: 1 });
});

// POST /api/auth/setup — disabled
router.post('/setup', authLimiter, (req, res) => {
  res.status(403).json({ error: 'Account registration is disabled.' });
});

// POST /api/auth/login
router.post('/login',
  authLimiter,
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid credentials' });

    const { username, password } = req.body;
    const admin = await get('SELECT * FROM admins WHERE name = ?', [username]);

    if (!admin || !admin.is_active) {
      await bcrypt.hash('dummy', 10);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    await run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);

    const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '8h' });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({ message: 'Login successful', admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  })
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', { httpOnly: true, sameSite: 'strict' });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/verify
router.get('/verify', require('../middleware/auth').requireAuth, (req, res) => {
  res.json({ authenticated: true, admin: req.admin });
});

// POST /api/auth/change-password
router.post('/change-password',
  require('../middleware/auth').requireAuth,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 10 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('Password must include uppercase, lowercase, number, and special character'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const admin = await get('SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]);
    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await run('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.admin.id]);
    res.json({ message: 'Password updated successfully' });
  })
);

module.exports = router;
