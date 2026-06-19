require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let url = process.env.TURSO_URL;
if (!url) {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  url = 'file:' + path.join(dataDir, 'local.db');
}

const client = createClient({
  url,
  authToken: process.env.TURSO_TOKEN || undefined,
});

const get   = async (sql, args = []) => { const r = await client.execute({ sql, args }); return r.rows[0] ?? null; };
const all   = async (sql, args = []) => { const r = await client.execute({ sql, args }); return r.rows; };
const run   = async (sql, args = []) => { const r = await client.execute({ sql, args }); return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected }; };
const batch = async (stmts) => { if (!stmts?.length) return; return client.batch(stmts, 'write'); };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  is_active INTEGER DEFAULT 1,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id INTEGER REFERENCES admins(id),
  category TEXT DEFAULT 'General',
  tags TEXT DEFAULT '[]',
  featured_image TEXT DEFAULT '/images/blog-default.jpg',
  status TEXT DEFAULT 'draft',
  views INTEGER DEFAULT 0,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  location TEXT,
  state TEXT,
  date TEXT,
  description TEXT,
  full_report TEXT,
  status TEXT DEFAULT 'ongoing',
  evidence_types TEXT DEFAULT '[]',
  images TEXT DEFAULT '[]',
  is_published INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  image_url TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  investigation_id INTEGER REFERENCES investigations(id),
  sort_order INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  image_url TEXT DEFAULT '/images/team-default.jpg',
  specializations TEXT DEFAULT '[]',
  social_links TEXT DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  joined_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT,
  event_time TEXT,
  location TEXT,
  image_url TEXT DEFAULT '/images/event-default.jpg',
  registration_link TEXT,
  max_participants INTEGER,
  is_published INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ip_address TEXT,
  country TEXT,
  country_code TEXT,
  city TEXT,
  region TEXT,
  latitude REAL,
  longitude REAL,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  user_agent TEXT,
  referrer TEXT,
  first_page TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id INTEGER REFERENCES visitors(id),
  session_id TEXT,
  page TEXT NOT NULL,
  page_title TEXT,
  duration INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_blog_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_inv_slug ON investigations(slug);
