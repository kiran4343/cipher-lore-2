const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// Apply auth to all admin routes
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// POST /api/admin/upload
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── DASHBOARD ───────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const stats = {
    totalVisitors: db.prepare('SELECT COUNT(*) as c FROM visitors').get().c,
    todayVisitors: db.prepare("SELECT COUNT(*) as c FROM visitors WHERE date(created_at) = date('now')").get().c,
    weekVisitors: db.prepare("SELECT COUNT(*) as c FROM visitors WHERE created_at >= ?").get(weekAgo).c,
    monthVisitors: db.prepare("SELECT COUNT(*) as c FROM visitors WHERE created_at >= ?").get(monthAgo).c,
    totalPageViews: db.prepare('SELECT COUNT(*) as c FROM page_views').get().c,
    todayPageViews: db.prepare("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now')").get().c,
    totalPosts: db.prepare("SELECT COUNT(*) as c FROM blog_posts WHERE status = 'published'").get().c,
    draftPosts: db.prepare("SELECT COUNT(*) as c FROM blog_posts WHERE status = 'draft'").get().c,
    totalInvestigations: db.prepare('SELECT COUNT(*) as c FROM investigations WHERE is_published = 1').get().c,
    totalMessages: db.prepare('SELECT COUNT(*) as c FROM contacts').get().c,
    unreadMessages: db.prepare('SELECT COUNT(*) as c FROM contacts WHERE is_read = 0').get().c,
    totalEvents: db.prepare('SELECT COUNT(*) as c FROM events WHERE is_published = 1').get().c,
  };

  const recentVisitors = db.prepare(`
    SELECT country, city, device_type, browser, first_page, created_at
    FROM visitors ORDER BY created_at DESC LIMIT 10
  `).all();

  const dailyVisitors = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM visitors WHERE created_at >= ?
    GROUP BY date(created_at) ORDER BY date ASC
  `).all(weekAgo);

  const topPages = db.prepare(`
    SELECT page, COUNT(*) as views FROM page_views
    WHERE created_at >= ? GROUP BY page ORDER BY views DESC LIMIT 10
  `).all(monthAgo);

  res.json({ stats, recentVisitors, dailyVisitors, topPages });
});

// ─── ANALYTICS ───────────────────────────────────────────────
router.get('/analytics', (req, res) => {
  const { range = '30' } = req.query;
  const days = Math.min(parseInt(range) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const daily = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as visitors,
      SUM(CASE WHEN device_type = 'mobile' THEN 1 ELSE 0 END) as mobile,
      SUM(CASE WHEN device_type = 'desktop' THEN 1 ELSE 0 END) as desktop,
      SUM(CASE WHEN device_type = 'tablet' THEN 1 ELSE 0 END) as tablet
    FROM visitors WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC
  `).all(since);

  const pageViews = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as views
    FROM page_views WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC
  `).all(since);

  const countries = db.prepare(`
    SELECT country, country_code, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY country ORDER BY count DESC LIMIT 20
  `).all(since);

  const cities = db.prepare(`
    SELECT city, country, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY city ORDER BY count DESC LIMIT 20
  `).all(since);

  const devices = db.prepare(`
    SELECT device_type, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY device_type
  `).all(since);

  const browsers = db.prepare(`
    SELECT browser, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY browser ORDER BY count DESC LIMIT 10
  `).all(since);

  const os = db.prepare(`
    SELECT os, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY os ORDER BY count DESC
  `).all(since);

  const topPages = db.prepare(`
    SELECT page, page_title, COUNT(*) as views, AVG(duration) as avg_duration
    FROM page_views WHERE created_at >= ? GROUP BY page ORDER BY views DESC LIMIT 20
  `).all(since);

  const referrers = db.prepare(`
    SELECT referrer, COUNT(*) as count
    FROM visitors WHERE created_at >= ? AND referrer != '' GROUP BY referrer ORDER BY count DESC LIMIT 20
  `).all(since);

  const hourly = db.prepare(`
    SELECT strftime('%H', created_at) as hour, COUNT(*) as count
    FROM visitors WHERE created_at >= ? GROUP BY hour ORDER BY hour ASC
  `).all(since);

  const geoPoints = db.prepare(`
    SELECT country, city, latitude, longitude, COUNT(*) as count
    FROM visitors WHERE created_at >= ? AND latitude != 0
    GROUP BY country, city ORDER BY count DESC LIMIT 100
  `).all(since);

  res.json({ daily, pageViews, countries, cities, devices, browsers, os, topPages, referrers, hourly, geoPoints, days });
});

// ─── BLOG POSTS ───────────────────────────────────────────────
router.get('/posts', (req, res) => {
  const posts = db.prepare('SELECT id, title, slug, category, status, views, published_at, created_at FROM blog_posts ORDER BY created_at DESC').all();
  res.json({ posts });
});

router.get('/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json({ post });
});

router.post('/posts', [
  body('title').trim().isLength({ min: 2, max: 300 }),
  body('content').trim().notEmpty(),
  body('status').isIn(['draft', 'published']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, content, excerpt, category, tags, featured_image, status } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO blog_posts (title, slug, content, excerpt, author_id, category, tags, featured_image, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, slug, content, excerpt || '', req.admin.id, category || 'General', JSON.stringify(tags || []), featured_image || '/images/blog-default.jpg', status, publishedAt);

  res.status(201).json({ id: result.lastInsertRowid, slug });
});

router.put('/posts/:id', [body('title').optional().trim(), body('status').optional().isIn(['draft', 'published'])], (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });

  const { title, content, excerpt, category, tags, featured_image, status } = req.body;
  const publishedAt = (status === 'published' && !post.published_at) ? new Date().toISOString() : post.published_at;

  db.prepare(`UPDATE blog_posts SET title=COALESCE(?,title), content=COALESCE(?,content), excerpt=COALESCE(?,excerpt),
    category=COALESCE(?,category), tags=COALESCE(?,tags), featured_image=COALESCE(?,featured_image),
    status=COALESCE(?,status), published_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(title, content, excerpt, category, tags ? JSON.stringify(tags) : null, featured_image, status, publishedAt, req.params.id);

  res.json({ message: 'Updated' });
});

