const DEFAULT_SERVER = 'http://213.59.112.27:5000';
const DEFAULT_EMAIL = 'demo@jobtracker.dev';
const DEFAULT_PASSWORD = 'demo1234';

const setup = document.querySelector('#setup');
const track = document.querySelector('#track');
const apiUrlInput = document.querySelector('#api-url');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const saveButton = document.querySelector('#save');
const setupStatus = document.querySelector('#setup-status');
const pageUrl = document.querySelector('#page-url');
const pageTitle = document.querySelector('#page-title');
const pageHost = document.querySelector('#page-host');
const companyName = document.querySelector('#company-name');
const trackButton = document.querySelector('#track-btn');
const status = document.querySelector('#status');
const changeToken = document.querySelector('#change-token');
const connection = document.querySelector('#connection');

let currentTab = null;
let watchedTabId = null;
let suggestedName = '';

function showStatus(node, message, isError) {
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function nameFromHost(host) {
  const label = host.split('.')[0] || 'Company';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizeServerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_SERVER;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '').replace(/\/api$/i, '');
  }
}

function apiRoot(serverUrl) {
  return `${normalizeServerUrl(serverUrl)}/api`;
}

function showSetup(settings) {
  setup.hidden = false;
  track.hidden = true;
  apiUrlInput.value = settings.apiUrl || DEFAULT_SERVER;
  emailInput.value = settings.email || DEFAULT_EMAIL;
  passwordInput.value = settings.password || DEFAULT_PASSWORD;
}

function applyTab(tab) {
  currentTab = tab || null;
  watchedTabId = tab?.id ?? watchedTabId;
  const url = tab?.url || '';
  const host = hostnameOf(url);
  pageUrl.textContent = url || 'No page URL yet.';
  pageTitle.textContent = tab?.title || 'This page';
  pageHost.textContent = host || 'Open a company website, then try again.';
  const nextName = host ? nameFromHost(host) : '';
  if (!companyName.value || companyName.value === suggestedName) companyName.value = nextName;
  suggestedName = nextName;
  trackButton.disabled = !host;
}

function showTrack() {
  setup.hidden = true;
  track.hidden = false;
}

async function refreshConnection(settings) {
  connection.classList.remove('ok');
  connection.title = 'Not connected';
  if (!settings?.token || !settings?.apiUrl) return;
  try {
    const response = await fetch(`${apiRoot(settings.apiUrl)}/auth/me`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });
    if (!response.ok) return;
    connection.classList.add('ok');
    connection.title = 'Connected';
  } catch {
    connection.classList.remove('ok');
    connection.title = 'Not connected';
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get({
    apiUrl: DEFAULT_SERVER,
    token: '',
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
  });
  return {
    apiUrl: normalizeServerUrl(stored.apiUrl || DEFAULT_SERVER),
    token: stored.token || '',
    email: stored.email || DEFAULT_EMAIL,
    password: stored.password || DEFAULT_PASSWORD,
  };
}

async function currentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

saveButton.addEventListener('click', async () => {
  const apiUrl = normalizeServerUrl(apiUrlInput.value);
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!apiUrl || !email || !password) {
    showStatus(setupStatus, 'URL, email, and password are required.', true);
    return;
  }

  saveButton.disabled = true;
  showStatus(setupStatus, 'Signing in…', false);
  try {
    apiUrlInput.value = apiUrl;
    const response = await fetch(`${apiRoot(apiUrl)}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Could not sign in');
    }
    await chrome.storage.local.set({ apiUrl, email, password, token: payload.token });
    showStatus(setupStatus, '', false);
    const settings = await loadSettings();
    showTrack();
    applyTab(await currentPage());
    await refreshConnection(settings);
  } catch (error) {
    showStatus(setupStatus, error instanceof Error ? error.message : 'Could not reach Job Tracker.', true);
  } finally {
    saveButton.disabled = false;
  }
});

changeToken.addEventListener('click', async () => {
  showSetup(await loadSettings());
});

function collectRoles() {
  const roles = [];
  const seen = new Set();
  const add = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (text.length < 4 || text.length > 140 || seen.has(key)) return;
    if (/^(home|about|careers|jobs|blog|login|sign in|contact|privacy|menu|search)$/i.test(text)) return;
    seen.add(key);
    roles.push(text);
  };
  const walk = (data) => {
    if (!data || roles.length >= 200) return;
    if (Array.isArray(data)) {
      data.forEach(walk);
      return;
    }
    if (typeof data !== 'object') return;
    const type = data['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('JobPosting')) add(data.title);
    if (data['@graph']) walk(data['@graph']);
    if (data.itemListElement) walk(data.itemListElement);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      walk(JSON.parse(node.textContent || ''));
    } catch {
      // Ignore invalid job markup.
    }
  });
  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (/job|career|opening|position|apply|role/i.test(href)) add(link.innerText);
  });
  return roles.slice(0, 200);
}

trackButton.addEventListener('click', async () => {
  const settings = await loadSettings();
  const name = companyName.value.trim();
  if (!name || !currentTab?.url) return;

  trackButton.disabled = true;
  showStatus(status, 'Reading open roles…', false);
  let roles = [];
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: collectRoles,
    });
    roles = Array.isArray(result?.result) ? result.result : [];
  } catch {
    roles = [];
  }

  showStatus(status, 'Saving…', false);
  try {
    const response = await fetch(`${apiRoot(settings.apiUrl)}/company-tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.token}`,
      },
      body: JSON.stringify({
        name,
        url: currentTab.url,
        pageTitle: currentTab.title || '',
        roles,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error || 'Could not track that company';
      if (response.status === 401) {
        showStatus(status, 'Sign in again.', true);
        connection.classList.remove('ok');
        connection.title = 'Not connected';
        showSetup(settings);
        return;
      }
      throw new Error(message);
    }
    const opened = payload.track.addedRoles || [];
    const closed = payload.track.removedRoles || [];
    if (opened.length || closed.length) {
      const parts = [];
      if (opened.length) parts.push(`New roles: ${opened.join(', ')}`);
      if (closed.length) parts.push(`No longer listed: ${closed.join(', ')}`);
      showStatus(status, parts.join(' '), false);
    } else {
      showStatus(status, `Tracked ${payload.track.name}. No role changes.`, false);
    }
  } catch (error) {
    showStatus(status, error instanceof Error ? error.message : 'Could not reach Job Tracker.', true);
  } finally {
    trackButton.disabled = false;
  }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== watchedTabId) return;
  if (!(info.url || info.title || info.status === 'complete')) return;
  applyTab(tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  applyTab(await chrome.tabs.get(tabId));
});

loadSettings().then(async (settings) => {
  applyTab(await currentPage());
  await refreshConnection(settings);
  if (!settings.token) {
    showSetup(settings);
    return;
  }
  showTrack();
});
