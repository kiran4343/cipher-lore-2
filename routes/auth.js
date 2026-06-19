const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const router = express.Router();
const db = require('../database/database');
const { authLimiter } = require('../middleware/security');

function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

async function sendAdminWelcomeEmail(email, name, plainPassword) {
  try {
    const transporter = getMailer();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Admin Account Created — Project Cipher Lore',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d0d2b;color:#e2e8f0;padding:30px;border-radius:8px;">
          <h1 style="color:#a855f7;text-align:center;">Project Cipher Lore</h1>
          <h2 style="color:#e2e8f0;">Welcome, ${name}!</h2>
          <p>Your administrator account has been created for the Project Cipher Lore website.</p>
          <div style="background:#111130;padding:20px;border-radius:8px;border-left:4px solid #7c3aed;margin:20px 0;">
            <p style="margin:0 0 10px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin:0;"><strong>Temporary Password:</strong> <code style="background:#1a1a40;padding:4px 8px;border-radius:4px;font-size:16px;">${plainPassword}</code></p>
          </div>
          <p style="color:#f59e0b;"><strong>⚠️ Important:</strong> Please log in and change your password immediately.</p>
          <a href="${process.env.SITE_URL}/admin/login.html" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:10px;">Access Admin Panel</a>
          <hr style="border-color:#333;margin:30px 0;">
          <p style="color:#94a3b8;font-size:12px;">This is an automated message. Please do not reply to this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid credentials' });

    const { username, password } = req.body;
    const admin = db.prepare('SELECT * FROM admins WHERE name = ?').get(username);

    if (!admin || !admin.is_active) {
      await bcrypt.hash('dummy', 10); // timing-safe
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    db.prepare('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);

    const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '8h' });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({ message: 'Login successful', admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  }
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const admin = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, req.admin.id);
    res.json({ message: 'Password updated successfully' });
  }
);

module.exports = router;
