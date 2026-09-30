import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildPayload, parseCSV, parseSchedule, parseWeeks, sourceKey } from '../scripts/timetable/parse.mjs';
import { generateSQL } from '../scripts/import-timetable.mjs';
import { dashboardBundle, uploadTable } from '../scripts/timetable/dashboard-bundle.mjs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const college = '10000000-0000-0000-0000-000000000001';
const otherCollege = '10000000-0000-0000-0000-000000000002';
const course = '20000000-0000-0000-0000-000000000001';
const config = { term: '2026-2027第1学期', setCurrentTerm: true, collegeAliases: { 数学: '数学学院' }, teacherOverrides: {}, courseOverrides: {} };
export const row = (overrides = {}) => ({
  序号: '1', 选课编号: 'TEST01', 课程代码: 'MATH01', 课程名称: '高等数学', 教学班: '001,002', 学分: '3.00', 性质: '必修',
  开课: '数学', 教师: '张老师', 职称: '教授', 时间地点: '1-4、7周 星期一 3-4节 X123(犀浦)', 优选: '测试01班,测试02班',
  '已选/容量': '30/50', 校区: '犀浦', 学期: config.term, 上课周次节次: '1-4、7周 星期一 3-4节', 上课地点: 'X123(犀浦)', 教师主页: '', ...overrides,
});

export async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
  await db.exec(read('supabase_schema.sql'));
  await db.exec(read('supabase/migrations/20260926_community_v2.sql'));
  return db;
}

test('CSV quoting, Unicode, leading zeros and malformed input', () => {
  assert.deepEqual(parseCSV('\uFEFFid,text\r\n001,"A, B\n""C"""\r\n'), [{ id: '001', text: 'A, B\n"C"' }]);
  assert.throws(() => parseCSV('id,name\n1,"broken'), /unclosed/);
  assert.throws(() => parseCSV('id,name\n1,"a"b'), /closing quote/);
  assert.throws(() => parseCSV('id,id\n1,2'), /duplicate headers/);
});

