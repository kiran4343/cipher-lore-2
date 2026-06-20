const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { get, run } = require('../database/database');
const { trackLimiter } = require('../middleware/security');

// Simple in-memory cache so we don't hammer ip-api.com for the same IP
const geoCache = new Map();
const GEO_TTL = 5 * 60 * 1000; // 5 minutes

async function lookupIp(ip) {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_TTL) return cached.data;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp`,
      { signal: AbortSignal.timeout(4000) }
    );
    const geo = await res.json();
    if (geo.status !== 'success') return null;
    const data = {
      country: geo.country || 'Unknown',
      countryCode: geo.countryCode || '',
      city: geo.city || 'Unknown',
      region: geo.regionName || '',
      lat: geo.lat || 0,
      lon: geo.lon || 0,
      timezone: geo.timezone || '',
      isp: geo.isp || '',
    };
    geoCache.set(ip, { ts: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

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
    const xff = req.headers['x-forwarded-for'];
    const ip = xff ? xff.split(',')[0].trim() : (req.ip || '127.0.0.1');

    const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    let existingVisitor = await get('SELECT id FROM visitors WHERE session_id = ?', [sessionId]);

    if (!existingVisitor) {
      let country = 'Unknown', countryCode = '', city = 'Unknown', region = '', lat = 0, lon = 0, isp = '', timezone = '';

      if (!localIps.includes(ip)) {
        const geo = await lookupIp(ip);
        if (geo) {
          ({ country, countryCode, city, region, lat, lon, isp, timezone } = geo);
        }
      } else {
        country = 'India (Local)'; countryCode = 'IN'; city = 'Localhost'; isp = 'Local'; timezone = 'Asia/Kolkata';
      }

      const result = await run(
        'INSERT INTO visitors (session_id, ip_address, country, country_code, city, region, latitude, longitude, isp, timezone, device_type, browser, os, user_agent, referrer, first_page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [sessionId, ip, country, countryCode, city, region, lat, lon, isp, timezone, device, browser, os, ua.slice(0, 300), referrer || '', page]
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

// POST /api/track/location — precise GPS from browser; logs a trail point on every page
router.post('/location', trackLimiter, async (req, res) => {
  try {
    const { sessionId, lat, lon, accuracy, page } = req.body;
    if (!sessionId || lat == null || lon == null) return res.status(400).json({ error: 'sessionId, lat, lon required' });

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return res.status(400).json({ error: 'invalid coords' });
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'coords out of range' });

    await run(
      'UPDATE visitors SET latitude = ?, longitude = ?, gps_precise = 1 WHERE session_id = ?',
      [latitude, longitude, sessionId]
    );

    await run(
      'INSERT INTO location_trail (session_id, latitude, longitude, accuracy, page) VALUES (?,?,?,?,?)',
      [sessionId, latitude, longitude, parseFloat(accuracy) || 0, page || '/']
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
