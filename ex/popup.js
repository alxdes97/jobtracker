/* global readJobPosting */
const DEFAULT_SERVER = 'http://213.59.112.27:5000';
const DEFAULT_EMAIL = 'demo@jobtracker.dev';
const DEFAULT_PASSWORD = 'demo1234';

// Stored values the API expects, with the names the website shows for them.
const JOB_STATUSES = [
  ['Bookmarked', 'Applied'],
  ['Applying', 'Intro'],
  ['Applied', 'Submitted'],
  ['Interviewing', 'Interviewing'],
  ['Negotiating', 'Negotiating'],
  ['Offer Accepted', 'Offer Accepted'],
  ['Closed', 'Closed'],
];

const $ = (selector) => document.querySelector(selector);

const setup = $('#setup');
const main = $('#main');
const apiUrlInput = $('#api-url');
const emailInput = $('#email');
const passwordInput = $('#password');
const saveButton = $('#save');
const setupStatus = $('#setup-status');
const connection = $('#connection');
const changeToken = $('#change-token');

const tabJob = $('#tab-job');
const tabTrack = $('#tab-track');
const jobPanel = $('#job-panel');
const trackPanel = $('#track-panel');

const jobFields = {
  url: $('#job-url'),
  title: $('#job-title'),
  companyName: $('#job-company'),
  location: $('#job-location'),
  salaryMin: $('#job-salary-min'),
  salaryMax: $('#job-salary-max'),
  salaryCurrency: $('#job-currency'),
  deadline: $('#job-deadline'),
  description: $('#job-description'),
};
const profileSelect = $('#job-profile');
const statusSelect = $('#job-status');
const fillStatus = $('#fill-status');
const jobSave = $('#job-save');
const jobMessage = $('#job-status-text');

const trackState = $('#track-state');
const pageUrl = $('#page-url');
const pageTitle = $('#page-title');
const pageHost = $('#page-host');
const companyName = $('#company-name');
const trackButton = $('#track-btn');
const status = $('#status');

let currentTab = null;
let watchedTabId = null;
let suggestedName = '';
let resumes = [];
let lastFilledUrl = '';
let fillRun = 0;
// Set after the job is created, so a failed profile link can be retried
// without saving the same job twice.
let savedJob = null;

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