test('dashboard CSV upload guards missing/corrupt data; dry run and retries preserve business data',async()=>{
  const db=await setup();
  try {
    const payload=buildPayload([row()],config);
    const {files,records}=await dashboardBundle(payload);
    assert.ok(Buffer.byteLength(files['04-import.sql'])<40*1024);
    const prepare=files['00-create-upload-table.sql'],check=files['02-check-upload.sql'];
    await db.exec(prepare);
    assert.equal((await db.query(check)).rows[0].upload_status,'NOT_READY');
    await assert.rejects(db.exec(files['03-dry-run.sql']),/CSV 未完整上传/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('public.timetable_sections') AS t")).rows[0].t,null);
    await db.query(`COPY public.${uploadTable}(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],
      {blob:new Blob([files['01-upload.csv']])});
    await db.exec(prepare);
    assert.equal((await db.query(check)).rows[0].upload_status,'READY');
    assert.equal(Number((await db.query(check)).rows[0].uploaded_rows),records.length);
    await db.exec(files['03-dry-run.sql']);
    assert.equal((await db.query("SELECT to_regclass('public.timetable_sections') AS t")).rows[0].t,null);
    assert.equal((await db.query(check)).rows[0].upload_status,'READY');
    await db.exec(files['04-import.sql']);
    await db.exec(files['04-import.sql']);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_sections')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM teachers')).rows[0].n,1);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query(`SELECT * FROM public.${uploadTable}`),/permission denied/);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE public.${uploadTable} SET payload_text=payload_text||' ' WHERE record_type='meta'`);
    const formatted=(await db.query(check)).rows[0];
    assert.equal(formatted.upload_status,'READY');
    assert.equal(formatted.raw_text_identical,false);
    assert.equal(formatted.json_content_identical,true);
    // Reorder JSON keys and whitespace; all imported values stay identical.
    await db.exec(`UPDATE public.${uploadTable} SET payload_text=payload_text::jsonb::text`);
    assert.equal((await db.query(check)).rows[0].upload_status,'READY');
    await db.exec(files['03-dry-run.sql']);
    await db.exec(files['04-import.sql']);
    // Changed real data must fail despite the correct total row count.
    await db.exec(`UPDATE public.${uploadTable} SET payload_text=jsonb_set(payload_text::jsonb,'{name}','"错误课程"')::text WHERE record_type='courses' AND record_no=1`);
    assert.equal((await db.query(check)).rows[0].upload_status,'NOT_READY');
    const diagnostics=(await db.query(files['02a-diagnose-upload.sql'])).rows;
    assert.deepEqual(diagnostics.filter(r=>!r.content_matches).map(r=>r.record_type),['courses']);
    await assert.rejects(db.exec(files['04-import.sql']),/CSV 未完整上传/);
    await db.exec('ROLLBACK');
    // Changed row identifiers must also fail with unchanged payload values.
    await db.exec(files['99-reset-upload-only.sql']);
    await db.query(`COPY public.${uploadTable}(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],
      {blob:new Blob([files['01-upload.csv']])});
    await db.exec(`UPDATE public.${uploadTable} SET record_no=record_no+10000`);
    assert.equal((await db.query(check)).rows[0].upload_status,'NOT_READY');
    await db.exec(files['99-reset-upload-only.sql']);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_sections')).rows[0].n,1);
    assert.equal((await db.query(check)).rows[0].upload_status,'NOT_READY');
  } finally {await db.close();}
});

test('weeks, separate meeting teachers, groups, unknown rooms and source cross-checks', () => {
  assert.deepEqual(parseWeeks('1-8周(单)'), [1,3,5,7]);
  assert.deepEqual(parseWeeks('2、4-6周'), [2,4,5,6]);
  assert.throws(() => parseWeeks('0-2周'));
  assert.throws(() => parseWeeks('7-3周'));
  const r = row({ 时间地点: '2周 星期一 1节 X123(犀浦)(John Smith) 3周 星期二 3-5节 X456（G2)',
    上课周次节次: '2周 星期一 1节 3周 星期二 3-5节', 上课地点: 'X123(犀浦)(John Smith) X456（G2)' });
  const meetings = parseSchedule(r);
  assert.equal(meetings[0].teacher_name, 'John Smith');
  assert.equal(meetings[0].room, 'X123');
  assert.equal(meetings[0].period_end, 1);
  assert.equal(meetings[1].teacher_name, null);
  assert.equal(meetings[1].group_label, 'G2');
  assert.equal(meetings[1].room, 'X456');
  const unknown = row({ 时间地点: '1-17周', 上课周次节次: '1-17周', 上课地点: '' });
  assert.equal(parseSchedule(unknown)[0].weekday, null);
  assert.equal(parseSchedule(unknown)[0].room, null);
  assert.throws(() => parseSchedule({ ...r, 上课地点: 'other' }), /disagree/);
  const online = row({ 时间地点:'1周 星期二 3节 Online(John Smith)', 上课周次节次:'1周 星期二 3节', 上课地点:'Online(John Smith)' });
  assert.equal(parseSchedule(online)[0].campus, '线上');
  assert.equal(parseSchedule({ ...online, 时间地点:online.时间地点.replace('Online','TBC'), 上课地点:'TBC(John Smith)' })[0].room, null);
});

test('atomic dry run, additive import, ambiguity, re-run, manual resolution and RLS', async () => {
  const db = await setup();
  try {
    await db.exec(`INSERT INTO colleges(id,name) VALUES('${college}','数学学院'),('${otherCollege}','物理学院');
      INSERT INTO courses(id,name,college_id) VALUES('${course}','高等数学','${college}');
      INSERT INTO teachers(id,name,college_id) VALUES('existing','张老师','${college}'),('ambiguous','王老师','${otherCollege}'),('ambiguous2','王老师','${college}');
      INSERT INTO terms(year_term,is_current) VALUES('旧学期',true);`);
    const before = (await db.query('SELECT * FROM teachers ORDER BY id')).rows;
    const rows = [row(), row({ 选课编号:'TEST02', 教师:'王老师', 时间地点:'2周 星期三 5节 X123(犀浦)(访问教师)',
      上课周次节次:'2周 星期三 5节', 上课地点:'X123(犀浦)(访问教师)' }),
    row({选课编号:'TEST03',教师:'新教师',时间地点:'1-17周',上课周次节次:'1-17周',上课地点:''}),
    row({选课编号:'TEST04',教师:'',时间地点:'',上课周次节次:'',上课地点:'','已选/容量':'73/-1'})];
    const payload = buildPayload(rows,config);
    await db.exec(generateSQL(payload,true));
    assert.equal((await db.query("SELECT to_regclass('public.timetable_sections') AS t")).rows[0].t, null);
    assert.deepEqual((await db.query('SELECT * FROM teachers ORDER BY id')).rows,before);
    await db.exec(generateSQL(payload));
    assert.deepEqual((await db.query("SELECT * FROM teachers WHERE id IN ('existing','ambiguous','ambiguous2') ORDER BY id")).rows,before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM courses')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_sections')).rows[0].n,4);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_meetings')).rows[0].n,3);
    assert.equal((await db.query("SELECT teacher_id FROM timetable_schedule WHERE selection_code='TEST02'")).rows[0].teacher_id,payload.teachers.find(t=>t.name==='访问教师').new_id);
    assert.equal((await db.query("SELECT primary_teacher_id FROM timetable_schedule WHERE selection_code='TEST02'")).rows[0].primary_teacher_id,null);
    const created = (await db.query("SELECT overall_score,review_count,colleges.name AS college FROM teachers JOIN colleges ON colleges.id=teachers.college_id WHERE teachers.name='新教师'")).rows[0];
    assert.equal(created.overall_score,null); assert.equal(created.review_count,0); assert.equal(created.college,'数学学院');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM terms WHERE is_current")).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM point_transactions')).rows[0].n,0);
    const counts = (await db.query('SELECT (SELECT count(*) FROM teachers) AS t,(SELECT count(*) FROM course_offerings) AS o')).rows;
    await db.exec(generateSQL(payload));
    assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM teachers) AS t,(SELECT count(*) FROM course_offerings) AS o')).rows,counts);

    const mapped = structuredClone(config); mapped.teacherOverrides[sourceKey('数学','王老师')] = 'ambiguous';
    await db.exec(generateSQL(buildPayload(rows,mapped)));
    assert.equal((await db.query("SELECT primary_teacher_id FROM timetable_schedule WHERE selection_code='TEST02'")).rows[0].primary_teacher_id,'ambiguous');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM course_offerings WHERE teacher_id='ambiguous'")).rows[0].n,1);
    await db.exec('SET ROLE anon');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_schedule')).rows[0].n,4);
    await assert.rejects(db.exec("DELETE FROM timetable_sections"), /permission denied/);
    await db.exec('RESET ROLE');

    const changedRows = structuredClone(rows); changedRows[0].学分='4'; changedRows.push(row({选课编号:'NEW',教师:'MustRollBack'}));
    await assert.rejects(db.exec(generateSQL(buildPayload(changedRows,mapped))), /不同内容/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM teachers WHERE name='MustRollBack'")).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM timetable_sections')).rows[0].n,4);
  } finally { await db.close(); }
});

test('SQL data cannot escape its literal; explicit unresolved teacher never falls back', async () => {
  const db = await setup();
  try {
    await db.exec(`INSERT INTO colleges(id,name) VALUES('${college}','数学学院'),('${otherCollege}','物理学院');
      INSERT INTO teachers(id,name,college_id) VALUES('existing','张老师','${college}'),('visitor','王老师','${otherCollege}'),('visitor2','王老师','${college}');`);
    const r = row({课程名称:"O'Brien $$; DROP TABLE public.teachers; -- \\ test", 时间地点:'2周 星期三 5节 X123(犀浦)(王老师)',
      上课周次节次:'2周 星期三 5节',上课地点:'X123(犀浦)(王老师)'});
    const payload = buildPayload([r],config);
    await db.exec(generateSQL(payload));
    const result=(await db.query('SELECT * FROM timetable_schedule')).rows[0];
    assert.equal(result.course_name,r.课程名称);
    assert.equal(result.primary_teacher_id,'existing');
    assert.equal(result.teacher_id,null);
    assert.equal(result.teacher_match_status,'pending');
  } finally { await db.close(); }
});

test('reuse one teacher page across departments, update unique college, preserve multi-college and scores',async()=>{
  const db=await setup();
  try {
    await db.exec(`INSERT INTO colleges(id,name) VALUES('${college}','数学学院'),('${otherCollege}','物理学院');
      INSERT INTO teachers(id,name,college_id,review_count,overall_score) VALUES('existing','张老师','${otherCollege}',99,4.8);`);
    const rows=[row(),row({选课编号:'TEST02',开课:'通识中心'}),row({选课编号:'TEST03',教师:'新教师'}),row({选课编号:'TEST04',教师:'新教师',开课:'通识中心'})];
    const payload=buildPayload(rows,config);
    await db.exec(generateSQL(payload));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM teachers WHERE name='新教师'")).rows[0].n,1);
    const old=(await db.query("SELECT id,college_id,review_count,overall_score FROM teachers WHERE name='张老师'")).rows;
    assert.equal(old.length,1);assert.equal(old[0].id,'existing');assert.equal(old[0].college_id,college);
    assert.equal(old[0].review_count,99);assert.equal(Number(old[0].overall_score),4.8);
    assert.equal((await db.query("SELECT count(DISTINCT primary_teacher_id)::int AS n FROM timetable_schedule WHERE primary_teacher_name='新教师'")).rows[0].n,1);
    assert.equal((await db.query("SELECT old_college_id FROM timetable_college_updates WHERE teacher_id='existing'")).rows[0].old_college_id,otherCollege);
    await db.exec(generateSQL(payload));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM timetable_college_updates WHERE teacher_id='existing'")).rows[0].n,1);
    const multiConfig={...config,collegeAliases:{...config.collegeAliases,物理:'物理学院'}};
    const multi=[row({选课编号:'MULTI1'}),row({选课编号:'MULTI2',开课:'物理'})];
    await db.exec(generateSQL(buildPayload(multi,multiConfig)));
    assert.equal((await db.query("SELECT college_id FROM teachers WHERE id='existing'")).rows[0].college_id,college);
  } finally {await db.close();}
});
