export type FormField = {
  label: string;
  name: string;
  value: string;
};

function clean(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function generic(value: string) {
  return /^(search|select(?:\.\.\.)?|textbox|empty|drop or select.*|total \d+ files? selected|no files added)$/i.test(clean(value));
}

function humanize(value: string) {
  const words = clean(value.replace(/[_.:-]+/g, ' '));
  if (!words || generic(words)) return '';
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function fieldLabel(field: Element) {
  const nodes = field.querySelectorAll('[id$="-label"]');
  for (const node of nodes) {
    if (node.closest('[data-testid="field"]') === field) return clean(node.textContent || '');
  }
  return '';
}

function looksLikeHtml(value: string) {
  return /<\s*(div|form|h1|label|input|p)\b/i.test(value);
}

function extractRoot(root: ParentNode) {
  const fields: FormField[] = [];
  const seen = new Set<string>();
  function add(label: string, name: string, value: string) {
    const cleanLabel = clean(label).slice(0, 180);
    const cleanValue = clean(value).slice(0, 2000);
    if (!cleanLabel || !cleanValue || generic(cleanLabel) || generic(cleanValue)) return;
    const key = cleanLabel.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ label: cleanLabel, name, value: cleanValue });
  }

  root.querySelectorAll('[data-testid="field"]').forEach((field) => {
    const label = fieldLabel(field);
    const status = clean(field.querySelector('[role="status"]')?.textContent || '');
    const uploaded = status.match(/file\s+(.+?)\s+uploaded successfully/i);
    if (uploaded && label) {
      add(label, 'resume', uploaded[1]);
      return;
    }
    const group = field.querySelector('[role="radiogroup"]');
    if (group) {
      const chosen = group.querySelector('[aria-checked="true"]');
      add(label || humanize(group.getAttribute('data-testid') || ''), group.getAttribute('data-testid') || '', chosen?.textContent || '');
      return;
    }
    const box = [...field.querySelectorAll('[role="combobox"]')].find((node) => node.tagName !== 'INPUT' && node.tagName !== 'TEXTAREA' && node.tagName !== 'SELECT');
    if (box && label) {
      add(label, box.id || '', box.textContent || '');
      return;
    }
    const inputs = [...field.querySelectorAll('input, textarea, select')].filter((element) => {
      const type = (element.getAttribute('type') || '').toLowerCase();
      return !['hidden', 'password', 'submit', 'button', 'file', 'radio', 'checkbox'].includes(type);
    });
    const labelId = field.querySelector('[id$="-label"]')?.id || '';
    const named = inputs.find((element) => labelId && (element.getAttribute('aria-labelledby') || '').includes(labelId));
    const valued = named || inputs.find((element) => clean((element as HTMLInputElement).value) && !generic(element.getAttribute('aria-label') || ''));
    if (valued && label) add(label, valued.getAttribute('name') || '', (valued as HTMLInputElement).value);
    const code = inputs.find((element) => element.closest('[data-testid$="-code"]') && clean((element as HTMLInputElement).value));
    if (code && code !== valued && label) add(`${label} country code`, code.getAttribute('name') || '', (code as HTMLInputElement).value);
  });
  return fields;
}

export function presentFields(fields: FormField[]) {
  const parsed: FormField[] = [];
  const plain: FormField[] = [];
  for (const field of fields) {
    if (field.name === 'page-html' || looksLikeHtml(field.value)) {
      const document = new DOMParser().parseFromString(field.value, 'text/html');
      parsed.push(...extractRoot(document));
      continue;
    }
    if (!clean(field.value) || generic(field.label) || generic(field.value)) continue;
    if (/remove/i.test(field.label) && /\.pdf/i.test(field.label)) continue;
    plain.push({ label: clean(field.label), name: field.name, value: clean(field.value) });
  }
  const byLabel = new Map<string, FormField>();
  for (const field of [...parsed, ...plain]) {
    const key = field.label.toLowerCase();
    const existing = byLabel.get(key);
    if (!existing || field.value.length > existing.value.length) byLabel.set(key, field);
  }
  return [...byLabel.values()];
}
