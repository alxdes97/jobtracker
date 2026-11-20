/** Copies text from a click. The async clipboard API is missing on plain HTTP, so this falls back to a selected field. */
export function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => copyWithSelection(text));
  }
  return copyWithSelection(text);
}

function copyWithSelection(text: string) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
  if (!copied) return Promise.reject(new Error('Could not copy'));
  return Promise.resolve();
}