router.delete('/posts/:id', (req, res) => {
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── INVESTIGATIONS ───────────────────────────────────────────
router.get('/investigations', (req, res) => {
  const items = db.prepare('SELECT id, title, slug, location, state, date, status, is_published FROM investigations ORDER BY created_at DESC').all();
  res.json({ investigations: items });
});

router.get('/investigations/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM investigations WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ investigation: item });
});

router.post('/investigations', [body('title').trim().notEmpty()], (req, res) => {
  const { title, location, state, date, description, full_report, status, evidence_types, images, is_published } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
  const result = db.prepare(`INSERT INTO investigations (title, slug, location, state, date, description, full_report, status, evidence_types, images, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(title, slug, location || '', state || '', date || '', description || '', full_report || '', status || 'ongoing', JSON.stringify(evidence_types || []), JSON.stringify(images || []), is_published ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, slug });
});

router.put('/investigations/:id', (req, res) => {
  const { title, location, state, date, description, full_report, status, evidence_types, images, is_published } = req.body;
  db.prepare(`UPDATE investigations SET title=COALESCE(?,title), location=COALESCE(?,location), state=COALESCE(?,state),
    date=COALESCE(?,date), description=COALESCE(?,description), full_report=COALESCE(?,full_report),
    status=COALESCE(?,status), evidence_types=COALESCE(?,evidence_types), images=COALESCE(?,images),
    is_published=COALESCE(?,is_published), updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(title, location, state, date, description, full_report, status, evidence_types ? JSON.stringify(evidence_types) : null, images ? JSON.stringify(images) : null, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/investigations/:id', (req, res) => {
  db.prepare('DELETE FROM investigations WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── GALLERY ─────────────────────────────────────────────────
router.get('/gallery', (req, res) => {
  const items = db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, created_at DESC').all();
  res.json({ items });
});

router.get('/gallery/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

router.post('/gallery', (req, res) => {
  const { title, description, image_url, category, sort_order, is_published } = req.body;
  if (!image_url) return res.status(400).json({ error: 'image_url required' });
  const result = db.prepare('INSERT INTO gallery (title, description, image_url, category, sort_order, is_published) VALUES (?,?,?,?,?,?)').run(title || '', description || '', image_url, category || 'General', sort_order || 0, is_published !== false ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/gallery/:id', (req, res) => {
  const { title, description, image_url, category, sort_order, is_published } = req.body;
  db.prepare('UPDATE gallery SET title=COALESCE(?,title), description=COALESCE(?,description), image_url=COALESCE(?,image_url), category=COALESCE(?,category), sort_order=COALESCE(?,sort_order), is_published=COALESCE(?,is_published) WHERE id=?'
  ).run(title, description, image_url, category, sort_order, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/gallery/:id', (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── TEAM ─────────────────────────────────────────────────────
router.get('/team', (req, res) => {
  const members = db.prepare('SELECT * FROM team_members ORDER BY sort_order ASC').all();
  res.json({ members });
});

router.get('/team/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json({ member });
});

router.post('/team', [body('name').trim().notEmpty()], (req, res) => {
  const { name, role, bio, image_url, specializations, social_links, sort_order, joined_date } = req.body;
  const result = db.prepare('INSERT INTO team_members (name, role, bio, image_url, specializations, social_links, sort_order, joined_date) VALUES (?,?,?,?,?,?,?,?)').run(name, role || '', bio || '', image_url || '/images/team-default.jpg', JSON.stringify(specializations || []), JSON.stringify(social_links || {}), sort_order || 0, joined_date || '');
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/team/:id', (req, res) => {
  const { name, role, bio, image_url, specializations, social_links, sort_order, is_active, joined_date } = req.body;
  db.prepare('UPDATE team_members SET name=COALESCE(?,name), role=COALESCE(?,role), bio=COALESCE(?,bio), image_url=COALESCE(?,image_url), specializations=COALESCE(?,specializations), social_links=COALESCE(?,social_links), sort_order=COALESCE(?,sort_order), is_active=COALESCE(?,is_active), joined_date=COALESCE(?,joined_date) WHERE id=?'
  ).run(name, role, bio, image_url, specializations ? JSON.stringify(specializations) : null, social_links ? JSON.stringify(social_links) : null, sort_order, is_active !== undefined ? (is_active ? 1 : 0) : null, joined_date, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/team/:id', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── EVENTS ───────────────────────────────────────────────────
router.get('/events', (req, res) => {
  const items = db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
  res.json({ events: items });
});

router.get('/events/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json({ event });
});

router.post('/events', [body('title').trim().notEmpty()], (req, res) => {
  const { title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published } = req.body;
  const result = db.prepare('INSERT INTO events (title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published) VALUES (?,?,?,?,?,?,?,?,?)').run(title, description || '', event_date || '', event_time || '', location || '', image_url || '/images/event-default.jpg', registration_link || '', max_participants || null, is_published ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/events/:id', (req, res) => {
  const { title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published } = req.body;
  db.prepare('UPDATE events SET title=COALESCE(?,title), description=COALESCE(?,description), event_date=COALESCE(?,event_date), event_time=COALESCE(?,event_time), location=COALESCE(?,location), image_url=COALESCE(?,image_url), registration_link=COALESCE(?,registration_link), max_participants=COALESCE(?,max_participants), is_published=COALESCE(?,is_published) WHERE id=?'
  ).run(title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published !== undefined ? (is_published ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── CONTACTS ─────────────────────────────────────────────────
router.get('/contacts', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  res.json({ contacts });
});

router.put('/contacts/:id/read', (req, res) => {
  db.prepare('UPDATE contacts SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Marked as read' });
});

router.delete('/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ─── PAGES (GrapesJS) ─────────────────────────────────────────
const PAGE_FILES = {
  home:           'index.html',
  about:          'about.html',
  investigations: 'investigations.html',
  gallery:        'gallery.html',
  blog:           'blog.html',
  team:           'team.html',
  events:         'events.html',
  contact:        'contact.html',
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
  const updated = original.replace(/<body([^>]*)>[\s\S]*<\/body>/i, function(_, attrs) {
    return '<body' + attrs + '>\n' + bodyHtml + '\n</body>';
  });
  fs.writeFileSync(filePath, updated, 'utf8');
}

router.get('/pages', (req, res) => {
  const pages = db.prepare('SELECT id, slug, title, meta_description, updated_at FROM pages').all();
  res.json({ pages });
});

router.get('/pages/:slug', (req, res) => {
  const slug = req.params.slug;
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
  const EMPTY = ['{}', JSON.stringify({ sections: [] })];
  const hasContent = page && page.content && !EMPTY.includes(page.content);

  if (hasContent) return res.json({ page });

  // DB row is empty — fall back to the static HTML file
  const bodyHtml = readStaticBody(slug);
  if (!bodyHtml) {
    if (!page) return res.status(404).json({ error: 'Not found' });
    return res.json({ page }); // return empty record so editor can at least open
  }
  const content = JSON.stringify({ html: bodyHtml, css: '' });
  res.json({ page: { ...(page || { slug, title: slug, meta_description: '' }), content } });
});

router.put('/pages/:slug', [body('content').notEmpty()], (req, res) => {
  const slug = req.params.slug;
  const { content, title, meta_description } = req.body;

  // Persist to DB
  const existing = db.prepare('SELECT id FROM pages WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare('UPDATE pages SET content=?, title=COALESCE(?,title), meta_description=COALESCE(?,meta_description), updated_at=CURRENT_TIMESTAMP WHERE slug=?').run(content, title, meta_description, slug);
  } else {
    db.prepare('INSERT INTO pages (slug, title, content, meta_description) VALUES (?,?,?,?)').run(slug, title || slug, content, meta_description || '');
  }

  // Also write the body HTML back to the static file so visitors see the changes
  try {
    const parsed = JSON.parse(content);
    if (parsed.html) writeStaticBody(slug, parsed.html);
  } catch (e) {
    console.error('Failed to write static file for', slug, e.message);
  }

  res.json({ message: 'Saved' });
});

// ─── SETTINGS ─────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json({ settings });
});

router.put('/settings', (req, res) => {
  const update = db.prepare('INSERT OR REPLACE INTO site_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const updateMany = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' || value === null) update.run(key, value);
    }
  });
  updateMany(req.body);
  res.json({ message: 'Settings saved' });
});

// ─── ADMINS ───────────────────────────────────────────────────
router.get('/admins', (req, res) => {
  const admins = db.prepare('SELECT id, email, name, role, is_active, last_login, created_at FROM admins').all();
  res.json({ admins });
});

router.put('/admins/:id/toggle', (req, res) => {
  if (parseInt(req.params.id) === req.admin.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  const admin = db.prepare('SELECT is_active FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE admins SET is_active = ? WHERE id = ?').run(admin.is_active ? 0 : 1, req.params.id);
  res.json({ message: 'Updated' });
});

module.exports = router;
