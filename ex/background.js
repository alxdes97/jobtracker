const EXTENSION_KEY = 'job-tracker';
const DEFAULT_ORIGIN = 'http://213.59.112.27:5000';

async function checkExtensionVersion() {
  const installed = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get(['apiUrl', 'token', 'notifiedExtensionVersion']);
  const origin = String(stored.apiUrl || DEFAULT_ORIGIN).replace(/\/+$/, '').replace(/\/api$/i, '');
  try {
    const response = await fetch(`${origin}/api/extensions/${EXTENSION_KEY}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(stored.token ? { Authorization: `Bearer ${stored.token}` } : {}),
      },
      body: JSON.stringify({ version: installed }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.update) {
      await chrome.storage.local.set({ extensionUpdate: null, notifiedExtensionVersion: '' });
      return;
    }
    await chrome.storage.local.set({ extensionUpdate: { version: payload.version, installed } });
    if (stored.notifiedExtensionVersion === payload.version) return;
    await chrome.storage.local.set({ notifiedExtensionVersion: payload.version });
    chrome.notifications.create(`extension-update-${EXTENSION_KEY}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Update Job Tracker',
      message: `This copy is v${installed}. Install v${payload.version}.`,
      priority: 2,
    }).catch(() => {});
  } catch {
    // The server was unreachable.
  }
}

chrome.runtime.onInstalled.addListener(() => checkExtensionVersion());
chrome.runtime.onStartup.addListener(() => checkExtensionVersion());
chrome.alarms.create('extension-version', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'extension-version') checkExtensionVersion();
});
checkExtensionVersion();
