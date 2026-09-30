import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCSV } from './parse.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = path.join(root, 'schule2026-2027-1/supabase-web-import');
const md5 = value => createHash('md5').update(value, 'utf8').digest('hex');
const asciiJSON = value => JSON.stringify(value).replace(/[^\x00-\x7f]/g,
  ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));

// Reproduce decoding independent byte chunks without carrying partial UTF-8
// sequences across boundaries. The observed report matches this exact size.
export function reproduceChunkDamage(bytes, chunkSize = 104857) {
  let text = '';
  for (let start = 0; start < bytes.length; start += chunkSize) {
    text += bytes.subarray(start, start + chunkSize).toString('utf8');
  }
  return text;
}

export function parseDamageReport(text) {
  return text.split(/\r?\n/).filter(line => /^\|\s*(classes|sections)\s*\|/.test(line)).map(line => {
    const [record_type, number, field, problem, observed] = line.split('|').slice(1, -1).map(s => s.trim());
    assert.ok(['字段名损坏', '字段值损坏'].includes(problem));
    const record_no = Number(number);
    assert.ok(Number.isSafeInteger(record_no) && record_no > 0);
    return { record_type, record_no, field, problem, observed };
  });
}

function differences(before, after, at = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (typeof before === 'string' && typeof after === 'string') {
    assert.ok(before.includes('\uFFFD'), 'Unexpected change without replacement characters');
    return [{ old_path: at, new_path: at, observed: before, correct: after }];
  }
  assert.ok(before && after && typeof before === 'object' && typeof after === 'object');
  assert.equal(Array.isArray(before), Array.isArray(after));
  if (Array.isArray(before)) assert.equal(before.length, after.length);
  const removed = Object.keys(before).filter(k => !Object.hasOwn(after, k));
  const added = Object.keys(after).filter(k => !Object.hasOwn(before, k));
  const result = [];
  if (removed.length || added.length) {
    assert.equal(removed.length, 1);
    assert.equal(added.length, 1);
    assert.ok(removed[0].includes('\uFFFD'));
    assert.equal(typeof before[removed[0]], 'string');
    assert.equal(before[removed[0]], after[added[0]]);
    result.push({ old_path: [...at, removed[0]], new_path: [...at, added[0]],
      observed: before[removed[0]], correct: after[added[0]] });
  }
  for (const key of Object.keys(before).filter(k => Object.hasOwn(after, k))) {
    result.push(...differences(before[key], after[key], [...at, key]));
  }
  return result;
}

