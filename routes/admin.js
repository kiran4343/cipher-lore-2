const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { get, all, run, batch } = require('../database/database');
const { requireAuth } = require('../middleware/auth');

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── DASHBOARD ───────────────────────────────────────────────
router.get('/dashboard', wrap(async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [tv, tdv, wv, mv, tpv, tdpv, tp, dp, ti, tm, um, te] = await Promise.all([
    get('SELECT COUNT(*) as c FROM visitors', []),
    get("SELECT COUNT(*) as c FROM visitors WHERE date(created_at) = date('now')", []),
    get('SELECT COUNT(*) as c FROM visitors WHERE created_at >= ?', [weekAgo]),
    get('SELECT COUNT(*) as c FROM visitors WHERE created_at >= ?', [monthAgo]),
    get('SELECT COUNT(*) as c FROM page_views', []),
    get("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now')", []),
    get("SELECT COUNT(*) as c FROM blog_posts WHERE status = 'published'", []),
    get("SELECT COUNT(*) as c FROM blog_posts WHERE status = 'draft'", []),
    get('SELECT COUNT(*) as c FROM investigations WHERE is_published = 1', []),
    get('SELECT COUNT(*) as c FROM contacts', []),
    get('SELECT COUNT(*) as c FROM contacts WHERE is_read = 0', []),
    get('SELECT COUNT(*) as c FROM events WHERE is_published = 1', []),
  ]);

  const stats = {
    totalVisitors: Number(tv.c), todayVisitors: Number(tdv.c),
    weekVisitors: Number(wv.c), monthVisitors: Number(mv.c),
    totalPageViews: Number(tpv.c), todayPageViews: Number(tdpv.c),
    totalPosts: Number(tp.c), draftPosts: Number(dp.c),
    totalInvestigations: Number(ti.c),
    totalMessages: Number(tm.c), unreadMessages: Number(um.c),
    totalEvents: Number(te.c),
  };

  const [recentVisitors, dailyVisitors, topPages] = await Promise.all([
    all('SELECT country, city, device_type, browser, first_page, created_at FROM visitors ORDER BY created_at DESC LIMIT 10', []),
    all('SELECT date(created_at) as date, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC', [weekAgo]),
    all('SELECT page, COUNT(*) as views FROM page_views WHERE created_at >= ? GROUP BY page ORDER BY views DESC LIMIT 10', [monthAgo]),
  ]);

  res.json({ stats, recentVisitors, dailyVisitors, topPages });
}));

