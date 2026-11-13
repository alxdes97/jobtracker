import { ApiError } from './apiError.js';

const MAX_BINDINGS = 100;
const MAX_PAIRS = 200;

export function normalizeAutoKeyConfig(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Configuration must be an object');
  }
  if (!Array.isArray(body.bindings)) {
    throw ApiError.badRequest('bindings must be a list');
  }
  const transform = body.clipboard_transform || body.clipboardTransform || {};
  if (transform.pairs != null && !Array.isArray(transform.pairs)) {
    throw ApiError.badRequest('clipboard pairs must be a list');
  }

  const bindings = [];
  const seenHotkeys = new Set();
  for (const item of body.bindings) {
    if (!item || typeof item !== 'object') continue;
    const hotkey = String(item.hotkey || '').trim().slice(0, 80);
    const file = String(item.file || '').trim().slice(0, 1000);
    if (!hotkey || !file || seenHotkeys.has(hotkey)) continue;
    seenHotkeys.add(hotkey);
    bindings.push({ hotkey, file });
    if (bindings.length >= MAX_BINDINGS) break;
  }

  const pairs = [];
  const seenSpells = new Set();
  for (const item of transform.pairs || []) {
    if (!item || typeof item !== 'object') continue;
    const from = String(item.from ?? '').slice(0, 200);
    const to = String(item.to ?? '').slice(0, 200);
    if (!from || seenSpells.has(from)) continue;
    seenSpells.add(from);
    pairs.push({ from, to });
    if (pairs.length >= MAX_PAIRS) break;
  }

  return {
    bindings,
    clipboard_transform: {
      enabled: Boolean(transform.enabled),
      pairs,
    },
  };
}

export function publicAutoKeyConfig(doc) {
  if (!doc) {
    return {
      configured: false,
      bindings: [],
      clipboard_transform: { enabled: false, pairs: [] },
    };
  }
  const transform = doc.clipboardTransform || {};
  return {
    configured: true,
    bindings: (doc.bindings || []).map((item) => ({ hotkey: item.hotkey, file: item.file })),
    clipboard_transform: {
      enabled: Boolean(transform.enabled),
      pairs: (transform.pairs || []).map((item) => ({ from: item.from, to: item.to })),
    },
  };
}

export function exportAutoKeyConfig(config) {
  return {
    bindings: config.bindings,
    clipboard_transform: config.clipboard_transform,
  };
}