export function repairBundle(csvBytes, manifest, reportText) {
  const source = parseCSV(csvBytes.toString('utf8'));
  const damaged = parseCSV(reproduceChunkDamage(csvBytes));
  assert.equal(source.length, manifest.uploadRows);
  assert.equal(damaged.length, source.length);
  const ordered = [...source].sort((a, b) => a.record_type === b.record_type
    ? Number(a.record_no) - Number(b.record_no) : a.record_type < b.record_type ? -1 : 1);
  assert.equal(md5(ordered.map(r => md5(r.payload_text)).join('')), manifest.contentChecksum);
  const changes = source.flatMap((record, i) => {
    assert.equal(record.record_type, damaged[i].record_type);
    assert.equal(record.record_no, damaged[i].record_no);
    return differences(JSON.parse(damaged[i].payload_text), JSON.parse(record.payload_text)).map(change => ({
      record_type: record.record_type, record_no: Number(record.record_no), ...change,
    }));
  });
  const sort = values => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const reproducedReport = changes.map(c => ({ record_type: c.record_type, record_no: c.record_no,
    field: c.old_path.join('.'), problem: c.old_path.join('.') === c.new_path.join('.') ? '字段值损坏' : '字段名损坏',
    observed: c.observed }));
  // Never create a patch from an assumed chunk size without checking every
  // reported field, key, and value against the actual uploaded-data report.
  assert.deepEqual(sort(reproducedReport), sort(parseDamageReport(reportText)));
  assert.equal(changes.length, 16);
  const specs = changes.map(({ observed, ...c }) => ({ ...c, observed_md5: md5(observed) }));
  const json = asciiJSON(specs).replaceAll("'", "''");
  assert.match(manifest.semanticChecksum, /^[a-f0-9]{32}$/);
  const table = 'public.timetable_upload_2026_2027_1';
  assert.equal(manifest.uploadTable, table.slice('public.'.length));
  const sql = `-- Restore 16 confirmed UTF-8 decoding errors from the original source.
-- Staging table only. Entire transaction rolls back unless ALL data matches.
-- Safe to repeat; already-correct fields are skipped. SQL itself is ASCII.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE _tt_encoding_result(repaired_fields integer) ON COMMIT DROP;
DO $repair$
DECLARE
  spec jsonb;
  original jsonb;
  restored jsonb;
  old_path text[];
  new_path text[];
  current_digest text;
  total bigint;
  repaired integer := 0;
BEGIN
  FOR spec IN SELECT value FROM jsonb_array_elements('${json}'::jsonb) LOOP
    SELECT array_agg(value ORDER BY ordinality) INTO old_path
      FROM jsonb_array_elements_text(spec->'old_path') WITH ORDINALITY;
    SELECT array_agg(value ORDER BY ordinality) INTO new_path
      FROM jsonb_array_elements_text(spec->'new_path') WITH ORDINALITY;
    SELECT payload_text::jsonb INTO original FROM ${table}
      WHERE record_type=spec->>'record_type' AND record_no=(spec->>'record_no')::integer;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing upload row: % / %', spec->>'record_type', spec->>'record_no';
    END IF;
    IF original #> new_path = spec->'correct'
       AND (old_path = new_path OR original #> old_path IS NULL) THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(original #> old_path) IS DISTINCT FROM 'string'
       OR md5(original #>> old_path) IS DISTINCT FROM spec->>'observed_md5'
       OR (old_path <> new_path AND original #> new_path IS NOT NULL) THEN
      RAISE EXCEPTION 'Unexpected upload data at % / % / %. No changes committed.',
        spec->>'record_type', spec->>'record_no', old_path;
    END IF;
    restored := original;
    IF old_path <> new_path THEN restored := restored #- old_path; END IF;
    restored := jsonb_set(restored, new_path, spec->'correct', true);
    IF restored #> new_path IS DISTINCT FROM spec->'correct' THEN
      RAISE EXCEPTION 'Could not restore field';
    END IF;
    UPDATE ${table} SET payload_text=restored::text
      WHERE record_type=spec->>'record_type' AND record_no=(spec->>'record_no')::integer;
    repaired := repaired + 1;
  END LOOP;
  SELECT count(*), md5(string_agg(md5(record_type||chr(31)||record_no::text||chr(31)||payload_text::jsonb::text),
    '' ORDER BY record_type COLLATE "C",record_no)) INTO total,current_digest FROM ${table};
  IF total <> ${manifest.uploadRows} OR current_digest IS DISTINCT FROM '${manifest.semanticChecksum}' THEN
    RAISE EXCEPTION 'Full upload checksum still differs. All repair changes rolled back. Do not import yet.';
  END IF;
  INSERT INTO _tt_encoding_result VALUES(repaired);
END $repair$;
SELECT 'READY' AS upload_status,repaired_fields,${manifest.uploadRows} AS verified_rows,
  true AS json_content_identical FROM _tt_encoding_result;
COMMIT;
`;
  assert.ok(Buffer.byteLength(sql) < 40 * 1024);
  assert.ok(/^[\x00-\x7f]*$/.test(sql));
  return { sql, changes, damaged, evidence: { chunkBytes: 104857, reportFieldsMatched: changes.length,
    affectedRows: new Set(changes.map(c => c.record_type + ':' + c.record_no)).size,
    repairedClasses: changes.filter(c => c.record_type === 'classes').length,
    repairedSections: changes.filter(c => c.record_type === 'sections').length,
    sqlBytes: Buffer.byteLength(sql), remoteWrites: false } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], 'Pass the exported damage report path');
  const result = repairBundle(fs.readFileSync(path.join(folder, '01-upload.csv')),
    JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')),
    fs.readFileSync(process.argv[2], 'utf8'));
  fs.writeFileSync(path.join(folder, '02b-repair-encoding.sql'), result.sql, 'utf8');
  fs.writeFileSync(path.join(folder, 'encoding-repair-evidence.json'),
    JSON.stringify({ ...result.evidence, fields: result.changes.map(({ observed, correct, ...c }) => c) }, null, 2) + '\n');
  console.log(JSON.stringify(result.evidence, null, 2));
}
