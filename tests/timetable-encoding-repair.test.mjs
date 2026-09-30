import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { reproduceChunkDamage } from '../scripts/timetable/repair-upload.mjs';
import { parseCSV } from '../scripts/timetable/parse.mjs';

const folder = new URL('../schule2026-2027-1/supabase-web-import/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, folder), 'utf8');
const table = 'public.timetable_upload_2026_2027_1';

test('confirmed UTF-8 damage: atomic guarded repair, full integrity, retries and future ASCII uploads', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(read('00-create-upload-table.sql'));
    // A sentinel represents business data; repair must never touch it.
    await db.exec("CREATE TABLE public.teachers(id text PRIMARY KEY,name text); INSERT INTO teachers VALUES('existing','现有教师');");
    const bytes = fs.readFileSync(new URL('01-upload.csv', folder));
    const damaged = reproduceChunkDamage(bytes);
    await db.query(`COPY ${table}(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`, [],
      { blob: new Blob([damaged]) });
    const check = async () => (await db.query(read('02-check-upload.sql'))).rows[0];
    const fingerprint = async () => (await db.query(`SELECT md5(string_agg(payload_text,'' ORDER BY record_type,record_no)) AS h FROM ${table}`)).rows[0].h;
    const getRow = async (kind, no) => (await db.query(`SELECT payload_text FROM ${table} WHERE record_type=$1 AND record_no=$2`, [kind, no])).rows[0].payload_text;
    const setRow = (kind, no, value) => db.query(`UPDATE ${table} SET payload_text=$3 WHERE record_type=$1 AND record_no=$2`, [kind, no, value]);
    assert.equal((await check()).upload_status, 'NOT_READY');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE strpos(payload_text,chr(65533))>0`)).rows[0].n, 16);
    const sql = read('02b-repair-encoding.sql');
    assert.ok(Buffer.byteLength(sql) < 40 * 1024);
    assert.match(sql, /^[\x00-\x7f]*$/);

    // An unexpected concurrent edit must abort and undo preceding patches.
    const oldTeacherRow = await getRow('sections', 463);
    const unexpected = JSON.parse(oldTeacherRow); unexpected.teacher_key = 'unexpected';
    await setRow('sections', 463, JSON.stringify(unexpected));
    const beforeUnexpected = await fingerprint();
    await assert.rejects(db.exec(sql), /Unexpected upload data/);
    await db.exec('ROLLBACK');
    assert.equal(await fingerprint(), beforeUnexpected);
    await setRow('sections', 463, oldTeacherRow);

    // A different, unreported corruption must also prevent partial commits.
    const oldCourse = await getRow('courses', 1);
    const unexpectedCourse = JSON.parse(oldCourse); unexpectedCourse.name = 'wrong';
    await setRow('courses', 1, JSON.stringify(unexpectedCourse));
    const beforeOtherDamage = await fingerprint();
    await assert.rejects(db.exec(sql), /Full upload checksum still differs/);
    await db.exec('ROLLBACK');
    assert.equal(await fingerprint(), beforeOtherDamage);
    await setRow('courses', 1, oldCourse);

    const results = await db.exec(sql);
    assert.equal(results.flatMap(r => r.rows).find(r => r.upload_status === 'READY').repaired_fields, 16);
    assert.equal((await check()).upload_status, 'READY');
    assert.equal((await check()).json_content_identical, true);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE strpos(payload_text,chr(65533))>0`)).rows[0].n, 0);
    const second = await db.exec(sql);
    assert.equal(second.flatMap(r => r.rows).find(r => r.upload_status === 'READY').repaired_fields, 0);
    assert.deepEqual((await db.query('SELECT * FROM teachers')).rows, [{ id: 'existing', name: '现有教师' }]);

    // New ASCII uploads retain every original JSON value even with the same
    // buggy chunk decoder. Chinese is decoded only by the JSON parser.
    const safe = read('01-upload-ascii.csv');
    assert.match(safe, /^[\x00-\x7f]*$/);
    assert.equal(reproduceChunkDamage(Buffer.from(safe)), safe);
    const original = parseCSV(bytes.toString('utf8'));
    const safeRows = parseCSV(safe);
    assert.equal(safeRows.length, original.length);
    for (let i = 0; i < original.length; i++) {
      assert.equal(safeRows[i].record_no, original[i].record_no);
      assert.equal(safeRows[i].record_type, original[i].record_type);
      assert.deepEqual(JSON.parse(safeRows[i].payload_text), JSON.parse(original[i].payload_text));
    }
    await db.exec(`TRUNCATE TABLE ${table}`);
    await db.query(`COPY ${table}(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`, [],
      { blob: new Blob([safe]) });
    assert.equal((await check()).upload_status, 'READY');
  } finally {
    await db.close();
  }
});
