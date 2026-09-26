function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let cell = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  // Spreadsheets treat a leading =, +, - or @ as a formula, so a job title like
  // "=cmd|..." would execute on open. Neutralise it with a leading apostrophe.
  if (/^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  if (/[",\n\r]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Record<string, unknown>>} rows
 */
export function toCsv(columns, rows) {
  const header = columns.map((column) => escapeCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(','));
  return [header, ...body].join('\r\n');
}
