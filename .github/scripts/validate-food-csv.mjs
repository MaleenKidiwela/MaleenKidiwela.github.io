// Validates food/restaurants.csv so a bad spreadsheet edit fails CI
// instead of silently breaking the /food map. No dependencies.
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'food/restaurants.csv';
const REQUIRED = ['name', 'cuisine', 'address', 'lat', 'lng',
  'ambience', 'can_i_eat', 'service', 'taste', 'would_return', 'expense_worth', 'notes'];
const SCORES = ['ambience', 'can_i_eat', 'service', 'taste', 'would_return', 'expense_worth'];

// Same quoted-field CSV parsing rules as the page itself.
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

const errors = [];
const rows = parseCSV(readFileSync(path, 'utf8'));
if (rows.length < 2) {
  console.error(`${path}: no data rows found`);
  process.exit(1);
}

const head = rows[0].map(h => h.trim().toLowerCase());
for (const col of REQUIRED) {
  if (!head.includes(col)) errors.push(`header: missing required column "${col}"`);
}

const col = k => head.indexOf(k);
const seen = new Set();
rows.slice(1).forEach((r, i) => {
  const line = i + 2; // 1-based, after header
  const get = k => (col(k) >= 0 ? (r[col(k)] ?? '').trim() : '');
  const name = get('name');
  if (!name) { errors.push(`line ${line}: empty name`); return; }
  if (seen.has(name.toLowerCase())) errors.push(`line ${line}: duplicate name "${name}"`);
  seen.add(name.toLowerCase());

  for (const k of ['lat', 'lng']) {
    const v = get(k);
    if (v === '') { errors.push(`line ${line} (${name}): missing ${k}`); continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) { errors.push(`line ${line} (${name}): ${k}="${v}" is not a number`); continue; }
    // Greater Puget Sound sanity box — catches swapped lat/lng or typos.
    if (k === 'lat' && (n < 46.5 || n > 48.5)) errors.push(`line ${line} (${name}): lat ${n} outside Puget Sound range`);
    if (k === 'lng' && (n < -123.5 || n > -121.0)) errors.push(`line ${line} (${name}): lng ${n} outside Puget Sound range`);
  }

  for (const k of SCORES) {
    const v = get(k);
    if (v === '') continue; // unrated is fine
    const n = Number(v);
    if (!Number.isFinite(n)) errors.push(`line ${line} (${name}): ${k}="${v}" is not a number`);
    else if (n < 0 || n > 10) errors.push(`line ${line} (${name}): ${k}=${n} outside 0–10`);
  }
});

if (errors.length) {
  console.error(`restaurants.csv failed validation (${errors.length} problem${errors.length > 1 ? 's' : ''}):\n`);
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`restaurants.csv OK — ${rows.length - 1} rows, ${seen.size} unique restaurants.`);