function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function sameUrl(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.href.replace(/\/$/, '') === right.href.replace(/\/$/, '');
  } catch {
    return false;
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

async function loadSettings() {
  const stored = await chrome.storage.local.get({
    apiUrl: DEFAULT_SERVER,
    token: '',
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    profile: '',
    jobStatus: 'Bookmarked',
  });
  return {
    apiUrl: normalizeServerUrl(stored.apiUrl || DEFAULT_SERVER),
    token: stored.token || '',
    email: stored.email || DEFAULT_EMAIL,
    password: stored.password || DEFAULT_PASSWORD,
    profile: stored.profile || '',
    jobStatus: stored.jobStatus || 'Bookmarked',
  };
}

class SignedOutError extends Error {}

async function apiRequest(path, options = {}) {
  const settings = await loadSettings();
  const response = await fetch(`${apiRoot(settings.apiUrl)}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${settings.token}`,
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new SignedOutError('Sign in again.');
  if (!response.ok) throw new Error(payload?.error || 'Request failed');
  return payload;
}

async function handleSignedOut(error, node) {
  if (!(error instanceof SignedOutError)) return false;
  showStatus(node, error.message, true);
  connection.classList.remove('ok');
  connection.title = 'Not connected';
  showSetup(await loadSettings());
  return true;
}

function showSetup(settings) {
  setup.hidden = false;
  main.hidden = true;
  apiUrlInput.value = settings.apiUrl || DEFAULT_SERVER;
  emailInput.value = settings.email || DEFAULT_EMAIL;
  passwordInput.value = settings.password || DEFAULT_PASSWORD;
}

function showMain() {
  setup.hidden = true;
  main.hidden = false;
}

function showPanel(name) {
  const job = name === 'job';
  tabJob.classList.toggle('active', job);
  tabTrack.classList.toggle('active', !job);
  jobPanel.hidden = !job;
  trackPanel.hidden = job;
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

async function currentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ---- Add job ---------------------------------------------------------------

function fillStatuses(selected) {
  statusSelect.innerHTML = '';
  for (const [value, label] of JOB_STATUSES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    statusSelect.append(option);
  }
  statusSelect.value = JOB_STATUSES.some(([value]) => value === selected) ? selected : 'Bookmarked';
}

async function loadProfiles(saved) {
  try {
    const payload = await apiRequest('/resumes');
    resumes = Array.isArray(payload?.resumes) ? payload.resumes : [];
  } catch (error) {
    if (await handleSignedOut(error, setupStatus)) return;
    resumes = [];
  }
  const names = [...new Set(resumes.map((resume) => String(resume.name || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  profileSelect.innerHTML = '<option value="">Select a profile</option>';
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    profileSelect.append(option);
  }
  profileSelect.value = names.includes(saved) ? saved : '';
}

/**
 * Puts a found value in a field. A re-read of the same posting keeps whatever
 * the user typed; a different posting replaces every field.
 */
function setField(input, value, replace) {
  const next = value === null || value === undefined ? '' : String(value);
  const untouched = input.value === '' || input.value === (input.dataset.auto ?? '');
  if (!replace && !untouched) return;
  if (replace || next || input.dataset.auto !== undefined) input.value = next;
  input.dataset.auto = next;
}

function applyPosting(posting, replace) {
  setField(jobFields.title, posting.title, replace);
  setField(jobFields.companyName, posting.companyName, replace);
  setField(jobFields.location, posting.location, replace);
  setField(jobFields.salaryMin, posting.salaryMin, replace);
  setField(jobFields.salaryMax, posting.salaryMax, replace);
  setField(jobFields.salaryCurrency, posting.salaryCurrency || 'USD', replace);
  setField(jobFields.deadline, posting.deadline, replace);
  setField(jobFields.description, posting.description, replace);
}

function describeFill(posting) {
  const found = [];
  if (posting.title) found.push('title');
  if (posting.companyName) found.push('company');
  if (posting.location) found.push('location');
  if (posting.salaryMin || posting.salaryMax) found.push('salary');
  if (posting.deadline) found.push('deadline');
  if (posting.description) found.push('description');
  if (!found.length) return 'Nothing found on that page. Fill the fields in yourself.';
  return `Filled ${found.join(', ')} from the posting. Check them before saving.`;
}

function hasEnough(posting) {
  return Boolean(posting?.title && posting?.companyName);
}

async function readTab(tabId, url) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: readJobPosting,
    args: [url, null],
  });
  return result?.result || null;
}

/** Job boards often render the posting after load, so give them a moment. */
async function readTabWithRetry(tabId, url) {
  let posting = await readTab(tabId, url);
  for (let attempt = 0; attempt < 3 && !hasEnough(posting); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    posting = await readTab(tabId, url);
  }
  return posting;
}

async function readFetched(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`The page answered ${response.status}`);
  const html = await response.text();
  return readJobPosting(response.url || url, html.slice(0, 3_000_000));
}

/** Opens the link in a background tab so pages built by JavaScript can be read. */
async function readInBackgroundTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await new Promise((resolve) => {
      const timer = setTimeout(done, 15000);
      function done() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
      function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') done();
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
    return await readTabWithRetry(tab.id, url);
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function fillFromUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!isWebPage(url)) {
    showStatus(fillStatus, url ? 'Enter a link that starts with http:// or https://' : '', Boolean(url));
    return;
  }
  const replace = Boolean(lastFilledUrl) && !sameUrl(url, lastFilledUrl);
  lastFilledUrl = url;
  resetSaved();
  const run = ++fillRun;
  showStatus(fillStatus, 'Reading the posting…', false);

  let posting = null;
  try {
    if (currentTab?.id && sameUrl(url, currentTab.url)) {
      posting = await readTabWithRetry(currentTab.id, currentTab.url);
    } else {
      try {
        posting = await readFetched(url);
      } catch {
        posting = null;
      }
      if (!hasEnough(posting) && run === fillRun) {
        showStatus(fillStatus, 'Opening the posting to read it…', false);
        const opened = await readInBackgroundTab(url);
        if (opened) posting = { ...posting, ...Object.fromEntries(Object.entries(opened).filter(([, v]) => v)) };
      }
    }
  } catch {
    posting = posting || null;
  }

  if (run !== fillRun) return;
  if (!posting) {
    showStatus(fillStatus, 'Could not read that page. Fill the fields in yourself.', true);
    return;
  }
  if (posting.url && posting.url !== url && sameUrl(jobFields.url.value, url)) {
    jobFields.url.value = posting.url;
    lastFilledUrl = posting.url;
  }
  applyPosting(posting, replace);
  showStatus(fillStatus, describeFill(posting), false);
  // The open tab's company is a better Track company default than its host name.
  if (posting.companyName && currentTab && sameUrl(url, currentTab.url) && companyName.value === suggestedName) {
    companyName.value = posting.companyName;
    suggestedName = posting.companyName;
    showTrackState();
  }
}

function resetSaved() {
  savedJob = null;
  jobSave.disabled = false;
  jobSave.textContent = 'Save Job';
}

jobFields.url.addEventListener('change', () => {
  const url = jobFields.url.value.trim();
  if (url && url !== lastFilledUrl) fillFromUrl(url);
});

jobFields.url.addEventListener('paste', () => {
  setTimeout(() => {
    const url = jobFields.url.value.trim();
    if (url && url !== lastFilledUrl) fillFromUrl(url);
  }, 0);
});

// Once a job is saved, any edit means the user is starting the next one.
jobPanel.addEventListener('input', () => {
  if (savedJob && !jobMessage.classList.contains('error')) {
    resetSaved();
    showStatus(jobMessage, '', false);
  }
});

jobPanel.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = jobFields.title.value.trim();
  const company = jobFields.companyName.value.trim();
  if (!title || !company) {
    showStatus(jobMessage, 'Job title and company name are required.', true);
    return;
  }

  const profile = profileSelect.value;
  const jobStatus = statusSelect.value;
  await chrome.storage.local.set({ profile, jobStatus });

  jobSave.disabled = true;
  showStatus(jobMessage, 'Saving…', false);
  try {
    if (!savedJob) {
      const min = jobFields.salaryMin.value;
      const max = jobFields.salaryMax.value;
      const payload = await apiRequest('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title,
          companyName: company,
          url: jobFields.url.value.trim(),
          location: jobFields.location.value.trim(),
          status: jobStatus,
          salaryMin: min ? Number(min) : null,
          salaryMax: max ? Number(max) : null,
          salaryCurrency: (jobFields.salaryCurrency.value.trim() || 'USD').toUpperCase(),
          deadline: jobFields.deadline.value || null,
          description: jobFields.description.value,
        }),
      });
      savedJob = payload.job;
    }

    const resume = profile ? resumes.find((item) => String(item.name || '').trim() === profile) : null;
    const alreadyLinked = (savedJob.resumes || []).some((item) => item.libraryResume === resume?._id);
    if (resume && !alreadyLinked) {
      const linked = await apiRequest(`/jobs/${savedJob._id}/resumes/link`, {
        method: 'POST',
        body: JSON.stringify({ resumeId: resume._id, isTailored: false }),
      });
      savedJob = linked.job;
    }

    const label = JOB_STATUSES.find(([value]) => value === jobStatus)?.[1] || jobStatus;
    showStatus(
      jobMessage,
      `Saved to ${label}${profile ? ` with ${profile}` : ''}.`,
      false,
    );
    jobSave.textContent = 'Saved';
  } catch (error) {
    if (await handleSignedOut(error, setupStatus)) return;
    const message = error instanceof Error ? error.message : 'Could not reach Job Tracker.';
    showStatus(
      jobMessage,
      savedJob ? `The job was saved, but the profile could not be added: ${message}` : message,
      true,
    );
    jobSave.disabled = false;
    jobSave.textContent = savedJob ? 'Add profile again' : 'Save Job';
  }
});