// ─── ANALYTICS ───────────────────────────────────────────────
router.get('/analytics', wrap(async (req, res) => {
  const { range = '30' } = req.query;
  const days = Math.min(parseInt(range) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [daily, pageViews, countries, cities, devices, browsers, os, topPages, referrers, hourly, geoPoints] = await Promise.all([
    all("SELECT date(created_at) as date, COUNT(*) as visitors, SUM(CASE WHEN device_type='mobile' THEN 1 ELSE 0 END) as mobile, SUM(CASE WHEN device_type='desktop' THEN 1 ELSE 0 END) as desktop, SUM(CASE WHEN device_type='tablet' THEN 1 ELSE 0 END) as tablet FROM visitors WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC", [since]),
    all('SELECT date(created_at) as date, COUNT(*) as views FROM page_views WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC', [since]),
    all('SELECT country, country_code, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY country ORDER BY count DESC LIMIT 20', [since]),
    all('SELECT city, country, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY city ORDER BY count DESC LIMIT 20', [since]),
    all('SELECT device_type, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY device_type', [since]),
    all('SELECT browser, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY browser ORDER BY count DESC LIMIT 10', [since]),
    all('SELECT os, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY os ORDER BY count DESC', [since]),
    all('SELECT page, page_title, COUNT(*) as views, AVG(duration) as avg_duration FROM page_views WHERE created_at >= ? GROUP BY page ORDER BY views DESC LIMIT 20', [since]),
    all("SELECT referrer, COUNT(*) as count FROM visitors WHERE created_at >= ? AND referrer != '' GROUP BY referrer ORDER BY count DESC LIMIT 20", [since]),
    all("SELECT strftime('%H', created_at) as hour, COUNT(*) as count FROM visitors WHERE created_at >= ? GROUP BY hour ORDER BY hour ASC", [since]),
    all('SELECT country, city, latitude, longitude, COUNT(*) as count FROM visitors WHERE created_at >= ? AND latitude != 0 GROUP BY country, city ORDER BY count DESC LIMIT 100', [since]),
  ]);

  res.json({ daily, pageViews, countries, cities, devices, browsers, os, topPages, referrers, hourly, geoPoints, days });
}));

// ─── VISITOR LOCATIONS ────────────────────────────────────────
router.get('/visitor-locations', wrap(async (req, res) => {
  const { range = '7' } = req.query;
  const days = Math.min(parseInt(range) || 7, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [ispVisitors, gpsVisitors] = await Promise.all([
    all('SELECT session_id, ip_address, country, city, region, isp, timezone, latitude, longitude, device_type, browser, first_page, created_at FROM visitors WHERE created_at >= ? ORDER BY created_at DESC LIMIT 500', [since]),
    all("SELECT session_id, country, city, latitude, longitude, isp, first_page, created_at FROM visitors WHERE gps_precise = 1 AND created_at >= ? ORDER BY created_at DESC LIMIT 500", [since]),
  ]);

  let trails = [];
  if (gpsVisitors.length) {
    const ids = gpsVisitors.map(v => v.session_id);
    trails = await all(
      `SELECT session_id, latitude, longitude, accuracy, page, created_at FROM location_trail WHERE session_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`,
      ids
    );
  }

  res.json({ ispVisitors, gpsVisitors, trails });
}));

// ─── BLOG POSTS ───────────────────────────────────────────────
router.get('/posts', wrap(async (req, res) => {
  const posts = await all('SELECT id, title, slug, category, status, views, published_at, created_at FROM blog_posts ORDER BY created_at DESC', []);
  res.json({ posts });
}));

router.get('/posts/:id', wrap(async (req, res) => {
  const post = await get('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json({ post });
}));

router.post('/posts', [body('title').trim().isLength({ min: 2, max: 300 }), body('content').trim().notEmpty(), body('status').isIn(['draft', 'published'])],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { title, content, excerpt, category, tags, featured_image, status } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const publishedAt = status === 'published' ? new Date().toISOString() : null;
    const result = await run('INSERT INTO blog_posts (title, slug, content, excerpt, author_id, category, tags, featured_image, status, published_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [title, slug, content, excerpt || '', req.admin.id, category || 'General', JSON.stringify(tags || []), featured_image || '/images/blog-default.jpg', status, publishedAt]);
    res.status(201).json({ id: result.lastInsertRowid, slug });
  })
);

router.put('/posts/:id', [body('title').optional().trim(), body('status').optional().isIn(['draft', 'published'])],
  wrap(async (req, res) => {
    const post = await get('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const { title, content, excerpt, category, tags, featured_image, status } = req.body;
    const publishedAt = (status === 'published' && !post.published_at) ? new Date().toISOString() : post.published_at;
    await run('UPDATE blog_posts SET title=COALESCE(?,title), content=COALESCE(?,content), excerpt=COALESCE(?,excerpt), category=COALESCE(?,category), tags=COALESCE(?,tags), featured_image=COALESCE(?,featured_image), status=COALESCE(?,status), published_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [title, content, excerpt, category, tags ? JSON.stringify(tags) : null, featured_image, status, publishedAt, req.params.id]);
    res.json({ message: 'Updated' });
  })
);

router.delete('/posts/:id', wrap(async (req, res) => {
  await run('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ─── INVESTIGATIONS ───────────────────────────────────────────
router.get('/investigations', wrap(async (req, res) => {
  const items = await all('SELECT id, title, slug, location, state, date, status, is_published FROM investigations ORDER BY created_at DESC', []);
  res.json({ investigations: items });
}));

router.get('/investigations/:id', wrap(async (req, res) => {
  const item = await get('SELECT * FROM investigations WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ investigation: item });
}));

router.post('/investigations', [body('title').trim().notEmpty()], wrap(async (req, res) => {
  const { title, location, state, date, description, full_report, status, evidence_types, images, is_published } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
  const result = await run('INSERT INTO investigations (title, slug, location, state, date, description, full_report, status, evidence_types, images, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [title, slug, location || '', state || '', date || '', description || '', full_report || '', status || 'ongoing', JSON.stringify(evidence_types || []), JSON.stringify(images || []), is_published ? 1 : 0]);
  res.status(201).json({ id: result.lastInsertRowid, slug });
}));

router.put('/investigations/:id', wrap(async (req, res) => {
  const { title, location, state, date, description, full_report, status, evidence_types, images, is_published } = req.body;
  await run('UPDATE investigations SET title=COALESCE(?,title), location=COALESCE(?,location), state=COALESCE(?,state), date=COALESCE(?,date), description=COALESCE(?,description), full_report=COALESCE(?,full_report), status=COALESCE(?,status), evidence_types=COALESCE(?,evidence_types), images=COALESCE(?,images), is_published=COALESCE(?,is_published), updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [title, location, state, date, description, full_report, status, evidence_types ? JSON.stringify(evidence_types) : null, images ? JSON.stringify(images) : null, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id]);
  res.json({ message: 'Updated' });
}));

router.delete('/investigations/:id', wrap(async (req, res) => {
  await run('DELETE FROM investigations WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ─── GALLERY ─────────────────────────────────────────────────
router.get('/gallery', wrap(async (req, res) => {
  const items = await all('SELECT * FROM gallery ORDER BY sort_order ASC, created_at DESC', []);
  res.json({ items });
}));

router.get('/gallery/:id', wrap(async (req, res) => {
  const item = await get('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
}));

router.post('/gallery', wrap(async (req, res) => {
  const { title, description, image_url, category, sort_order, is_published } = req.body;
  if (!image_url) return res.status(400).json({ error: 'image_url required' });
  const result = await run('INSERT INTO gallery (title, description, image_url, category, sort_order, is_published) VALUES (?,?,?,?,?,?)',
    [title || '', description || '', image_url, category || 'General', sort_order || 0, is_published !== false ? 1 : 0]);
  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/gallery/:id', wrap(async (req, res) => {
  const { title, description, image_url, category, sort_order, is_published } = req.body;
  await run('UPDATE gallery SET title=COALESCE(?,title), description=COALESCE(?,description), image_url=COALESCE(?,image_url), category=COALESCE(?,category), sort_order=COALESCE(?,sort_order), is_published=COALESCE(?,is_published) WHERE id=?',
    [title, description, image_url, category, sort_order, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id]);
  res.json({ message: 'Updated' });
}));

router.delete('/gallery/:id', wrap(async (req, res) => {
  await run('DELETE FROM gallery WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ─── TEAM ─────────────────────────────────────────────────────
router.get('/team', wrap(async (req, res) => {
  const members = await all('SELECT * FROM team_members ORDER BY sort_order ASC', []);
  res.json({ members });
}));

router.get('/team/:id', wrap(async (req, res) => {
  const member = await get('SELECT * FROM team_members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json({ member });
}));

router.post('/team', [body('name').trim().notEmpty()], wrap(async (req, res) => {
  const { name, role, bio, image_url, specializations, social_links, sort_order, joined_date } = req.body;
  const result = await run('INSERT INTO team_members (name, role, bio, image_url, specializations, social_links, sort_order, joined_date) VALUES (?,?,?,?,?,?,?,?)',
    [name, role || '', bio || '', image_url || '/images/team-default.jpg', JSON.stringify(specializations || []), JSON.stringify(social_links || {}), sort_order || 0, joined_date || '']);
  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/team/:id', wrap(async (req, res) => {
  const { name, role, bio, image_url, specializations, social_links, sort_order, is_active, joined_date } = req.body;
  await run('UPDATE team_members SET name=COALESCE(?,name), role=COALESCE(?,role), bio=COALESCE(?,bio), image_url=COALESCE(?,image_url), specializations=COALESCE(?,specializations), social_links=COALESCE(?,social_links), sort_order=COALESCE(?,sort_order), is_active=COALESCE(?,is_active), joined_date=COALESCE(?,joined_date) WHERE id=?',
    [name, role, bio, image_url, specializations ? JSON.stringify(specializations) : null, social_links ? JSON.stringify(social_links) : null, sort_order, is_active !== undefined ? (is_active ? 1 : 0) : null, joined_date, req.params.id]);
  res.json({ message: 'Updated' });
}));

router.delete('/team/:id', wrap(async (req, res) => {
  await run('DELETE FROM team_members WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ─── EVENTS ───────────────────────────────────────────────────
router.get('/events', wrap(async (req, res) => {
  const items = await all('SELECT * FROM events ORDER BY event_date DESC', []);
  res.json({ events: items });
}));

router.get('/events/:id', wrap(async (req, res) => {
  const event = await get('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json({ event });
}));

router.post('/events', [body('title').trim().notEmpty()], wrap(async (req, res) => {
  const { title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published } = req.body;
  const result = await run('INSERT INTO events (title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published) VALUES (?,?,?,?,?,?,?,?,?)',
    [title, description || '', event_date || '', event_time || '', location || '', image_url || '/images/event-default.jpg', registration_link || '', max_participants || null, is_published ? 1 : 0]);
  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/events/:id', wrap(async (req, res) => {
  const { title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published } = req.body;
  await run('UPDATE events SET title=COALESCE(?,title), description=COALESCE(?,description), event_date=COALESCE(?,event_date), event_time=COALESCE(?,event_time), location=COALESCE(?,location), image_url=COALESCE(?,image_url), registration_link=COALESCE(?,registration_link), max_participants=COALESCE(?,max_participants), is_published=COALESCE(?,is_published) WHERE id=?',
    [title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id]);
  res.json({ message: 'Updated' });
}));

router.delete('/events/:id', wrap(async (req, res) => {
  await run('DELETE FROM events WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

// ─── CONTACTS ─────────────────────────────────────────────────
router.get('/contacts', wrap(async (req, res) => {
  const contacts = await all('SELECT * FROM contacts ORDER BY created_at DESC', []);
  res.json({ contacts });
}));

router.put('/contacts/:id/read', wrap(async (req, res) => {
  await run('UPDATE contacts SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Marked as read' });
}));

router.delete('/contacts/:id', wrap(async (req, res) => {
  await run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
}));

router.post('/contacts/:id/reply', [
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('body').trim().notEmpty().withMessage('Message body is required'),
], wrap(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const contact = await get('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
  if (!contact) return res.status(404).json({ error: 'Message not found' });

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return res.status(503).json({ error: 'Email is not configured on this server. Set SMTP_HOST, SMTP_USER and SMTP_PASS environment variables.' });
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: SMTP_FROM || `"Paranormal Cipher" <${SMTP_USER}>`,
    to: `"${contact.name}" <${contact.email}>`,
    subject: req.body.subject,
    text: req.body.body,
    html: req.body.body.replace(/\n/g, '<br>'),
  });

  await run('UPDATE contacts SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Reply sent successfully' });
}));

// ─── PAGES (GrapesJS) ─────────────────────────────────────────
const PAGE_FILES = {
  home: 'index.html', about: 'about.html', investigations: 'investigations.html',
  gallery: 'gallery.html', blog: 'blog.html', team: 'team.html',
  events: 'events.html', contact: 'contact.html',
};
const publicDir = path.join(__dirname, '..', 'public');

function readStaticBody(slug) {
  const file = PAGE_FILES[slug];
  if (!file) return null;
  const filePath = path.join(publicDir, file);
  if (!fs.existsSync(filePath)) return null;
  const html = fs.readFileSync(filePath, 'utf8');
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
}

function writeStaticBody(slug, bodyHtml) {
  const file = PAGE_FILES[slug];
  if (!file) return;
  const filePath = path.join(publicDir, file);
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = original.replace(/<body([^>]*)>[\s\S]*<\/body>/i, (_, attrs) => '<body' + attrs + '>\n' + bodyHtml + '\n</body>');
  fs.writeFileSync(filePath, updated, 'utf8');
}

router.get('/pages', wrap(async (req, res) => {
  const pages = await all('SELECT id, slug, title, meta_description, updated_at FROM pages', []);
  res.json({ pages });
}));

router.get('/pages/:slug', wrap(async (req, res) => {
  const slug = req.params.slug;
  const page = await get('SELECT * FROM pages WHERE slug = ?', [slug]);
  const EMPTY = ['{}', JSON.stringify({ sections: [] })];
  const hasContent = page && page.content && !EMPTY.includes(page.content);

  if (hasContent) return res.json({ page });

  const bodyHtml = readStaticBody(slug);
  if (!bodyHtml) {
    if (!page) return res.status(404).json({ error: 'Not found' });
    return res.json({ page });
  }
  const content = JSON.stringify({ html: bodyHtml, css: '' });
  res.json({ page: { ...(page || { slug, title: slug, meta_description: '' }), content } });
}));

router.put('/pages/:slug', [body('content').notEmpty()], wrap(async (req, res) => {
  const slug = req.params.slug;
  const { content, title, meta_description } = req.body;

  const existing = await get('SELECT id FROM pages WHERE slug = ?', [slug]);
  if (existing) {
    await run('UPDATE pages SET content=?, title=COALESCE(?,title), meta_description=COALESCE(?,meta_description), updated_at=CURRENT_TIMESTAMP WHERE slug=?',
      [content, title, meta_description, slug]);
  } else {
    await run('INSERT INTO pages (slug, title, content, meta_description) VALUES (?,?,?,?)',
      [slug, title || slug, content, meta_description || '']);
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed.html) writeStaticBody(slug, parsed.html);
  } catch (e) {
    console.error('Failed to write static file for', slug, e.message);
  }

  res.json({ message: 'Saved' });
}));

// ─── SETTINGS ─────────────────────────────────────────────────
router.get('/settings', wrap(async (req, res) => {
  const rows = await all('SELECT setting_key, setting_value FROM site_settings', []);
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json({ settings });
}));

router.put('/settings', wrap(async (req, res) => {
  const stmts = Object.entries(req.body)
    .filter(([, v]) => typeof v === 'string' || v === null)
    .map(([key, value]) => ({
      sql: 'INSERT OR REPLACE INTO site_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      args: [key, value],
    }));
  await batch(stmts);
  res.json({ message: 'Settings saved' });
}));

// ─── ADMINS ───────────────────────────────────────────────────
router.get('/admins', wrap(async (req, res) => {
  const admins = await all('SELECT id, email, name, role, is_active, last_login, created_at FROM admins', []);
  res.json({ admins });
}));

router.put('/admins/:id/toggle', wrap(async (req, res) => {
  if (parseInt(req.params.id) === req.admin.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  const admin = await get('SELECT is_active FROM admins WHERE id = ?', [req.params.id]);
  if (!admin) return res.status(404).json({ error: 'Not found' });
  await run('UPDATE admins SET is_active = ? WHERE id = ?', [admin.is_active ? 0 : 1, req.params.id]);
  res.json({ message: 'Updated' });
}));

module.exports = router;
