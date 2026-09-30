import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildPayload, parseCSV } from './parse.mjs';
import { generateSQL } from '../import-timetable.mjs';
import { uploadTable } from './dashboard-bundle.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const legacy='migration-output/20260927/';
const config=JSON.parse(read('scripts/timetable/config.json'));
const payload=buildPayload(parseCSV(read('schule2026-2027-1/courses.csv')),config);
const webMode=process.argv.includes('--dashboard');
const webFolder='schule2026-2027-1/supabase-web-import/';
const runSQL=dryRun=>webMode ? read(webFolder+(dryRun?'03-dry-run.sql':'04-import.sql')) : generateSQL(payload,dryRun);
const catalog=JSON.parse(read(legacy+'catalog-snapshot.json'));
const mapping=parseCSV(read(legacy+'teacher-mapping-and-snapshot.csv'));
const db=new PGlite();
const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
async function copy(table,file) {
  const csv=read(legacy+file), columns=csv.slice(0,csv.indexOf('\n')).trim();
  await db.query(`COPY public.${table} (${columns}) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],{blob:new Blob([csv])});
}
async function insertRows(table,rows) {
  if(!rows.length)return;
  const columns=Object.keys(rows[0]);
  // All table/column names come from the local, fixed test fixture definitions.
  const select=columns.map(c=>'r.'+c).join(',');
  await db.query(`INSERT INTO public.${table} (${columns.join(',')}) SELECT ${select}
    FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb) r ON CONFLICT(id) DO NOTHING`,[JSON.stringify(rows)]);
}
try {
  console.log('Preparing isolated PostgreSQL with local teacher directory; no network access.');
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
  await db.exec(read('supabase_schema.sql'));
  await db.exec(read('supabase/migrations/20260926_community_v2.sql'));
  const colleges=new Map(catalog.colleges.map(c=>[c.id,c]));
  for(const t of mapping) if(!colleges.has(t.college_id)) colleges.set(t.college_id,{id:t.college_id,name:t.college_name,campus:'未知'});
  await insertRows('colleges',[...colleges.values()]);
  await insertRows('terms',catalog.terms);
  await copy('courses','courses-reference.csv');
  for(const column of ['overall_score','attendance_strictness','grading_leniency','effort_matters','workload_difficulty','approachability','teaching_quality']) {
    await db.exec(`ALTER TABLE public.teachers ALTER COLUMN ${column} DROP NOT NULL,ALTER COLUMN ${column} DROP DEFAULT`);
  }
  await copy('teachers','teachers.csv');
  const offerings=parseCSV(read(legacy+'course_offerings.csv'));
  const historicalTerm=offerings[0].term_id;
  if(!await scalar(`SELECT count(*) FROM terms WHERE id='${historicalTerm}'`)) {
    await db.query('INSERT INTO terms(id,year_term,is_current) VALUES($1,$2,false)',[historicalTerm,'历史学期(未标注具体学期)']);
  }
  await copy('course_offerings','course_offerings.csv');
  const baselineTeachers=(await db.query('SELECT * FROM teachers ORDER BY id')).rows;
  const baselineOfferings=await scalar('SELECT count(*) FROM course_offerings');
  const baselineCourses=await scalar('SELECT count(*) FROM courses');
  if(webMode) {
    console.log('Uploading generated CSV to the staging table using PostgreSQL COPY.');
    await db.exec(read(webFolder+'00-create-upload-table.sql'));
    await db.query(`COPY public.${uploadTable}(record_type,record_no,payload_text) FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],
      {blob:new Blob([read(webFolder+'01-upload.csv')])});
    assert.equal((await db.query(read(webFolder+'02-check-upload.sql'))).rows[0].upload_status,'READY');
  }
  console.log('Dry-running all 4,602 source records.');
  await db.exec(runSQL(true));
  assert.equal(await scalar("SELECT to_regclass('public.timetable_sections')"),null);
  assert.deepEqual((await db.query('SELECT * FROM teachers ORDER BY id')).rows,baselineTeachers);
  console.log('Importing all records locally and checking source preservation and teacher identity.');
  await db.exec(runSQL(false));
  assert.equal(Number(await scalar('SELECT count(*) FROM timetable_sections')),4602);
  assert.equal(Number(await scalar('SELECT count(*) FROM timetable_meetings')),6979);
  const oldAfter=(await db.query("SELECT * FROM teachers WHERE id LIKE 'legacy_teacher_%' ORDER BY id")).rows;
  assert.equal(oldAfter.length,baselineTeachers.length);
  for(let i=0;i<oldAfter.length;i++) {
    const {college_id:oldCollege,...before}=baselineTeachers[i];
    const {college_id:newCollege,...after}=oldAfter[i];
    assert.deepEqual(after,before,`Only college may change: ${before.id}`);
  }
  assert.equal(Number(await scalar(`SELECT count(*) FROM (SELECT lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))
    FROM teachers GROUP BY 1 HAVING count(*)>1) d`)),0);
  assert.equal(Number(await scalar(`SELECT count(*) FROM course_offerings WHERE term_id='${historicalTerm}'`)),Number(baselineOfferings));
  const stored=(await db.query('SELECT selection_code,source_row FROM timetable_sections ORDER BY selection_code')).rows;
  const rawByCode=new Map(payload.sections.map(s=>[s.code,s.raw]));
  for(const s of stored) assert.deepEqual(s.source_row,rawByCode.get(s.selection_code));
  const times=(await db.query(`SELECT s.selection_code,m.source_index,m.weeks,m.weekday,m.period_start,m.period_end,m.group_label,
    m.raw_schedule,m.raw_location,r.name AS room,r.campus FROM timetable_meetings m
    JOIN timetable_sections s ON s.id=m.section_id LEFT JOIN timetable_classrooms r ON r.id=m.classroom_id`)).rows;
  const sectionMap=new Map(payload.sections.map(s=>[s.code,s]));
  for(const m of times) {
    const original=sectionMap.get(m.selection_code).meetings[m.source_index-1];
    for(const key of ['weeks','weekday','period_start','period_end','group_label','raw_schedule','raw_location','room']) assert.deepEqual(m[key],original[key]);
    if(m.room) assert.equal(m.campus,original.campus);
  }
  const updates=(await db.query(`SELECT t.id,t.name,a.name AS old_college,b.name AS new_college
    FROM timetable_college_updates u JOIN teachers t ON t.id=u.teacher_id
    LEFT JOIN colleges a ON a.id=u.old_college_id JOIN colleges b ON b.id=u.new_college_id ORDER BY t.name`)).rows;
  const status=(await db.query('SELECT match_status,count(*)::int AS count FROM timetable_teacher_links GROUP BY match_status ORDER BY match_status')).rows;
  const created=(await db.query("SELECT t.id,t.name,c.name AS college FROM teachers t JOIN colleges c ON c.id=t.college_id WHERE t.id LIKE 'timetable_%' ORDER BY t.name")).rows;
  const pending=(await db.query("SELECT * FROM timetable_teacher_links WHERE match_status='pending' ORDER BY source_name")).rows;
  const reused=Number(await scalar("SELECT count(DISTINCT teacher_id) FROM timetable_teacher_links WHERE teacher_id LIKE 'legacy_teacher_%'"));
  const countsBeforeRerun=(await db.query(`SELECT (SELECT count(*) FROM teachers) AS teachers,(SELECT count(*) FROM courses) AS courses,
    (SELECT count(*) FROM course_offerings) AS offerings,(SELECT count(*) FROM timetable_sections) AS sections,
    (SELECT count(*) FROM timetable_meetings) AS meetings,(SELECT count(*) FROM timetable_college_updates) AS updates`)).rows[0];
  console.log('Re-running the full import; verifying no extra pages, schedules or audit records.');
  await db.exec(runSQL(false));
  const countsAfter=(await db.query(`SELECT (SELECT count(*) FROM teachers) AS teachers,(SELECT count(*) FROM courses) AS courses,
    (SELECT count(*) FROM course_offerings) AS offerings,(SELECT count(*) FROM timetable_sections) AS sections,
    (SELECT count(*) FROM timetable_meetings) AS meetings,(SELECT count(*) FROM timetable_college_updates) AS updates`)).rows[0];
  assert.deepEqual(countsAfter,countsBeforeRerun);
  assert.deepEqual((await db.query("SELECT * FROM teachers WHERE id LIKE 'legacy_teacher_%' ORDER BY id")).rows,oldAfter);
  const result={passed:true,engine:'PGlite PostgreSQL',transport:webMode?'CSV upload staging plus small SQL':'SQL inline data',basis:'local 20260927 directory; not a live database snapshot',remoteWrites:false,
    ...payload.summary,baselineTeachers:baselineTeachers.length,baselineCourses:Number(baselineCourses),reusedTeachers:reused,
    newTeachers:created.length,existingTeacherCollegesUpdated:updates.filter(u=>u.id.startsWith('legacy_teacher_')).length,
    matchingStatus:status,counts:countsAfter,checks:{dryRunRolledBack:true,allSourceRowsPreserved:true,allMeetingsPreserved:true,
      existingTeacherIdsAndScoresUnchanged:true,historicalOfferingsPreserved:true,noDuplicateNormalizedTeacherNames:true,repeatImportAddedNothing:true}};
  const output=path.join(root,webMode?webFolder:'schule2026-2027-1/import-output');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'local-verification.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(output,'teacher-preview.json'),JSON.stringify({basis:result.basis,reusedTeachers:reused,newTeachers:created,collegeUpdates:updates,pending},null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {await db.close();}
