/**
 * api.js
 * -----------------------------------------------------------------------
 * Light of Life Christian Academy (LOLCA) - Central Database API Client
 * Communicates strictly with the backend database server (Node.js API / Google Apps Script).
 * NO frontend localStorage database caching. All updates, deletes, grades, payrolls,
 * and records depend 100% on the central authoritative database.
 * -----------------------------------------------------------------------
 */

const API = (function () {
  let activeRequests = 0;

  function getBackendUrl() {
    const configUrl = String((window.APP_CONFIG && window.APP_CONFIG.backendUrl) || '').trim();
    if (configUrl) return configUrl;

    // If running on GitHub Pages and no backendUrl is configured
    if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('github.io')) {
      return '';
    }

    // If running in local browser over HTTP/HTTPS, use relative API endpoint
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      if (window.location.protocol.startsWith('http')) {
        return `${window.location.origin}/api`;
      }
    }
    // Default local database server endpoint
    return 'http://localhost:3000/api';
  }

  function showLoader(msg = 'Communicating with School Database...') {
    activeRequests++;
    const loader = document.getElementById('globalLoader');
    if (loader) {
      const txt = loader.querySelector('.loader-text');
      if (txt) txt.textContent = msg;
      loader.classList.remove('hidden');
    }
  }

  function hideLoader() {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      const loader = document.getElementById('globalLoader');
      if (loader) loader.classList.add('hidden');
    }
  }

  function toast(message, isError = false) {
    let toastEl = document.getElementById('globalToast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'globalToast';
      toastEl.className = 'global-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.backgroundColor = isError ? 'var(--color-danger, #ef4444)' : 'var(--color-primary, #1e3a8a)';
    toastEl.classList.remove('hidden', 'fade-out');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.add('fade-out');
      setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 3500);
  }

  function getSessionToken() {
    return sessionStorage.getItem('lolca_session_token') || localStorage.getItem('lolca_session_token') || '';
  }

  function setSessionToken(token, persist = false) {
    if (persist) {
      localStorage.setItem('lolca_session_token', token);
    } else {
      sessionStorage.setItem('lolca_session_token', token);
    }
  }

  function getCurrentUser() {
    const raw = sessionStorage.getItem('lolca_user') || localStorage.getItem('lolca_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setCurrentUser(user, persist = false) {
    const serialized = JSON.stringify(user);
    if (persist) {
      localStorage.setItem('lolca_user', serialized);
    } else {
      sessionStorage.setItem('lolca_user', serialized);
    }
  }

  function clearSession() {
    sessionStorage.removeItem('lolca_session_token');
    sessionStorage.removeItem('lolca_user');
    localStorage.removeItem('lolca_session_token');
    localStorage.removeItem('lolca_user');
  }

  /**
   * Unified Dispatch Request directly to Server Database
   */
  async function request(action, payload = {}, method = 'POST') {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      toast('Please set your Google Apps Script Web App URL in assets/js/config.js (backendUrl) to connect to your Google Sheets database.', true);
      return {
        success: false,
        message: 'Google Apps Script Web App URL not set in assets/js/config.js.'
      };
    }

    showLoader();

    try {
      const token = getSessionToken();
      let response;

      if (method.toUpperCase() === 'GET') {
        const queryParams = new URLSearchParams(Object.assign({ action: action, sessionToken: token }, payload));
        const url = `${backendUrl}?${queryParams.toString()}`;
        response = await fetch(url, {
          method: 'GET'
        });
      } else {
        const bodyData = Object.assign({ action: action, sessionToken: token }, payload);
        const isAppsScript = backendUrl.includes('script.google.com');

        // text/plain prevents CORS preflight (OPTIONS check) for Google Apps Script Web Apps
        const contentType = isAppsScript ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8';

        response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': contentType
          },
          body: JSON.stringify(bodyData)
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      hideLoader();
      return json;
    } catch (err) {
      hideLoader();
      console.error(`Database request failed for '${action}':`, err);

      // Helpful troubleshooting guidance
      const isConnectionRefused = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));
      if (isConnectionRefused) {
        if (backendUrl.includes('script.google.com')) {
          toast('Could not connect to Google Apps Script. Please verify Web App deployment access is set to "Anyone".', true);
        } else {
          toast('Database Server offline! Please run "npm start" or double-click "start.bat" to start the LOLCA database.', true);
        }
        return {
          success: false,
          message: 'Could not connect to the LOLCA database server at ' + backendUrl
        };
      }

      toast(err.message || 'Database error occurred', true);
      return { success: false, message: err.message || 'Database communication error.' };
    }
  }

  return {
    getBackendUrl,
    request,
    showLoader,
    hideLoader,
    toast,
    toastSuccess: msg => toast(msg || 'Success', false),
    toastError: msg => toast(msg || 'Error occurred', true),
    getSessionToken,
    setSessionToken,
    getCurrentUser,
    setCurrentUser,
    clearSession
  };
})();

if (typeof window !== 'undefined') {
  window.API = API;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
