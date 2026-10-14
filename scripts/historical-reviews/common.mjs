import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const previous = path.join(root, 'migration-output/20260927');
export const output = path.join(root, 'migration-output/20261013-new-only');
export const termName = '历史学期(未标注具体学期)';
export const read = file => fs.readFileSync(file, 'utf8');
export const json = file => JSON.parse(read(file));
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === '') quoted = true;
    else if (c === ',') { row.push(value); value = ''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += c;
  }
  assert.equal(quoted, false, 'Unclosed CSV quote');
  if (row.length || value.length) { row.push(value); rows.push(row); }
  const header = rows.shift();
  assert.equal(new Set(header).size, header.length);
  return rows.map((r, i) => {
    assert.equal(r.length, header.length, `CSV column count at record ${i + 2}`);
    return Object.fromEntries(header.map((k, j) => [k, r[j]]));
  });
}
export function csv(rows, headers = Object.keys(rows[0])) {
  const cell = x => x == null ? '' : /[",\r\n]/.test(String(x)) || x === ''
    ? '"' + String(x).replaceAll('"', '""') + '"' : String(x);
  const text = headers.join(',') + '\r\n' + rows.map(r => headers.map(h => cell(r[h])).join(',')).join('\r\n') + '\r\n';
  assert.equal(parseCSV(text).length, rows.length);
  return text;
}
export const sql = x => x == null ? 'NULL' : typeof x === 'number' || typeof x === 'boolean' ? String(x) : "'" + String(x).replaceAll("'", "''") + "'";
export function insert(table, rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return `INSERT INTO ${table} (${cols.join(',')}) VALUES\n` + rows.map(r => '(' + cols.map(c => sql(r[c])).join(',') + ')').join(',\n') + ';\n';
}
