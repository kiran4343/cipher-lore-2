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
      await fetch('/api/track', {
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
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => track(0));
  } else {
    track(0);
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
