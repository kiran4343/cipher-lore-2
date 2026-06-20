(() => {
  'use strict';
  const KEY = 'ips_session_id';
  let sessionId = sessionStorage.getItem(KEY);
  if (!sessionId) {
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    sessionStorage.setItem(KEY, sessionId);
  }

  let pageStart = Date.now();

  async function track(duration) {
    try {
      const r = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: window.location.pathname,
          pageTitle: document.title,
          sessionId,
          referrer: document.referrer,
          duration: duration || 0,
        }),
      });
      return r.ok ? r.json() : null;
    } catch { return null; }
  }

  async function sendGps(sid) {
    if (!navigator.geolocation) return;
    if (sessionStorage.getItem('ips_geo_sent')) return;
    sessionStorage.setItem('ips_geo_sent', '1');
    navigator.geolocation.getCurrentPosition(
      pos => {
        fetch('/api/track/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        }).catch(() => {});
      },
      () => { /* denied — silently ignore */ },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  async function trackAndGeo() {
    const res = await track(0);
    if (res && res.sessionId) sendGps(res.sessionId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackAndGeo);
  } else {
    trackAndGeo();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const duration = Math.round((Date.now() - pageStart) / 1000);
      navigator.sendBeacon('/api/track', JSON.stringify({
        page: window.location.pathname,
        pageTitle: document.title,
        sessionId,
        referrer: document.referrer,
        duration,
      }));
    } else {
      pageStart = Date.now();
    }
  });
})();
