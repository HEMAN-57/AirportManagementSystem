// Airport Management System (AMS) Frontend API & Utilities
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5001'
  ? 'http://localhost:5001/api'
  : '/api';

function getToken() {
  return localStorage.getItem('ams_token');
}

function getUser() {
  const user = localStorage.getItem('ams_user');
  return user ? JSON.parse(user) : null;
}

function logout() {
  localStorage.removeItem('ams_token');
  localStorage.removeItem('ams_user');
  window.location.href = 'login.html';
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_URL}${endpoint}`, config);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Network error occurred');
    }

    return data;
  } catch (err) {
    throw err;
  }
}

function showError(msg, elId = 'error-msg') {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = msg;
    el.style.display = 'flex';
  } else {
    alert(msg);
  }
}

function clearError(elId = 'error-msg') {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function showSuccess(msg, elId = 'success-msg') {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = msg;
    el.style.display = 'flex';
  }
}

function clearSuccess(elId = 'success-msg') {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

// Redirect logic matching SplitExpense pattern
function checkAuth() {
  const path = window.location.pathname;
  const isAuthPage = path.endsWith('login.html') || path.endsWith('register.html');
  const isIndexPage = path.endsWith('index.html') || path.endsWith('/') || path === '';

  const token = getToken();

  if (!token && !isAuthPage) {
    window.location.href = 'login.html';
  } else if (token && (isAuthPage || isIndexPage)) {
    window.location.href = 'dashboard.html';
  }
}

// Formatters
function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? timestamp : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}
