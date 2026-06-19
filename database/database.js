const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ips.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
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
  `);

  seedDefaultData();
}

function seedDefaultData() {
  const settingsCount = db.prepare('SELECT COUNT(*) as c FROM site_settings').get();
  if (settingsCount.c > 0) return;

  const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)');
  const settings = [
    ['site_name', 'Project Cipher Lore'],
    ['site_tagline', 'Exploring the Unexplained — India\'s Premier Paranormal Research Organization'],
    ['site_email', 'contact@projectcipherlore.com'],
    ['site_phone', '+91 98765 43210'],
    ['site_address', 'New Delhi, India'],
    ['facebook_url', 'https://facebook.com/indianparanormalsociety'],
    ['twitter_url', 'https://twitter.com/ips_official'],
    ['instagram_url', 'https://instagram.com/indianparanormalsociety'],
    ['youtube_url', 'https://youtube.com/@indianparanormalsociety'],
    ['footer_text', '© 2024 Project Cipher Lore. All rights reserved.'],
    ['hero_title', 'Exploring India\'s Unexplained Mysteries'],
    ['hero_subtitle', 'India\'s premier paranormal research organization — documenting, investigating, and demystifying paranormal phenomena across the subcontinent since 2008.'],
    ['about_text', 'The Project Cipher Lore (PCL) is a dedicated organization of researchers, scientists, and investigators committed to exploring and documenting paranormal phenomena across India. Founded in 2008, we have conducted hundreds of investigations across India\'s most historically significant and reportedly haunted locations.'],
    ['cases_count', '500+'],
    ['members_count', '120+'],
    ['states_count', '28'],
    ['years_count', '16+'],
    ['google_analytics_id', ''],
    ['maintenance_mode', '0'],
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertSetting.run(...row);
  });
  insertMany(settings);

  const invCount = db.prepare('SELECT COUNT(*) as c FROM investigations').get();
  if (invCount.c === 0) {
    const insertInv = db.prepare(`INSERT INTO investigations (title, slug, location, state, date, description, full_report, status, evidence_types, images, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const investigations = [
      ['Bhangarh Fort Investigation', 'bhangarh-fort', 'Bhangarh', 'Rajasthan', '2024-03-15', 'A thorough overnight investigation of India\'s most famously haunted fort. The team recorded multiple EVP sessions and captured anomalous energy readings throughout the ruins.', 'Our team of 8 investigators spent two nights at Bhangarh Fort, conducting systematic sweeps of all accessible areas. EVP recordings revealed unexplained voices in the Hanuman temple ruins. EMF meters spiked repeatedly near the old palace entrance. Thermal cameras captured unexplained heat signatures in the abandoned market area. One investigator reported being physically touched in the queen\'s chamber. The investigation yielded compelling evidence that warrants further study.', 'completed', '["EVP", "EMF", "Thermal Imaging", "Photography"]', '["/images/inv/bhangarh1.jpg", "/images/inv/bhangarh2.jpg"]', 1],
      ['Dow Hill Forest Investigation', 'dow-hill-forest', 'Kurseong', 'West Bengal', '2024-01-20', 'Investigating the infamous Dow Hill area known for headless apparitions and paranormal activity in the dense forest near the Victoria Boys\' High School.', 'The Dow Hill Forest investigation was conducted over three nights in January 2024. The team documented numerous unexplained phenomena including disembodied footsteps, shadow figures, and anomalous cold spots despite relatively warm ambient temperatures. The Victoria Boys\' High School corridor yielded the most compelling evidence — a full-body apparition was captured on thermal camera at 2:47 AM. EVP recordings from the forest produced multiple Class A responses.', 'completed', '["EVP", "Thermal Imaging", "Spirit Box", "Full Spectrum Camera"]', '["/images/inv/dow1.jpg", "/images/inv/dow2.jpg"]', 1],
      ['Kuldhara Abandoned Village', 'kuldhara-village', 'Jaisalmer', 'Rajasthan', '2023-11-10', 'Overnight investigation of the 500-year-old abandoned village of Kuldhara, cursed by the Paliwal Brahmins who mysteriously vanished overnight in 1825.', 'Kuldhara stands as one of India\'s most intriguing paranormal locations. Our investigation sought to document any residual energy from the mass exodus of 1825. The team set up a perimeter of trigger objects, motion sensors, and audio recorders across 15 key locations within the ruins. Results were fascinating — motion sensors triggered in sealed rooms with no wind. Audio recordings captured what appears to be communal chanting in an ancient dialect. Several investigators reported overwhelming feelings of sadness and urgency near the temple ruins.', 'completed', '["EVP", "EMF", "Trigger Objects", "Motion Sensors"]', '["/images/inv/kuldhara1.jpg"]', 1],
      ['Delhi Cantonment Ghost Truck', 'delhi-cantonment', 'Delhi Cantonment', 'Delhi', '2024-05-01', 'Investigating the legendary phantom truck of Delhi Cantonment — reported by hundreds of motorists who claim to have been chased by a ghostly vehicle late at night.', 'The Delhi Cantonment stretch between Shanti Path and Africa Avenue has been associated with paranormal vehicle sightings for decades. Our team staked out the location on five consecutive nights with multiple cameras and audio equipment. On the third night, EMF readings spiked dramatically at 1:15 AM along a specific 200-meter stretch. Dashcam footage captured an unusual light phenomenon that remains unexplained. Witness interviews corroborate consistent patterns in the sightings.', 'ongoing', '["EMF", "Video Surveillance", "Witness Interviews"]', '[]', 1],
      ['Shaniwarwada Fort', 'shaniwarwada-fort', 'Pune', 'Maharashtra', '2023-09-18', 'Investigating the Shaniwarwada Fort where the screams of the young prince Narayan Rao are reportedly heard on full moon nights.', 'The Shaniwarwada Fort investigation focused on the royal chambers and the infamous Delhi Gate where Narayan Rao was assassinated in 1773. Our team conducted sessions during the full moon as per historical accounts of the hauntings. Audio analysis revealed unexplained sounds consistent with human distress in the 10-20 Hz range (infrasound). Physical symptoms experienced by multiple investigators — including anxiety and unease — may be attributable to infrasound or genuine paranormal activity.', 'completed', '["EVP", "Infrasound Detection", "Full Spectrum Camera", "EMF"]', '["/images/inv/shaniwarwada1.jpg"]', 1],
    ];
    const insertInvMany = db.transaction((rows) => {
      for (const row of rows) insertInv.run(...row);
    });
    insertInvMany(investigations);
  }

  const teamCount = db.prepare('SELECT COUNT(*) as c FROM team_members').get();
  if (teamCount.c === 0) {
    const insertTeam = db.prepare(`INSERT INTO team_members (name, role, bio, image_url, specializations, sort_order, joined_date) VALUES (?,?,?,?,?,?,?)`);
    const team = [
      ['Tanushree', 'Founder & Lead Investigator', 'Tanushree is the founder and lead investigator of Project Cipher Lore, with over 20 years of experience researching paranormal phenomena. She established PCL with a mission to bring scientific rigour to paranormal research across India, and has personally led over 300 investigations.', '/images/team/tanushree.jpg', '["EVP Analysis", "EMF Detection", "Scientific Documentation"]', 1, '2008-01-01'],
      ['Priya Nair', 'Co-Founder & Psychic Medium', 'Priya Nair is a trained psychic medium with over 15 years of experience. She works alongside the scientific team to provide intuitive insights while the technology captures measurable data. Her experiences have been documented in several paranormal publications.', '/images/team/priya.jpg', '["Psychic Investigation", "Spirit Communication", "Cleansing Rituals"]', 2, '2008-01-01'],
      ['Rahul Desai', 'Senior Tech Specialist', 'Rahul Desai manages all technological aspects of PCL investigations. He has built custom paranormal detection equipment and developed the society\'s proprietary EVP analysis software. A certified electronics engineer, he ensures all data is scientifically valid.', '/images/team/rahul.jpg', '["Custom Equipment", "EVP Recording", "Data Analysis", "Thermal Imaging"]', 3, '2010-03-15'],
      ['Dr. Meera Pillai', 'Paranormal Psychologist', 'Dr. Meera Pillai brings psychological expertise to the team, helping distinguish genuine paranormal experiences from psychological phenomena. She has published research on the psychology of paranormal belief in peer-reviewed journals.', '/images/team/meera.jpg', '["Witness Interviews", "Psychological Assessment", "Research Documentation"]', 4, '2012-06-20'],
      ['Vikram Singh', 'Field Investigator', 'Vikram Singh is one of PCL\'s most experienced field investigators, having participated in over 200 investigations. A former police officer, he brings discipline and keen observational skills to every investigation.', '/images/team/vikram.jpg', '["Field Investigation", "Site Security", "Evidence Collection"]', 5, '2015-04-10'],
      ['Ananya Roy', 'Research Historian', 'Ananya Roy specializes in historical research, providing crucial background on investigated locations. Her expertise in Indian history and folklore helps the team understand the context behind reported paranormal activity.', '/images/team/ananya.jpg', '["Historical Research", "Folklore Analysis", "Documentation"]', 6, '2016-09-01'],
    ];
    const insertTeamMany = db.transaction((rows) => {
      for (const row of rows) insertTeam.run(...row);
    });
    insertTeamMany(team);
  }

  const postCount = db.prepare('SELECT COUNT(*) as c FROM blog_posts').get();
  if (postCount.c === 0) {
    const insertPost = db.prepare(`INSERT INTO blog_posts (title, slug, content, excerpt, category, tags, featured_image, status, published_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const posts = [
      ['Understanding EVP: Electronic Voice Phenomena in Paranormal Investigation', 'understanding-evp', '<p>Electronic Voice Phenomena (EVP) refers to sounds found on electronic recordings that are interpreted as spirit voices. Since the 1960s, EVP has been a cornerstone of paranormal investigation, offering potential audio evidence of the unexplained.</p><h2>History of EVP</h2><p>The systematic study of EVP began with Friedrich Jürgenson in 1959 when he discovered what he believed were spirit voices on recordings of bird songs. His work inspired Konstantīns Raudive, who documented thousands of EVP recordings in his 1971 book "Breakthrough."</p><h2>Types of EVP</h2><p>EVP researchers classify recordings into three classes:</p><ul><li><strong>Class A:</strong> Clear, audible without enhancement, agreed upon by most listeners</li><li><strong>Class B:</strong> Requires some amplification, not agreed upon by all</li><li><strong>Class C:</strong> Barely audible, highly subjective</li></ul><h2>PCL Methodology</h2><p>At PCL, we use multiple recorders simultaneously to eliminate recording artifacts. We conduct sessions in controlled environments with baseline audio measurements. All recordings are analyzed using professional audio software by at least three independent team members.</p><p>Our EVP database contains over 1,200 recordings from investigations across India, representing one of the largest collections of Indian paranormal audio evidence.</p>', 'EVP or Electronic Voice Phenomena has been a cornerstone of paranormal investigation since the 1960s. Learn how PCL uses scientific methodology to capture and analyze potential spirit voices.', 'Research', '["EVP", "Investigation", "Science", "Methodology"]', '/images/blog/evp-research.jpg', 'published', new Date(Date.now() - 15*86400000).toISOString()],
      ['Top 10 Most Haunted Locations in India', 'top-10-haunted-india', '<p>India, with its millennia of history, countless battles, ancient temples, and mysterious traditions, is home to some of the most compelling paranormal hotspots in the world. Here are our top 10 most investigated and evidentially rich locations.</p><h2>1. Bhangarh Fort, Rajasthan</h2><p>Often called "the most haunted place in India," Bhangarh Fort has been officially sealed by the Archaeological Survey of India after sunset. Our multiple investigations here have yielded compelling EVP recordings and anomalous energy readings.</p><h2>2. Dow Hill, West Bengal</h2><p>The forested hills around Kurseong are associated with numerous sightings and unexplained phenomena. The Victoria Boys\' High School corridor is particularly active during the December holiday period.</p><h2>3. Kuldhara, Rajasthan</h2><p>This abandoned 500-year-old village was mysteriously deserted overnight in 1825. Visitors still report overwhelming feelings of unease and report hearing sounds of an invisible community.</p><h2>4. Ramoji Film City, Hyderabad</h2><p>Built on the grounds of a former battlefield, this massive studio complex has reported so many unexplained incidents that it has its own internal security protocol for paranormal activity.</p><h2>5. Shaniwarwada Fort, Pune</h2><p>The screams of the young prince Narayan Rao are reportedly heard on full moon nights at this 18th-century fort where he was brutally assassinated.</p>', 'From the sealed ruins of Bhangarh to the cursed village of Kuldhara, India harbors some of the world\'s most compelling paranormal locations. PCL ranks the top 10 based on our investigations.', 'Investigations', '["Haunted Places", "India", "Investigation", "Top 10"]', '/images/blog/haunted-india.jpg', 'published', new Date(Date.now() - 30*86400000).toISOString()],
      ['The Science Behind Paranormal Investigation Equipment', 'paranormal-investigation-equipment', '<p>Modern paranormal investigation relies on a sophisticated array of scientific instruments. Understanding what these tools measure — and their limitations — is crucial for any serious researcher.</p><h2>EMF Meters</h2><p>Electromagnetic Field meters detect fluctuations in electromagnetic energy. While some paranormal investigators believe spirits can manipulate EM fields, it\'s equally important to rule out mundane sources like electrical wiring, appliances, and geological factors.</p><h2>Thermal Imaging Cameras</h2><p>FLIR and similar thermal cameras detect infrared radiation, showing temperature variations. Cold spots have long been associated with paranormal activity. However, proper use requires accounting for drafts, convection currents, and heat absorption by different materials.</p><h2>Digital Voice Recorders</h2><p>High-sensitivity digital recorders capture audio in frequency ranges that may be missed by the human ear. At PCL, we use recorders capable of capturing frequencies from 20Hz to 24kHz simultaneously.</p><h2>Full Spectrum Cameras</h2><p>Standard cameras filter out UV and near-infrared light. Full spectrum cameras, with their filters removed, can potentially capture energy outside the visible light spectrum.</p><h2>PCL\'s Custom Equipment</h2><p>Our tech team has developed several proprietary tools including a multi-sensor array that simultaneously captures EMF, temperature, humidity, barometric pressure, and audio data, creating comprehensive environmental profiles of investigated spaces.</p>', 'A deep dive into the scientific instruments used by paranormal investigators and how PCL uses scientific methodology to separate genuine anomalies from mundane explanations.', 'Technology', '["Equipment", "Science", "EMF", "Thermal Imaging", "Technology"]', '/images/blog/equipment.jpg', 'published', new Date(Date.now() - 45*86400000).toISOString()],
    ];
    const insertPostMany = db.transaction((rows) => {
      for (const row of rows) insertPost.run(...row);
    });
    insertPostMany(posts);
  }

  const eventCount = db.prepare('SELECT COUNT(*) as c FROM events').get();
  if (eventCount.c === 0) {
    const insertEvent = db.prepare(`INSERT INTO events (title, description, event_date, event_time, location, image_url, registration_link, max_participants, is_published) VALUES (?,?,?,?,?,?,?,?,?)`);
    const events = [
      ['Bhangarh Overnight Investigation', 'Join PCL investigators for an exclusive overnight investigation of the legendary Bhangarh Fort. Participants will learn to use paranormal detection equipment, participate in EVP sessions, and explore the ruins under expert guidance. Limited to 15 participants.', '2024-09-21', '21:00', 'Bhangarh Fort, Rajasthan', '/images/events/bhangarh-event.jpg', '#', 15, 1],
      ['Paranormal Investigation Workshop — Mumbai', 'A full-day workshop covering the fundamentals of paranormal investigation. Topics include EVP methodology, EMF detection, case documentation, and the psychology of paranormal experiences. Certificate of completion provided.', '2024-08-17', '10:00', 'Hotel Taj Mahal Palace, Mumbai', '/images/events/workshop-mumbai.jpg', '#', 30, 1],
      ['PCL Annual Conference 2024', 'The 16th Annual Project Cipher Lore Conference brings together researchers, investigators, and enthusiasts from across India. Featuring keynote speakers, investigation reports, equipment demonstrations, and networking sessions.', '2024-10-05', '09:00', 'India International Centre, New Delhi', '/images/events/conference-2024.jpg', '#', 200, 1],
    ];
    const insertEventMany = db.transaction((rows) => {
      for (const row of rows) insertEvent.run(...row);
    });
    insertEventMany(events);
  }

  const galleryCount = db.prepare('SELECT COUNT(*) as c FROM gallery').get();
  if (galleryCount.c === 0) {
    const insertGallery = db.prepare(`INSERT INTO gallery (title, description, image_url, category, sort_order) VALUES (?,?,?,?,?)`);
    const gallery = [
      ['Bhangarh Fort at Night', 'The ancient ruins of Bhangarh Fort illuminated by the full moon', '/images/gallery/g1.jpg', 'Investigations', 1],
      ['EVP Session in Progress', 'PCL investigators conducting an EVP session in the Bhangarh palace', '/images/gallery/g2.jpg', 'Equipment', 2],
      ['Thermal Imaging Evidence', 'Thermal camera capture showing an anomalous heat signature', '/images/gallery/g3.jpg', 'Evidence', 3],
      ['Dow Hill Forest', 'The dense forest surrounding Dow Hill, Kurseong', '/images/gallery/g4.jpg', 'Investigations', 4],
      ['Team at Kuldhara', 'PCL team preparing equipment at Kuldhara abandoned village', '/images/gallery/g5.jpg', 'Team', 5],
      ['EMF Detection', 'High EMF readings at Shaniwarwada Fort', '/images/gallery/g6.jpg', 'Evidence', 6],
      ['Investigation Command Post', 'Real-time monitoring station during a major investigation', '/images/gallery/g7.jpg', 'Equipment', 7],
      ['Delhi Cantonment Stakeout', 'Night surveillance setup at Delhi Cantonment', '/images/gallery/g8.jpg', 'Investigations', 8],
      ['Full Moon Investigation', 'Team conducting a full moon investigation in Rajasthan', '/images/gallery/g9.jpg', 'Investigations', 9],
      ['Spirit Photography Workshop', 'Participants learning spirit photography techniques', '/images/gallery/g10.jpg', 'Events', 10],
      ['Annual Conference 2023', 'Members at the PCL Annual Conference in Hyderabad', '/images/gallery/g11.jpg', 'Events', 11],
      ['Lab Analysis', 'Audio specialists analyzing EVP recordings in the PCL lab', '/images/gallery/g12.jpg', 'Research', 12],
    ];
    const insertGalleryMany = db.transaction((rows) => {
      for (const row of rows) insertGallery.run(...row);
    });
    insertGalleryMany(gallery);
  }

  const pagesCount = db.prepare('SELECT COUNT(*) as c FROM pages').get();
  if (pagesCount.c === 0) {
    const insertPage = db.prepare(`INSERT INTO pages (slug, title, content, meta_description) VALUES (?,?,?,?)`);
    const pages = [
      ['home', 'Home', JSON.stringify({ sections: [] }), 'Project Cipher Lore - Exploring India\'s Unexplained Mysteries'],
      ['about', 'About Us', '<section class="page-section"><h1>About the Project Cipher Lore</h1><p>Project Cipher Lore (PCL) was founded in 2008 by Tanushree with a singular mission: to investigate paranormal phenomena across India using scientific methodology and open-minded inquiry.</p><h2>Our Mission</h2><p>We are committed to providing honest, evidence-based investigation of paranormal claims. We neither promote nor debunk paranormal activity — we investigate, document, and present our findings to let the evidence speak for itself.</p><h2>Our Approach</h2><p>Every PCL investigation follows a strict protocol: extensive pre-investigation research, site baseline measurements, multi-layered evidence collection, and rigorous post-investigation analysis. We believe that true paranormal research requires the same standards as any scientific inquiry.</p><h2>Our History</h2><p>Since our founding, PCL has grown from a two-person team conducting local investigations to a nationwide organization with over 120 active members across 28 states. We have conducted over 500 investigations, built a database of thousands of EVP recordings, and contributed to peer-reviewed paranormal research publications.</p></section>', 'Learn about the Project Cipher Lore — our history, mission, and the team of researchers dedicated to exploring India\'s paranormal mysteries.'],
      ['contact', 'Contact Us', '<section class="page-section"><h1>Contact the Project Cipher Lore</h1><p>Have a paranormal experience to report? Want to collaborate? Interested in joining our team? We\'d love to hear from you.</p></section>', 'Contact the Project Cipher Lore to report paranormal experiences, inquire about investigations, or join our research team.'],
    ];
    const insertPageMany = db.transaction((rows) => {
      for (const row of rows) insertPage.run(...row);
    });
    insertPageMany(pages);
  }
}

initializeDatabase();

module.exports = db;