CREATE INDEX IF NOT EXISTS idx_visitors_created ON visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_session ON page_views(session_id);
`;

async function initializeDatabase() {
  await client.executeMultiple(SCHEMA);
}

async function seedDefaultData() {
  const row = await get('SELECT COUNT(*) as c FROM site_settings', []);
  if (Number(row.c) > 0) return;

  await batch([
    ['site_name', 'Project Cipher Lore'],
    ['site_tagline', "Exploring the Unexplained — India's Premier Paranormal Research Organization"],
    ['site_email', 'contact@projectcipherlore.com'],
    ['site_phone', '+91 98765 43210'],
    ['site_address', 'New Delhi, India'],
    ['facebook_url', 'https://facebook.com/indianparanormalsociety'],
    ['twitter_url', 'https://twitter.com/ips_official'],
    ['instagram_url', 'https://instagram.com/indianparanormalsociety'],
    ['youtube_url', 'https://youtube.com/@indianparanormalsociety'],
    ['footer_text', '© 2024 Project Cipher Lore. All rights reserved.'],
    ['hero_title', "Exploring India's Unexplained Mysteries"],
    ['hero_subtitle', "India's premier paranormal research organization — documenting, investigating, and demystifying paranormal phenomena across the subcontinent since 2008."],
    ['about_text', "The Project Cipher Lore (PCL) is a dedicated organization of researchers, scientists, and investigators committed to exploring and documenting paranormal phenomena across India."],
    ['cases_count', '500+'],
    ['members_count', '120+'],
    ['states_count', '28'],
    ['years_count', '16+'],
    ['google_analytics_id', ''],
    ['maintenance_mode', '0'],
  ].map(([k, v]) => ({ sql: 'INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)', args: [k, v] })));

  const invRow = await get('SELECT COUNT(*) as c FROM investigations', []);
  if (Number(invRow.c) === 0) {
    const invSql = 'INSERT INTO investigations (title, slug, location, state, date, description, full_report, status, evidence_types, images, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
    await run(invSql, ['Bhangarh Fort Investigation', 'bhangarh-fort', 'Bhangarh', 'Rajasthan', '2024-03-15', "A thorough overnight investigation of India's most famously haunted fort.", 'Our team of 8 investigators spent two nights at Bhangarh Fort conducting systematic sweeps of all accessible areas.', 'completed', '["EVP","EMF","Thermal Imaging","Photography"]', '["/images/inv/bhangarh1.jpg"]', 1]);
    await run(invSql, ['Dow Hill Forest Investigation', 'dow-hill-forest', 'Kurseong', 'West Bengal', '2024-01-20', 'Investigating the infamous Dow Hill area known for headless apparitions and paranormal activity.', 'The Dow Hill Forest investigation was conducted over three nights in January 2024.', 'completed', '["EVP","Thermal Imaging","Spirit Box"]', '["/images/inv/dow1.jpg"]', 1]);
    await run(invSql, ['Kuldhara Abandoned Village', 'kuldhara-village', 'Jaisalmer', 'Rajasthan', '2023-11-10', 'Overnight investigation of the 500-year-old abandoned village of Kuldhara.', 'Kuldhara stands as one of India\'s most intriguing paranormal locations.', 'completed', '["EVP","EMF","Trigger Objects"]', '["/images/inv/kuldhara1.jpg"]', 1]);
    await run(invSql, ['Delhi Cantonment Ghost Truck', 'delhi-cantonment', 'Delhi Cantonment', 'Delhi', '2024-05-01', 'Investigating the legendary phantom truck of Delhi Cantonment.', 'Our team staked out the location on five consecutive nights with multiple cameras.', 'ongoing', '["EMF","Video Surveillance"]', '[]', 1]);
    await run(invSql, ['Shaniwarwada Fort', 'shaniwarwada-fort', 'Pune', 'Maharashtra', '2023-09-18', 'Investigating Shaniwarwada Fort where screams of young prince Narayan Rao are reportedly heard.', 'The Shaniwarwada Fort investigation focused on the royal chambers and Delhi Gate.', 'completed', '["EVP","Infrasound Detection","EMF"]', '["/images/inv/shaniwarwada1.jpg"]', 1]);
  }

  const teamRow = await get('SELECT COUNT(*) as c FROM team_members', []);
  if (Number(teamRow.c) === 0) {
    const tSql = 'INSERT INTO team_members (name, role, bio, image_url, specializations, sort_order, joined_date) VALUES (?,?,?,?,?,?,?)';
    await run(tSql, ['Tanushree', 'Founder & Lead Investigator', 'Tanushree is the founder and lead investigator of Project Cipher Lore with over 20 years of experience.', '/images/team/tanushree.jpg', '["EVP Analysis","EMF Detection","Scientific Documentation"]', 1, '2008-01-01']);
    await run(tSql, ['Priya Nair', 'Co-Founder & Psychic Medium', 'Priya Nair is a trained psychic medium with over 15 years of experience.', '/images/team/priya.jpg', '["Psychic Investigation","Spirit Communication"]', 2, '2008-01-01']);
    await run(tSql, ['Rahul Desai', 'Senior Tech Specialist', 'Rahul Desai manages all technological aspects of PCL investigations.', '/images/team/rahul.jpg', '["Custom Equipment","EVP Recording","Data Analysis"]', 3, '2010-03-15']);
    await run(tSql, ['Dr. Meera Pillai', 'Paranormal Psychologist', 'Dr. Meera Pillai brings psychological expertise to distinguish genuine paranormal experiences.', '/images/team/meera.jpg', '["Witness Interviews","Psychological Assessment"]', 4, '2012-06-20']);
    await run(tSql, ['Vikram Singh', 'Field Investigator', 'Vikram Singh is one of PCL\'s most experienced field investigators with over 200 investigations.', '/images/team/vikram.jpg', '["Field Investigation","Evidence Collection"]', 5, '2015-04-10']);
    await run(tSql, ['Ananya Roy', 'Research Historian', 'Ananya Roy specialises in historical research providing crucial background on investigated locations.', '/images/team/ananya.jpg', '["Historical Research","Folklore Analysis"]', 6, '2016-09-01']);
  }

  const postRow = await get('SELECT COUNT(*) as c FROM blog_posts', []);
  if (Number(postRow.c) === 0) {
    const pSql = 'INSERT INTO blog_posts (title, slug, content, excerpt, category, tags, featured_image, status, published_at) VALUES (?,?,?,?,?,?,?,?,?)';
    const d = (n) => new Date(Date.now() - n * 86400000).toISOString();
    await run(pSql, ['Understanding EVP: Electronic Voice Phenomena', 'understanding-evp', '<p>EVP refers to sounds found on electronic recordings interpreted as spirit voices.</p>', 'Learn how PCL uses scientific methodology to capture and analyse potential spirit voices.', 'Research', '["EVP","Investigation","Science"]', '/images/blog/evp-research.jpg', 'published', d(15)]);
    await run(pSql, ['Top 10 Most Haunted Locations in India', 'top-10-haunted-india', '<p>India is home to some of the most compelling paranormal hotspots in the world.</p>', "PCL ranks the top 10 based on our investigations.", 'Investigations', '["Haunted Places","India","Top 10"]', '/images/blog/haunted-india.jpg', 'published', d(30)]);
    await run(pSql, ['The Science Behind Paranormal Investigation Equipment', 'paranormal-investigation-equipment', '<p>Modern paranormal investigation relies on a sophisticated array of scientific instruments.</p>', 'A deep dive into the scientific instruments used by paranormal investigators.', 'Technology', '["Equipment","Science","EMF","Technology"]', '/images/blog/equipment.jpg', 'published', d(45)]);
  }

  const evtRow = await get('SELECT COUNT(*) as c FROM events', []);
  if (Number(evtRow.c) === 0) {
    const eSql = 'INSERT INTO events (title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published) VALUES (?,?,?,?,?,?,?,?,?)';
    await run(eSql, ['Bhangarh Overnight Investigation', 'Join PCL investigators for an exclusive overnight investigation of Bhangarh Fort.', '2024-09-21', '21:00', 'Bhangarh Fort, Rajasthan', '/images/events/bhangarh-event.jpg', '#', 15, 1]);
    await run(eSql, ['Paranormal Investigation Workshop — Mumbai', 'A full-day workshop covering the fundamentals of paranormal investigation.', '2024-08-17', '10:00', 'Hotel Taj Mahal Palace, Mumbai', '/images/events/workshop-mumbai.jpg', '#', 30, 1]);
    await run(eSql, ['PCL Annual Conference 2024', 'The 16th Annual Project Cipher Lore Conference.', '2024-10-05', '09:00', 'India International Centre, New Delhi', '/images/events/conference-2024.jpg', '#', 200, 1]);
  }

  const galRow = await get('SELECT COUNT(*) as c FROM gallery', []);
  if (Number(galRow.c) === 0) {
    const gSql = 'INSERT INTO gallery (title, description, image_url, category, sort_order) VALUES (?,?,?,?,?)';
    const gItems = [
      ['Bhangarh Fort at Night', 'The ancient ruins of Bhangarh Fort illuminated by the full moon', '/images/gallery/g1.jpg', 'Investigations', 1],
      ['EVP Session in Progress', 'PCL investigators conducting an EVP session', '/images/gallery/g2.jpg', 'Equipment', 2],
      ['Thermal Imaging Evidence', 'Thermal camera capture showing an anomalous heat signature', '/images/gallery/g3.jpg', 'Evidence', 3],
      ['Dow Hill Forest', 'The dense forest surrounding Dow Hill, Kurseong', '/images/gallery/g4.jpg', 'Investigations', 4],
      ['Team at Kuldhara', 'PCL team preparing equipment at Kuldhara abandoned village', '/images/gallery/g5.jpg', 'Team', 5],
      ['EMF Detection', 'High EMF readings at Shaniwarwada Fort', '/images/gallery/g6.jpg', 'Evidence', 6],
      ['Investigation Command Post', 'Real-time monitoring station during a major investigation', '/images/gallery/g7.jpg', 'Equipment', 7],
      ['Delhi Cantonment Stakeout', 'Night surveillance setup at Delhi Cantonment', '/images/gallery/g8.jpg', 'Investigations', 8],
      ['Full Moon Investigation', 'Team conducting a full moon investigation in Rajasthan', '/images/gallery/g9.jpg', 'Investigations', 9],
      ['Spirit Photography Workshop', 'Participants learning spirit photography techniques', '/images/gallery/g10.jpg', 'Events', 10],
      ['Annual Conference 2023', 'Members at the PCL Annual Conference in Hyderabad', '/images/gallery/g11.jpg', 'Events', 11],
      ['Lab Analysis', 'Audio specialists analysing EVP recordings in the PCL lab', '/images/gallery/g12.jpg', 'Research', 12],
    ];
    for (const g of gItems) await run(gSql, g);
  }

  const pgRow = await get('SELECT COUNT(*) as c FROM pages', []);
  if (Number(pgRow.c) === 0) {
    const pgSql = 'INSERT INTO pages (slug, title, content, meta_description) VALUES (?,?,?,?)';
    await run(pgSql, ['home', 'Home', JSON.stringify({ sections: [] }), "Project Cipher Lore - Exploring India's Unexplained Mysteries"]);
    await run(pgSql, ['about', 'About Us', '{}', "Learn about the Project Cipher Lore — our history, mission, and team."]);
    await run(pgSql, ['contact', 'Contact Us', '{}', "Contact the Project Cipher Lore to report paranormal experiences."]);
  }
}

async function ensureAdmin() {
  const row = await get('SELECT COUNT(*) as c FROM admins', []);
  if (Number(row.c) > 0) return;
  const hash = bcrypt.hashSync('Sp3ctral#K9!xM@72', 12);
  await run("INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)", ["Tanu'sCipherLore", 'admin@cipherlore.com', hash]);
  console.log('[db] Default admin account created');
}

const ready = initializeDatabase()
  .then(seedDefaultData)
  .then(ensureAdmin)
  .catch(err => { console.error('[db] Init failed:', err); process.exit(1); });

module.exports = { get, all, run, batch, ready };