// ---- Track company -----------------------------------------------------------

// null until the list has loaded, so the badge can say "checking".
let tracks = null;
let tracksFailed = false;

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

/** Boards host many companies, so a shared domain must not count as one company. */
function isJobBoard(host) {
  return /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|greenhouse\.io|lever\.co|myworkdayjobs\.com|ashbyhq\.com|workable\.com|smartrecruiters\.com|bamboohr\.com|recruitee\.com|teamtailor\.com|jobvite\.com|applytojob\.com|breezy\.hr|ziprecruiter\.com|monster\.com|dice\.com|wellfound\.com|builtin\.com)$/i.test(
    host,
  );
}

function trackHost(track) {
  return hostnameOf(track.domain || track.website || track.url || '');
}

function hostsMatch(pageHost, storedHost) {
  if (!pageHost || !storedHost) return false;
  if (isJobBoard(pageHost) || isJobBoard(storedHost)) return false;
  return pageHost === storedHost || pageHost.endsWith(`.${storedHost}`) || storedHost.endsWith(`.${pageHost}`);
}

/**
 * A host-derived placeholder such as "Job-boards" is not the company.
 * Typed names and names read from the posting still count.
 */
function companyHint(host) {
  const name = companyName.value.trim();
  if (name.length < 2) return '';
  if (host && isJobBoard(host) && name.toLowerCase() === nameFromHost(host).toLowerCase()) return '';
  return name;
}

