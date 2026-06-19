const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const router = express.Router();
const db = require('../database/database');
const { contactLimiter } = require('../middleware/security');

// GET /api/settings/public — public site settings
router.get('/settings/public', (req, res) => {
  const rows = db.prepare(`SELECT setting_key, setting_value FROM site_settings
    WHERE setting_key IN ('site_name','site_tagline','site_email','site_phone','site_address',
    'facebook_url','twitter_url','instagram_url','youtube_url','footer_text',
    'hero_title','hero_subtitle','about_text','cases_count','members_count','states_count','years_count')`).all();
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json(settings);
});

// GET /api/posts
router.get('/posts', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().trim().escape(),
], (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;
  const category = req.query.category;

  let where = "WHERE status = 'published'";
  const params = [];
  if (category) { where += ' AND category = ?'; params.push(category); }

  const posts = db.prepare(`SELECT id, title, slug, excerpt, category, tags, featured_image, published_at, views
    FROM blog_posts ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM blog_posts ${where}`).get(...params);

  res.json({ posts, total: total.c, page, pages: Math.ceil(total.c / limit) });
});

// GET /api/posts/:slug
router.get('/posts/:slug', [param('slug').trim().escape()], (req, res) => {
  const post = db.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'").get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  db.prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?').run(post.id);
  const related = db.prepare("SELECT id, title, slug, excerpt, featured_image, published_at FROM blog_posts WHERE category = ? AND slug != ? AND status = 'published' LIMIT 3").all(post.category, post.slug);
  res.json({ post, related });
});

// GET /api/investigations
router.get('/investigations', [
  query('status').optional().isIn(['ongoing', 'completed', 'archived']),
  query('state').optional().trim().escape(),
], (req, res) => {
  let where = 'WHERE is_published = 1';
  const params = [];
  if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }
  if (req.query.state) { where += ' AND state = ?'; params.push(req.query.state); }

  const investigations = db.prepare(`SELECT id, title, slug, location, state, date, description, status, evidence_types, images
    FROM investigations ${where} ORDER BY date DESC`).all(...params);
  res.json({ investigations });
});

// GET /api/investigations/:slug
router.get('/investigations/:slug', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE slug = ? AND is_published = 1').get(req.params.slug);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });
  res.json({ investigation: inv });
});

// GET /api/gallery
router.get('/gallery', [query('category').optional().trim().escape()], (req, res) => {
  let where = 'WHERE is_published = 1';
  const params = [];
  if (req.query.category) { where += ' AND category = ?'; params.push(req.query.category); }
  const items = db.prepare(`SELECT * FROM gallery ${where} ORDER BY sort_order ASC, created_at DESC`).all(...params);
  const categories = db.prepare("SELECT DISTINCT category FROM gallery WHERE is_published = 1").all().map(r => r.category);
  res.json({ items, categories });
});

// GET /api/team
router.get('/team', (req, res) => {
  const members = db.prepare('SELECT * FROM team_members WHERE is_active = 1 ORDER BY sort_order ASC').all();
  res.json({ members });
});

// GET /api/events
router.get('/events', [query('upcoming').optional().isBoolean()], (req, res) => {
  let where = 'WHERE is_published = 1';
  if (req.query.upcoming === 'true') where += " AND event_date >= date('now')";
  const events = db.prepare(`SELECT * FROM events ${where} ORDER BY event_date ASC`).all();
  res.json({ events });
});

// GET /api/pages/:slug
router.get('/pages/:slug', (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ page });
});

// POST /api/contact
router.post('/contact',
  contactLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional({ values: 'falsy' }).trim().escape().isLength({ max: 20 }),
    body('subject').trim().isLength({ min: 2, max: 200 }).escape(),
    body('message').trim().isLength({ min: 10, max: 2000 }).escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, phone, subject, message } = req.body;
    db.prepare('INSERT INTO contacts (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)').run(name, email, phone || null, subject, message);
    res.json({ message: 'Thank you for your message. We will get back to you soon.' });
  }
);

module.exports = router;
