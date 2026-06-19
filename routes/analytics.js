const express = require('express');
const geoip = require('geoip-lite');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../database/database');
const { trackLimiter } = require('../middleware/security');

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'desktop' };

  let browser = 'Unknown';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'Internet Explorer';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  let device = 'desktop';
  if (ua.includes('Mobile') || ua.includes('Android') && ua.includes('mobi')) device = 'mobile';
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'tablet';

  return { browser, os, device };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// POST /api/track — track page view
router.post('/', trackLimiter, (req, res) => {
  try {
    const { page, pageTitle, sessionId: clientSessionId, referrer, duration } = req.body;
    if (!page) return res.status(400).json({ error: 'page required' });

    const sessionId = clientSessionId || uuidv4();
    const ua = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUserAgent(ua);
    const ip = getClientIp(req);

    // skip localhost tracking
    const skipIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    let existingVisitor = db.prepare('SELECT id FROM visitors WHERE session_id = ?').get(sessionId);

    if (!existingVisitor) {
      let country = 'Unknown', countryCode = '', city = 'Unknown', region = '', lat = 0, lon = 0;

      if (!skipIps.includes(ip)) {
        const geo = geoip.lookup(ip);
        if (geo) {
          country = geo.country === 'IN' ? 'India' : (geo.country || 'Unknown');
          countryCode = geo.country || '';
          city = geo.city || 'Unknown';
          region = geo.region || '';
          lat = geo.ll ? geo.ll[0] : 0;
          lon = geo.ll ? geo.ll[1] : 0;
        }
      } else {
        country = 'India (Local)';
        countryCode = 'IN';
        city = 'Localhost';
      }

      const result = db.prepare(`
        INSERT INTO visitors (session_id, ip_address, country, country_code, city, region, latitude, longitude, device_type, browser, os, user_agent, referrer, first_page)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, ip, country, countryCode, city, region, lat, lon, device, browser, os, ua.slice(0, 300), referrer || '', page);

      existingVisitor = { id: result.lastInsertRowid };
    }

    if (duration && existingVisitor) {
      db.prepare(`
        UPDATE page_views SET duration = ? WHERE session_id = ? AND page = ? AND duration = 0 ORDER BY id DESC LIMIT 1
      `).run(parseInt(duration) || 0, sessionId, page);
    }

    db.prepare(`
      INSERT INTO page_views (visitor_id, session_id, page, page_title)
      VALUES (?, ?, ?, ?)
    `).run(existingVisitor.id, sessionId, page, pageTitle || page);

    res.json({ sessionId });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Tracking failed' });
  }
});

module.exports = router;
