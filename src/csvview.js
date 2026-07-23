// CSV parsing + table rendering. Framework-free (only DOM API for rendering),
// so this module runs under jsdom and is unit-testable without a CDN import.

// Auto-detect the field delimiter from the first non-empty line: comma is
// standard, but many locales export semicolon- or tab-separated "CSV"
// (common when the decimal separator is a comma), so pick whichever
// character appears most often in that line.
export function detectDelimiter(text) {
  const firstLine = String(text || '').split(/\r\n|\r|\n/).find(l => l.length > 0) || '';
  let best = ',', bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// RFC 4180-ish parser: handles quoted fields, embedded delimiters/newlines,
// and doubled-quote escapes ("" -> ") inside quoted fields.
export function parseCSV(text, delimiter = ',') {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // Flush a trailing field/row when the text doesn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Render parsed `rows` into `container` as a table, replacing prior content.
// `headerRow`: render rows[0] as a sticky <thead> instead of a data row.
export function renderCsvTable(container, rows, { headerRow = true } = {}) {
  const doc = container.ownerDocument;
  container.textContent = '';
  const table = doc.createElement('table');
  table.className = 'csv-table';

  if (headerRow && rows.length) {
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    for (const cell of rows[0]) {
      const th = doc.createElement('th');
      th.textContent = cell;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = doc.createElement('tbody');
  for (const r of rows.slice(headerRow ? 1 : 0)) {
    const tr = doc.createElement('tr');
    for (const cell of r) {
      const td = doc.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

// Column count for the widest row — used for the "N rows × M cols" info line.
export function columnCount(rows) {
  return rows.reduce((max, r) => Math.max(max, r.length), 0);
}
