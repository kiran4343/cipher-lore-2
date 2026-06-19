const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const router = express.Router();
const { get, all, run } = require('../database/database');
const { contactLimiter } = require('../middleware/security');

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/settings/public
router.get('/settings/public', wrap(async (req, res) => {
  const rows = await all(`SELECT setting_key, setting_value FROM site_settings
    WHERE setting_key IN ('site_name','site_tagline','site_email','site_phone','site_address',
    'facebook_url','twitter_url','instagram_url','youtube_url','footer_text',
    'hero_title','hero_subtitle','about_text','cases_count','members_count','states_count','years_count')`, []);
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json(settings);
}));

// GET /api/posts
router.get('/posts', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().trim().escape(),
], wrap(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;
  const category = req.query.category;

  let where = "WHERE status = 'published'";
  const params = [];
  if (category) { where += ' AND category = ?'; params.push(category); }

  const posts = await all(`SELECT id, title, slug, excerpt, category, tags, featured_image, published_at, views FROM blog_posts ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = await get(`SELECT COUNT(*) as c FROM blog_posts ${where}`, params);
  res.json({ posts, total: Number(total.c), page, pages: Math.ceil(Number(total.c) / limit) });
}));

// GET /api/posts/:slug
router.get('/posts/:slug', [param('slug').trim().escape()], wrap(async (req, res) => {
  const post = await get("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'", [req.params.slug]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  await run('UPDATE blog_posts SET views = views + 1 WHERE id = ?', [post.id]);
  const related = await all("SELECT id, title, slug, excerpt, featured_image, published_at FROM blog_posts WHERE category = ? AND slug != ? AND status = 'published' LIMIT 3", [post.category, post.slug]);
  res.json({ post, related });
}));

// GET /api/investigations
router.get('/investigations', [
  query('status').optional().isIn(['ongoing', 'completed', 'archived']),
  query('state').optional().trim().escape(),
], wrap(async (req, res) => {
  let where = 'WHERE is_published = 1';
  const params = [];
  if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }
  if (req.query.state) { where += ' AND state = ?'; params.push(req.query.state); }
  const investigations = await all(`SELECT id, title, slug, location, state, date, description, status, evidence_types, images FROM investigations ${where} ORDER BY date DESC`, params);
  res.json({ investigations });
}));

// GET /api/investigations/:slug
router.get('/investigations/:slug', wrap(async (req, res) => {
  const inv = await get('SELECT * FROM investigations WHERE slug = ? AND is_published = 1', [req.params.slug]);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });
  res.json({ investigation: inv });
}));

// GET /api/gallery
router.get('/gallery', [query('category').optional().trim().escape()], wrap(async (req, res) => {
  let where = 'WHERE is_published = 1';
  const params = [];
  if (req.query.category) { where += ' AND category = ?'; params.push(req.query.category); }
  const items = await all(`SELECT * FROM gallery ${where} ORDER BY sort_order ASC, created_at DESC`, params);
  const catRows = await all('SELECT DISTINCT category FROM gallery WHERE is_published = 1', []);
  res.json({ items, categories: catRows.map(r => r.category) });
}));

// GET /api/team
router.get('/team', wrap(async (req, res) => {
  const members = await all('SELECT * FROM team_members WHERE is_active = 1 ORDER BY sort_order ASC', []);
  res.json({ members });
}));

// GET /api/events
router.get('/events', [query('upcoming').optional().isBoolean()], wrap(async (req, res) => {
  let where = 'WHERE is_published = 1';
  if (req.query.upcoming === 'true') where += " AND event_date >= date('now')";
  const events = await all(`SELECT * FROM events ${where} ORDER BY event_date ASC`, []);
  res.json({ events });
}));

// GET /api/pages/:slug
router.get('/pages/:slug', wrap(async (req, res) => {
  const page = await get('SELECT * FROM pages WHERE slug = ?', [req.params.slug]);
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ page });
}));

// POST /api/contact
router.post('/contact',
  contactLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be at least 2 characters.').escape(),
    body('email').isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
    body('phone').optional({ values: 'falsy' }).trim().escape().isLength({ max: 20 }).withMessage('Phone number is too long.'),
    body('subject').trim().isLength({ min: 2, max: 200 }).withMessage('Subject must be at least 2 characters.').escape(),
    body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message must be at least 10 characters.').escape(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, phone, subject, message } = req.body;
    await run('INSERT INTO contacts (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)', [name, email, phone || null, subject, message]);
    res.json({ message: 'Thank you for your message. We will get back to you soon.' });
  })
);

module.exports = router;