function matchTrack(url) {
  if (!Array.isArray(tracks)) return null;
  const host = hostnameOf(url);
  const canonical = canonicalUrl(url);
  const exact = tracks.find((track) => canonical && canonicalUrl(track.url) === canonical);
  if (exact) return { track: exact, samePage: true };

  const byDomain = tracks.find((track) => hostsMatch(host, trackHost(track)));
  if (byDomain) return { track: byDomain, samePage: false };

  const hint = companyHint(host).toLowerCase();
  if (!hint) return null;
  const byName = tracks.find((track) => String(track.name || '').trim().toLowerCase() === hint);
  return byName ? { track: byName, samePage: false } : null;
}

function trackedOn(track) {
  const value = track.lastTrackedAt || track.trackedAt;
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showTrackState() {
  const url = currentTab?.url || '';
  trackState.replaceChildren();
  trackState.className = 'badge';
  if (!isWebPage(url)) {
    trackState.hidden = true;
    trackButton.textContent = 'Track this company';
    return;
  }
  trackState.hidden = false;
  if (tracksFailed) {
    trackState.classList.add('missing');
    trackState.textContent = 'Could not check whether this company is tracked.';
    return;
  }
  if (!Array.isArray(tracks)) {
    trackState.textContent = 'Checking whether this company is tracked…';
    return;
  }
  const match = matchTrack(url);
  if (!match) {
    trackState.classList.add('missing');
    trackState.textContent = 'Not tracking this company';
    trackButton.textContent = 'Track this company';
    return;
  }
  trackState.classList.add('tracking');
  const name = document.createElement('strong');
  name.textContent = match.track.name || 'this company';
  trackState.append('Already tracking ', name);
  const when = trackedOn(match.track);
  if (when || match.samePage) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = match.samePage
      ? `This page${when ? ` · last tracked ${when}` : ''}`
      : `Last tracked ${when}`;
    trackState.append(meta);
  }
  trackButton.textContent = 'Update tracking';
}

async function loadTracks() {
  tracksFailed = false;
  try {
    const payload = await apiRequest('/company-tracks');
    tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  } catch (error) {
    if (await handleSignedOut(error, setupStatus)) return;
    tracks = [];
    tracksFailed = true;
  }
  showTrackState();
}

