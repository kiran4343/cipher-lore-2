'use strict';

// ─── Core Admin Utilities ────────────────────────────────────

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    window.location.href = '/admin/login.html';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.errors?.map(e => e.msg).join(', ') || `HTTP ${res.status}`);
  }
  return res.json();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/admin/login.html';
}

async function initAdmin() {
  try {
    const data = await adminFetch('/api/auth/verify');
    const admin = data.admin;
    const nameEl = document.getElementById('admin-name');
    const emailEl = document.getElementById('admin-email');
    const avatarEl = document.getElementById('admin-avatar');
    if (nameEl) nameEl.textContent = admin.name;
    if (emailEl) emailEl.textContent = admin.email;
    if (avatarEl) avatarEl.textContent = admin.name[0].toUpperCase();
  } catch {}
}

function showAlert(containerId, message, type = 'success') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  if (type === 'success') setTimeout(() => { el.innerHTML = ''; }, 4000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function confirm2(message) {
  return window.confirm(message);
}

// ─── Upload helper ───────────────────────────────────────────
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.url;
}

// ─── Modal helpers ────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => { m.classList.remove('open'); document.body.style.overflow = ''; });
  }
});

// ─── Chart helpers ────────────────────────────────────────────
function chartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#141428', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: 'rgba(124,58,237,0.3)', borderWidth: 1 } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 11 } }, beginAtZero: true },
    }
  };
}

function doughnutDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { size: 11 } } }, tooltip: { backgroundColor: '#141428', titleColor: '#e2e8f0', bodyColor: '#94a3b8' } },
    cutout: '65%',
  };
}

// Expose globally
window.adminFetch = adminFetch;
window.logout = logout;
window.initAdmin = initAdmin;
window.showAlert = showAlert;
window.formatDate = formatDate;
window.uploadImage = uploadImage;
window.openModal = openModal;
window.closeModal = closeModal;
window.chartDefaults = chartDefaults;
window.doughnutDefaults = doughnutDefaults;
