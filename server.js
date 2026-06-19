require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');
const fs = require('fs');

const { helmetConfig, apiLimiter } = require('./middleware/security');
const { requireAuthPage } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Core Middleware ───────────────────────────────────────────
app.use(helmetConfig);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// ─── Static Files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
}));

// ─── Admin HTML Pages (protected) ─────────────────────────────
const protectedAdminPages = ['dashboard', 'analytics', 'editor', 'content', 'settings', 'messages'];
protectedAdminPages.forEach(page => {
  app.get(`/admin/${page}.html`, requireAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', `${page}.html`));
  });
});

// Admin static files (CSS, JS) — not protected
app.use('/admin', express.static(path.join(__dirname, 'admin'), {
  maxAge: 0,
}));

// Admin login redirect
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));
app.get('/admin/', (req, res) => res.redirect('/admin/login.html'));

// ─── API Routes ────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/track', require('./routes/analytics'));
app.use('/api', require('./routes/api'));

// ─── SPA Fallback ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/investigations', (req, res) => res.sendFile(path.join(__dirname, 'public', 'investigations.html')));
app.get('/investigations/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'investigation.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));
app.get('/team', (req, res) => res.sendFile(path.join(__dirname, 'public', 'team.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'public', 'events.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));

// ─── Error Handling ────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum 10MB.' });
  console.error(err.stack);
  const status = err.status || 500;
  if (req.path.startsWith('/api')) return res.status(status).json({ error: err.message || 'Internal server error' });
  res.status(status).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ─── Start Server (after DB is ready) ─────────────────────────
const { ready } = require('./database/database');
ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\nParanormal Cipher Server`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Website:    http://localhost:${PORT}`);
    console.log(`Admin:      http://localhost:${PORT}/admin`);
    console.log(`ENV:        ${process.env.NODE_ENV || 'development'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
});

process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down'); process.exit(0); });
process.on('SIGINT', () => { console.log('\nGraceful shutdown'); process.exit(0); });

module.exports = app;
