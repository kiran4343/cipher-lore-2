'use strict';

// ─── Navbar scroll effect ───────────────────────────────────
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });
}

// ─── Mobile menu ────────────────────────────────────────────
const navToggle = document.querySelector('.nav-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
if (navToggle && mobileMenu) {
  navToggle.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
    navToggle.textContent = mobileMenu.classList.contains('open') ? '✕' : '☰';
  });
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => { mobileMenu.classList.remove('open'); navToggle.textContent = '☰'; });
  });
}

// ─── Active nav link ────────────────────────────────────────
const currentPath = window.location.pathname;
document.querySelectorAll('.nav-links a').forEach(a => {
  const href = a.getAttribute('href');
  if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
    a.classList.add('active');
  }
});

// ─── Scroll animations ──────────────────────────────────────
const fadeEls = document.querySelectorAll('.fade-in');
if (fadeEls.length && 'IntersectionObserver' in window) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  fadeEls.forEach(el => obs.observe(el));
}

// ─── Filter tabs ────────────────────────────────────────────
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const container = tab.closest('[data-filter-container]') || document;
    container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const filter = tab.dataset.filter;
    const items = (container === document ? document : container).querySelectorAll('[data-category]');
    items.forEach(item => {
      const match = !filter || filter === 'all' || item.dataset.category === filter;
      item.style.display = match ? '' : 'none';
    });
  });
});

