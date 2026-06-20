const express = require('express');
const geoip = require('geoip-lite');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { get, run } = require('../database/database');
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
  if (ua.includes('Mobile') || (ua.includes('Android') && ua.includes('mobi'))) device = 'mobile';
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'tablet';

  return { browser, os, device };
}

// POST /api/track
router.post('/', trackLimiter, async (req, res) => {
  try {
    const { page, pageTitle, sessionId: clientSessionId, referrer, duration } = req.body;
    if (!page) return res.status(400).json({ error: 'page required' });

    const sessionId = clientSessionId || uuidv4();
    const ua = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUserAgent(ua);
    const ip = req.ip || '127.0.0.1';

    const skipIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    let existingVisitor = await get('SELECT id FROM visitors WHERE session_id = ?', [sessionId]);

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
        country = 'India (Local)'; countryCode = 'IN'; city = 'Localhost';
      }

      const result = await run(
        'INSERT INTO visitors (session_id, ip_address, country, country_code, city, region, latitude, longitude, device_type, browser, os, user_agent, referrer, first_page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [sessionId, ip, country, countryCode, city, region, lat, lon, device, browser, os, ua.slice(0, 300), referrer || '', page]
      );
      existingVisitor = { id: result.lastInsertRowid };
    }

    if (duration && existingVisitor) {
      await run(
        'UPDATE page_views SET duration = ? WHERE id = (SELECT id FROM page_views WHERE session_id = ? AND page = ? AND duration = 0 ORDER BY id DESC LIMIT 1)',
        [parseInt(duration) || 0, sessionId, page]
      );
    }

    await run(
      'INSERT INTO page_views (visitor_id, session_id, page, page_title) VALUES (?,?,?,?)',
      [existingVisitor.id, sessionId, page, pageTitle || page]
    );

    res.json({ sessionId });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Tracking failed' });
  }
});

// POST /api/track/location  — receives precise GPS coords from the browser
router.post('/location', trackLimiter, async (req, res) => {
  try {
    const { sessionId, lat, lon, accuracy } = req.body;
    if (!sessionId || lat == null || lon == null) return res.status(400).json({ error: 'sessionId, lat, lon required' });

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return res.status(400).json({ error: 'invalid coords' });
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'coords out of range' });

    await run(
      'UPDATE visitors SET latitude = ?, longitude = ?, gps_precise = 1 WHERE session_id = ?',
      [latitude, longitude, sessionId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