function rememberTrack(track) {
  tracksFailed = false;
  if (!Array.isArray(tracks)) tracks = [];
  const index = tracks.findIndex((item) => item._id === track._id);
  if (index >= 0) tracks[index] = track;
  else tracks.unshift(track);
  showTrackState();
}

function applyTab(tab) {
  const urlChanged = !currentTab || !sameUrl(currentTab.url, tab?.url);
  currentTab = tab || null;
  watchedTabId = tab?.id ?? watchedTabId;
  const url = tab?.url || '';
  const host = hostnameOf(url);
  pageUrl.textContent = url || 'No page URL yet.';
  pageTitle.textContent = tab?.title || 'This page';
  pageHost.textContent = host || 'Open a company website, then try again.';
  trackButton.disabled = !host;
  if (urlChanged) {
    const nextName = host ? nameFromHost(host) : '';
    if (!companyName.value || companyName.value === suggestedName) companyName.value = nextName;
    suggestedName = nextName;
  }
  showTrackState();
}

/** Starts the job form from the page the user is looking at. */
function startJobFromTab() {
  const url = currentTab?.url || '';
  if (!isWebPage(url)) {
    showStatus(fillStatus, 'Paste a job posting link to fill the form.', false);
    return;
  }
  const typed = jobFields.url.value.trim();
  if (typed && typed !== (jobFields.url.dataset.auto ?? '')) return;
  if (sameUrl(typed, url)) return;
  jobFields.url.value = url;
  jobFields.url.dataset.auto = url;
  resetSaved();
  showStatus(jobMessage, '', false);
  fillFromUrl(url);
}

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
    const payload = await apiRequest('/company-tracks', {
      method: 'POST',
      body: JSON.stringify({
        name,
        url: currentTab.url,
        pageTitle: currentTab.title || '',
        roles,
      }),
    });
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
    rememberTrack(payload.track);
  } catch (error) {
    if (await handleSignedOut(error, setupStatus)) return;
    showStatus(status, error instanceof Error ? error.message : 'Could not reach Job Tracker.', true);
  } finally {
    trackButton.disabled = false;
  }
});

// ---- Sign in -------------------------------------------------------------------

async function startSignedIn(settings) {
  showMain();
  fillStatuses(settings.jobStatus);
  showTrackState();
  await Promise.all([loadProfiles(settings.profile), loadTracks()]);
  startJobFromTab();
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
    applyTab(await currentPage());
    await refreshConnection(settings);
    await startSignedIn(settings);
  } catch (error) {
    showStatus(setupStatus, error instanceof Error ? error.message : 'Could not reach Job Tracker.', true);
  } finally {
    saveButton.disabled = false;
  }
});

changeToken.addEventListener('click', async () => {
  showSetup(await loadSettings());
});

companyName.addEventListener('input', () => showTrackState());

tabJob.addEventListener('click', () => showPanel('job'));
tabTrack.addEventListener('click', () => showPanel('track'));

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== watchedTabId) return;
  if (!(info.url || info.title || info.status === 'complete')) return;
  applyTab(tab);
  if (info.url || info.status === 'complete') startJobFromTab();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  applyTab(await chrome.tabs.get(tabId));
  startJobFromTab();
});

async function checkExtensionVersion(settings) {
  const installed = chrome.runtime.getManifest().version;
  const versionNode = $('#version');
  if (versionNode) versionNode.textContent = `v${installed}`;
  const update = $('#update');
  try {
    const response = await fetch(`${apiRoot(settings.apiUrl)}/extensions/job-tracker/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
      },
      body: JSON.stringify({ version: installed }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.update) {
      update.hidden = true;
      return;
    }
    update.hidden = false;
    update.textContent = `Update this extension to v${payload.version}. This copy is v${installed}.`;
  } catch {
    // The server was unreachable.
  }
}

loadSettings().then(async (settings) => {
  applyTab(await currentPage());
  refreshConnection(settings);
  checkExtensionVersion(settings);
  if (!settings.token) {
    showSetup(settings);
    return;
  }
  await startSignedIn(settings);
});