// ─── Lightbox ───────────────────────────────────────────────
const lightbox = document.querySelector('.lightbox');
if (lightbox) {
  const lbImg = lightbox.querySelector('img');
  const lbCaption = lightbox.querySelector('.lightbox-caption');

  document.querySelectorAll('[data-lightbox]').forEach(el => {
    el.addEventListener('click', () => {
      lbImg.src = el.dataset.src || el.querySelector('img')?.src || '';
      if (lbCaption) lbCaption.textContent = el.dataset.caption || '';
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  lightbox.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ─── Contact form ────────────────────────────────────────────
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = contactForm.querySelector('button[type=submit]');
    const msg = document.querySelector('#form-message');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const data = Object.fromEntries(new FormData(contactForm));
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const json = await res.json();
      msg.className = res.ok ? 'alert alert-success' : 'alert alert-error';
      msg.textContent = json.message || json.error || 'An error occurred';
      if (res.ok) contactForm.reset();
    } catch { msg.className = 'alert alert-error'; msg.textContent = 'Network error. Please try again.'; }
    btn.disabled = false; btn.textContent = 'Send Message';
  });
}

// ─── Load site settings ──────────────────────────────────────
async function loadSiteSettings() {
  try {
    const res = await fetch('/api/settings/public');
    const settings = await res.json();
    document.querySelectorAll('[data-setting]').forEach(el => {
      const key = el.dataset.setting;
      if (settings[key]) el.textContent = settings[key];
    });
    document.querySelectorAll('[data-setting-href]').forEach(el => {
      const key = el.dataset.settingHref;
      if (settings[key]) el.href = settings[key];
    });
  } catch {}
}
loadSiteSettings();

// ─── API helpers ─────────────────────────────────────────────
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Render helpers ──────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function safeJson(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }
function truncate(str, n) { return str?.length > n ? str.slice(0, n) + '...' : str; }

// Expose globally
window.PCL = { apiFetch, formatDate, formatDateShort, safeJson, truncate };

// ─── Load investigations on investigations page ───────────────
if (document.querySelector('#investigations-grid')) {
  loadInvestigations();
}

async function loadInvestigations() {
  const grid = document.querySelector('#investigations-grid');
  try {
    const data = await apiFetch('/api/investigations');
    if (!data.investigations.length) { grid.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1">No investigations found.</p>'; return; }
    grid.innerHTML = data.investigations.map(inv => {
      const imgs = safeJson(inv.images, []);
      const img = imgs[0] || '/images/inv-default.jpg';
      return `<div class="card inv-card fade-in" data-category="${inv.state || 'All'}" onclick="window.location='/investigations/${inv.slug}'">
        <img src="${img}" alt="${inv.title}" loading="lazy" onerror="this.src='/images/inv-default.jpg'">
        <div class="inv-card-content">
          <div class="inv-status status-${inv.status}">● ${inv.status}</div>
          <div class="inv-location">${inv.location}${inv.state ? ', ' + inv.state : ''}</div>
          <h3 class="card-title">${inv.title}</h3>
          <p class="card-text" style="font-size:0.85rem;margin-top:8px">${truncate(inv.description, 120)}</p>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch { grid.innerHTML = '<p style="color:var(--muted);text-align:center">Failed to load investigations.</p>'; }
}

// ─── Load blog posts on blog page ────────────────────────────
if (document.querySelector('#blog-grid')) {
  loadBlogPosts();
}

async function loadBlogPosts(page = 1, category = '') {
  const grid = document.querySelector('#blog-grid');
  const pagination = document.querySelector('#blog-pagination');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const params = new URLSearchParams({ page, limit: 9 });
    if (category) params.set('category', category);
    const data = await apiFetch('/api/posts?' + params);
    if (!data.posts.length) { grid.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1">No posts found.</p>'; return; }
    grid.innerHTML = data.posts.map(post => `
      <div class="card blog-card fade-in">
        <img class="card-img" src="${post.featured_image}" alt="${post.title}" loading="lazy" onerror="this.src='/images/blog-default.jpg'">
        <div class="card-body">
          <div class="blog-meta"><span class="blog-category">${post.category}</span><span>${formatDateShort(post.published_at)}</span></div>
          <h3 class="card-title">${post.title}</h3>
          <p class="card-text">${truncate(post.excerpt, 150)}</p>
        </div>
        <div class="card-footer">
          <span style="color:var(--muted);font-size:0.8rem">👁 ${post.views} views</span>
          <a href="/blog/${post.slug}" class="btn btn-outline btn-sm">Read More</a>
        </div>
      </div>`).join('');
    if (pagination && data.pages > 1) {
      pagination.innerHTML = Array.from({ length: data.pages }, (_, i) => `<button class="page-btn${i + 1 === page ? ' active' : ''}" onclick="loadBlogPosts(${i + 1},'${category}')">${i + 1}</button>`).join('');
    }
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch { grid.innerHTML = '<p style="color:var(--muted);text-align:center">Failed to load posts.</p>'; }
}

// ─── Load single blog post ────────────────────────────────────
if (document.querySelector('#post-content')) {
  loadPost();
}

async function loadPost() {
  const slug = window.location.pathname.split('/').pop();
  const container = document.querySelector('#post-content');
  try {
    const data = await apiFetch('/api/posts/' + slug);
    const p = data.post;
    document.title = p.title + ' — IPS';
    document.querySelector('#post-title').textContent = p.title;
    document.querySelector('#post-meta').innerHTML = `<span class="badge badge-purple">${p.category}</span> <span style="color:var(--muted);font-size:0.85rem">${formatDate(p.published_at)}</span>`;
    document.querySelector('#post-featured-img').src = p.featured_image;
    document.querySelector('#post-featured-img').alt = p.title;
    container.innerHTML = p.content;
    if (data.related?.length) {
      document.querySelector('#related-posts').innerHTML = data.related.map(r => `
        <a href="/blog/${r.slug}" class="card" style="text-decoration:none">
          <img class="card-img" src="${r.featured_image}" alt="${r.title}" style="height:160px;object-fit:cover" onerror="this.src='/images/blog-default.jpg'">
          <div class="card-body"><h4 class="card-title" style="font-size:0.95rem">${r.title}</h4></div>
        </a>`).join('');
    }
  } catch { container.innerHTML = '<p style="color:var(--muted)">Post not found.</p>'; }
}

// ─── Load gallery ────────────────────────────────────────────
if (document.querySelector('#gallery-grid')) {
  loadGallery();
}

async function loadGallery() {
  const grid = document.querySelector('#gallery-grid');
  try {
    const data = await apiFetch('/api/gallery');
    if (data.categories?.length) {
      const tabs = document.querySelector('#gallery-filters');
      if (tabs) tabs.innerHTML = `<button class="filter-tab active" data-filter="all">All</button>` + data.categories.map(c => `<button class="filter-tab" data-filter="${c}">${c}</button>`).join('');
    }
    grid.innerHTML = data.items.map(item => `
      <div class="gallery-item" data-category="${item.category}" data-lightbox data-src="${item.image_url}" data-caption="${item.title || ''}" loading="lazy">
        <img src="${item.image_url}" alt="${item.title || ''}" loading="lazy" onerror="this.src='/images/gallery-default.jpg'">
        <div class="gallery-overlay"><span class="gallery-overlay-icon">🔍</span></div>
      </div>`).join('');
    // Re-init lightbox for new elements
    document.querySelectorAll('[data-lightbox]').forEach(el => {
      el.addEventListener('click', () => {
        const lb = document.querySelector('.lightbox');
        if (lb) { lb.querySelector('img').src = el.dataset.src; lb.querySelector('.lightbox-caption').textContent = el.dataset.caption || ''; lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
      });
    });
    // Re-init filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        document.querySelectorAll('.gallery-item').forEach(item => { item.style.display = (!filter || filter === 'all' || item.dataset.category === filter) ? '' : 'none'; });
      });
    });
  } catch { grid.innerHTML = '<p style="color:var(--muted);text-align:center">Failed to load gallery.</p>'; }
}

// ─── Load team ───────────────────────────────────────────────
if (document.querySelector('#team-grid')) {
  loadTeam();
}

async function loadTeam() {
  const grid = document.querySelector('#team-grid');
  try {
    const data = await apiFetch('/api/team');
    grid.innerHTML = data.members.map(m => {
      const specs = safeJson(m.specializations, []);
      const social = safeJson(m.social_links, {});
      return `<div class="card team-card fade-in" style="padding:32px">
        <img class="team-img" src="${m.image_url}" alt="${m.name}" onerror="this.src='/images/team-default.jpg'">
        <h3 class="team-name">${m.name}</h3>
        <p class="team-role">${m.role}</p>
        <p class="team-bio">${m.bio}</p>
        ${specs.length ? `<div class="team-specs">${specs.map(s => `<span class="spec-tag">${s}</span>`).join('')}</div>` : ''}
        ${Object.keys(social).length ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px">${Object.entries(social).map(([k, v]) => v ? `<a href="${v}" class="social-link" target="_blank" rel="noopener">${{twitter:'𝕏',instagram:'📷',linkedin:'🔗',facebook:'📘',youtube:'▶'}[k] || '🔗'}</a>` : '').join('')}</div>` : ''}
      </div>`;
    }).join('');
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch { grid.innerHTML = '<p style="color:var(--muted)">Failed to load team.</p>'; }
}

// ─── Load events ─────────────────────────────────────────────
if (document.querySelector('#events-list')) {
  loadEvents();
}

async function loadEvents() {
  const list = document.querySelector('#events-list');
  try {
    const data = await apiFetch('/api/events');
    if (!data.events.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center">No upcoming events.</p>'; return; }
    list.innerHTML = data.events.map(ev => {
      const d = ev.event_date ? new Date(ev.event_date) : null;
      const day = d ? d.getDate() : '';
      const month = d ? d.toLocaleString('en-IN', { month: 'short' }) : '';
      return `<div class="card" style="padding:24px;margin-bottom:16px">
        <div class="event-card">
          ${d ? `<div class="event-date-badge"><div class="event-date-day">${day}</div><div class="event-date-month">${month}</div></div>` : ''}
          <div class="event-info">
            <h3>${ev.title}</h3>
            <div class="event-meta">
              ${ev.event_time ? `<span>⏰ ${ev.event_time}</span>` : ''}
              ${ev.location ? `<span>📍 ${ev.location}</span>` : ''}
              ${ev.max_participants ? `<span>👥 ${ev.max_participants} spots</span>` : ''}
            </div>
            <p style="color:var(--muted);margin-top:12px;font-size:0.9rem">${ev.description || ''}</p>
            ${ev.registration_link && ev.registration_link !== '#' ? `<a href="${ev.registration_link}" class="btn btn-primary btn-sm" style="margin-top:16px" target="_blank">Register Now</a>` : '<span class="btn btn-outline btn-sm" style="margin-top:16px;cursor:default">Coming Soon</span>'}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch { list.innerHTML = '<p style="color:var(--muted)">Failed to load events.</p>'; }
}

// ─── Home page sections ──────────────────────────────────────
if (document.querySelector('#home-investigations')) {
  loadHomeInvestigations();
}

async function loadHomeInvestigations() {
  const grid = document.querySelector('#home-investigations');
  try {
    const data = await apiFetch('/api/investigations');
    const inv = data.investigations.slice(0, 3);
    grid.innerHTML = inv.map(inv => {
      const imgs = safeJson(inv.images, []);
      return `<div class="card inv-card fade-in" onclick="window.location='/investigations/${inv.slug}'" style="cursor:pointer">
        <img src="${imgs[0] || '/images/inv-default.jpg'}" alt="${inv.title}" loading="lazy" onerror="this.src='/images/inv-default.jpg'" style="height:280px;object-fit:cover;width:100%">
        <div class="inv-card-content">
          <div class="inv-status status-${inv.status}">● ${inv.status}</div>
          <div class="inv-location">${inv.location}${inv.state ? ', ' + inv.state : ''}</div>
          <h3 class="card-title">${inv.title}</h3>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch {}
}

if (document.querySelector('#home-posts')) {
  loadHomePosts();
}

async function loadHomePosts() {
  const grid = document.querySelector('#home-posts');
  try {
    const data = await apiFetch('/api/posts?limit=3');
    grid.innerHTML = data.posts.map(post => `
      <div class="card blog-card fade-in">
        <img class="card-img" src="${post.featured_image}" alt="${post.title}" loading="lazy" onerror="this.src='/images/blog-default.jpg'" style="height:200px;object-fit:cover">
        <div class="card-body">
          <div class="blog-meta"><span class="blog-category">${post.category}</span><span>${formatDateShort(post.published_at)}</span></div>
          <h3 class="card-title" style="font-size:1rem">${post.title}</h3>
          <p class="card-text">${truncate(post.excerpt, 130)}</p>
        </div>
        <div class="card-footer">
          <a href="/blog/${post.slug}" class="btn btn-outline btn-sm">Read More</a>
        </div>
      </div>`).join('');
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch {}
}

if (document.querySelector('#home-team')) {
  loadHomeTeam();
}

async function loadHomeTeam() {
  const grid = document.querySelector('#home-team');
  try {
    const data = await apiFetch('/api/team');
    grid.innerHTML = data.members.slice(0, 4).map(m => `
      <div class="card team-card fade-in" style="padding:28px;text-align:center">
        <img class="team-img" src="${m.image_url}" alt="${m.name}" onerror="this.src='/images/team-default.jpg'">
        <h3 class="team-name">${m.name}</h3>
        <p class="team-role">${m.role}</p>
      </div>`).join('');
    document.querySelectorAll('.fade-in').forEach(el => setTimeout(() => el.classList.add('visible'), 100));
  } catch {}
}

if (document.querySelector('#home-events')) {
  loadHomeEvents();
}

async function loadHomeEvents() {
  const container = document.querySelector('#home-events');
  try {
    const data = await apiFetch('/api/events?upcoming=true');
    const events = data.events.slice(0, 3);
    if (!events.length) { container.innerHTML = '<p style="color:var(--muted)">No upcoming events.</p>'; return; }
    container.innerHTML = events.map(ev => {
      const d = ev.event_date ? new Date(ev.event_date) : null;
      return `<div class="card" style="padding:20px;margin-bottom:12px">
        <div class="event-card">
          ${d ? `<div class="event-date-badge"><div class="event-date-day">${d.getDate()}</div><div class="event-date-month">${d.toLocaleString('en-IN',{month:'short'})}</div></div>` : ''}
          <div class="event-info">
            <h3 style="font-size:0.95rem">${ev.title}</h3>
            <div class="event-meta">${ev.location ? `<span>📍 ${ev.location}</span>` : ''}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}
