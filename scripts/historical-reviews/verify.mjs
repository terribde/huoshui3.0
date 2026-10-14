import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { root, previous, output, read, json, parseCSV, insert } from './common.mjs';
import { heXuan } from './confirmed-mappings.mjs';

const db = new PGlite();
const readOut = name=>read(path.join(output,name));
const readOld = name=>read(path.join(previous,name));
const {accepted,pending} = json(path.join(output,'mapping.json'));
const batchIds = new Set(accepted.map(r=>'legacy_review_'+r.source.id));
async function scalar(sql,params=[]) {return Object.values((await db.query(sql,params)).rows[0])[0];}
async function copy(table,file) {
  const data=read(file),columns=data.slice(0,data.indexOf('\n')).trim();
  await db.query(`COPY ${table}(${columns}) FROM '/dev/blob' WITH(FORMAT csv,HEADER true)`,[],{blob:new Blob([data])});
}
async function expectRejected(sql,pattern) {
  await assert.rejects(db.exec(sql),pattern);
  await db.exec('ROLLBACK');
}
try {
  console.log('Preparing isolated PostgreSQL with the existing schema and score triggers.');
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,email_confirmed_at TIMESTAMPTZ);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
  await db.exec(read(path.join(root,'supabase_schema.sql')));
  await db.exec(read(path.join(root,'supabase/migrations/20260926_community_v2.sql')));
  const catalog=json(path.join(previous,'catalog-snapshot.json'));
  for(const table of ['colleges','courses','terms','teachers']) if(catalog[table].length) await db.exec(insert('public.'+table,catalog[table]));
  await db.exec(readOld('00_prepare.sql'));
  await copy('public.teachers',path.join(previous,'teachers.csv'));
  // The previous batch's aggregates were already independently validated. Seed it
  // without N repeated aggregates, then enable the real trigger for every test.
  await db.exec('ALTER TABLE public.reviews DISABLE TRIGGER trg_recalc_teacher_scores');
  await copy('public.reviews',path.join(previous,'reviews.csv'));
  await db.exec('ALTER TABLE public.reviews ENABLE TRIGGER trg_recalc_teacher_scores');
  await db.exec(readOld('03_course_offerings.sql'));
  // Reproduce the live college from the user's diagnostic, not the old snapshot.
  await db.query('UPDATE public.teachers SET college_id=$1 WHERE id=$2',[heXuan.teacherCollegeId,heXuan.teacherId]);
  const fixture=accepted[0];
  for(let i=0;i<8;i++) await db.query(`INSERT INTO public.reviews(id,teacher_id,course_id,year_term,comment,status,rating_version,
    attendance_strictness,grading_leniency,effort_matters,workload_difficulty,approachability,teaching_quality)
    VALUES($1,$2,$3,'2026-2027-1',$4,'approved',2,4,2,3,1,5,2)`,
    ['local_existing_'+i,fixture.teacher.new_teacher_id,fixture.course.id,'已有新站评价 '+i]);
  const oldReviewRows=(await db.query('SELECT * FROM public.reviews ORDER BY id')).rows;
  const teacherRows=(await db.query('SELECT * FROM public.teachers ORDER BY id')).rows;
  const teachersBefore=new Map(teacherRows.map(r=>[r.id,r]));
  const pendingSourceIds=pending.map(r=>'legacy_review_'+r.source.id);
  const totalBefore=Number(await scalar('SELECT count(*) FROM public.reviews'));
  assert.equal(totalBefore,14438);
  const offeringsBefore=Number(await scalar('SELECT count(*) FROM public.course_offerings'));
  await db.exec(readOut('00-create-upload-table.sql'));
  await db.exec(readOut('00-create-upload-table.sql'));
  const table='public.legacy_review_upload_20261013';
  await copy(table,path.join(output,'01-upload-2115-ascii.csv'));
  assert.equal((await db.query(readOut('02-check-upload.sql'))).rows[0].upload_status,'READY');
  const diagnoseTeachers=()=>db.query(readOut('03a-diagnose-teachers.sql'));
  assert.equal((await diagnoseTeachers()).rows.length,0);
  // Confirmation is narrow: the old/wrong college, changed identity and missing
  // historical course evidence must still stop the transaction.
  await db.exec('BEGIN');
  await db.query('UPDATE public.teachers SET college_id=$1 WHERE id=$2',[heXuan.courseCollegeId,heXuan.teacherId]);
  const confirmedCollegeProblems=(await diagnoseTeachers()).rows;
  assert.equal(confirmedCollegeProblems.length,1);
  assert.equal(confirmedCollegeProblems[0].teacher_id,heXuan.teacherId);
  assert.equal(confirmedCollegeProblems[0].required_college_id,heXuan.teacherCollegeId);
  await expectRejected(readOut('03-dry-run.sql'),/Teacher identity, college/);
  await db.exec('BEGIN');
  await db.query('UPDATE public.teachers SET name=$1,rating_version=1 WHERE id=$2',['错误教师',heXuan.teacherId]);
  await expectRejected(readOut('03-dry-run.sql'),/Teacher identity, college/);
  await db.exec('BEGIN');
  await db.query('DELETE FROM public.course_offerings WHERE teacher_id=$1 AND course_id=$2',[heXuan.teacherId,heXuan.courseId]);
  await expectRejected(readOut('03-dry-run.sql'),/He Xuan historical course evidence missing/);
  assert.equal(Number(await scalar(`SELECT count(*) FROM ${table} WHERE source_id=ANY($1)`,[pending.map(r=>r.source.id)])),0);
  console.log('Checking dry run rollback, source fields, NULLs and all 2115 mappings.');
  await db.exec(readOut('03-dry-run.sql'));
  assert.equal(Number(await scalar('SELECT count(*) FROM public.reviews')),totalBefore);
  assert.deepEqual((await db.query('SELECT * FROM public.teachers ORDER BY id')).rows,teacherRows);
  assert.equal(Number(await scalar('SELECT count(*) FROM public.course_offerings')),offeringsBefore);
  const payload=(await db.query(`SELECT * FROM ${table} ORDER BY source_id LIMIT 1`)).rows[0];
  await db.query(`UPDATE ${table} SET payload_text=$1 WHERE source_id=$2`,[payload.payload_text.replace('旧站','故障测试'),payload.source_id]);
  // ASCII upload data is encoded; modify a visible source ID field in its JSON.
  await db.query(`UPDATE ${table} SET payload_text=jsonb_set(payload_text::jsonb,'{teacher_name}','"wrong"'::jsonb)::text WHERE source_id=$1`,[payload.source_id]);
  await expectRejected(readOut('04-import.sql'),/Upload incomplete or changed/);
  await db.query(`UPDATE ${table} SET payload_text=$1 WHERE source_id=$2`,[payload.payload_text,payload.source_id]);
  const collegeEntry=accepted.find(r=>r.category==='college' && r.teacher.new_teacher_id!==heXuan.teacherId);
  const oldCollege=teachersBefore.get(collegeEntry.teacher.new_teacher_id).college_id;
  const otherCollege=catalog.colleges.find(c=>c.id!==oldCollege).id;
  await db.query('UPDATE public.teachers SET college_id=$1 WHERE id=$2',[otherCollege,collegeEntry.teacher.new_teacher_id]);
  const collegeProblems=(await diagnoseTeachers()).rows;
  assert.equal(collegeProblems.length,1);
  assert.equal(collegeProblems[0].teacher_id,collegeEntry.teacher.new_teacher_id);
  assert.equal(collegeProblems[0].problem,'同名课程消歧所需学院不一致');
  assert.equal(collegeProblems[0].required_college_id,oldCollege);
  assert.equal(collegeProblems[0].current_college_id,otherCollege);
  await expectRejected(readOut('04-import.sql'),/Teacher identity, college/);
  await db.query('UPDATE public.teachers SET college_id=$1 WHERE id=$2',[oldCollege,collegeEntry.teacher.new_teacher_id]);
  await db.exec('BEGIN');
  await db.query('UPDATE public.teachers SET name=$1,rating_version=1 WHERE id=$2',['诊断测试姓名',collegeEntry.teacher.new_teacher_id]);
  const identityProblems=(await diagnoseTeachers()).rows;
  assert.equal(identityProblems.length,1);
  assert.equal(identityProblems[0].problem,'姓名不一致；评分版本不是 2');
  await db.exec('ROLLBACK');
  assert.equal((await diagnoseTeachers()).rows.length,0);
  assert.equal(Number(await scalar('SELECT count(*) FROM public.reviews')),totalBefore);
  await db.exec(readOut('04-import.sql'));
  assert.equal(Number(await scalar('SELECT count(*) FROM public.reviews')),16553);
  const reviewsAfter=(await db.query('SELECT * FROM public.reviews ORDER BY id')).rows;
  assert.deepEqual(reviewsAfter.filter(r=>!batchIds.has(r.id)),oldReviewRows);
  const afterById=new Map(reviewsAfter.map(r=>[r.id,r]));
  for(const {source,teacher,course} of accepted) {
    const r=afterById.get('legacy_review_'+source.id);
    assert.ok(r);
    assert.equal(r.teacher_id,teacher.new_teacher_id);assert.equal(r.course_id,course.id);
    assert.equal(r.comment,source.comment);
    assert.equal(Number(r.teaching_quality),Number(source.quality));
    assert.equal(Number(r.grading_leniency),Number(source.grading));
    assert.equal(Number(r.workload_difficulty),Number(source.workload));
    for(const f of ['attendance_strictness','effort_matters','approachability','user_id']) assert.equal(r[f],null);
    assert.equal(r.rating_version,2);assert.equal(r.is_historical_migrated,true);
    assert.equal(r.status,'approved');assert.equal(r.author_nickname,'旧站匿名用户');
    assert.equal(r.year_term,'历史学期(未标注具体学期)');
    assert.equal(new Date(r.created_at).toISOString(),new Date(source.updatedAt+'T00:00:00+08:00').toISOString());
  }
  assert.ok(pendingSourceIds.every(id=>!afterById.has(id)));
  const changedIds=new Set(accepted.map(r=>r.teacher.new_teacher_id));
  const teachersAfter=(await db.query('SELECT * FROM public.teachers ORDER BY id')).rows;
  for(const t of teachersAfter) {
    const before=teachersBefore.get(t.id);
    if(!changedIds.has(t.id)) assert.deepEqual(t,before);
    else {
      for(const f of ['attendance_strictness','effort_matters','approachability','name','college_id','title','campus','rating_version']) assert.deepEqual(t[f],before[f]);
    }
  }
  assert.equal(Number(await scalar('SELECT count(*) FROM public.point_transactions')),0);
  assert.equal(await scalar('SELECT college_id FROM public.teachers WHERE id=$1',[heXuan.teacherId]),heXuan.teacherCollegeId);
  assert.equal(await scalar('SELECT course_id FROM public.reviews WHERE id=$1',['legacy_review_'+heXuan.sourceId]),heXuan.courseId);
  const firstVerification=(await db.exec(readOut('05-verify.sql'))).find(r=>r.rows?.[0]?.batch_reviews_expected_2115)?.rows[0];
  assert.equal(Number(firstVerification.batch_reviews_expected_2115),2115);
  for(const key of ['invalid_reviews_expected_0','missing_offerings_expected_0','invalid_teacher_aggregates_expected_0']) assert.equal(Number(firstVerification[key]),0);
  const firstId=accepted[0].source.id;
  await db.query('UPDATE public.reviews SET likes=3 WHERE id=$1',['legacy_review_'+firstId]);
  const beforeRepeat=(await db.query('SELECT * FROM public.reviews ORDER BY id')).rows;
  const offersAfter=(await db.query('SELECT * FROM public.course_offerings ORDER BY id')).rows;
  await db.exec(readOut('04-import.sql'));
  assert.deepEqual((await db.query('SELECT * FROM public.reviews ORDER BY id')).rows,beforeRepeat);
  assert.deepEqual((await db.query('SELECT * FROM public.course_offerings ORDER BY id')).rows,offersAfter);
  const conflict=accepted[0].source.comment;
  await db.query('UPDATE public.reviews SET comment=$1 WHERE id=$2',['conflict','legacy_review_'+firstId]);
  await expectRejected(readOut('04-import.sql'),/existing review ID has different data/);
  await db.query('UPDATE public.reviews SET comment=$1 WHERE id=$2',[conflict,'legacy_review_'+firstId]);
  const result={passed:true,verifiedAt:new Date().toISOString(),engine:'PGlite PostgreSQL + repository schema/community v2',
    sourceRows:2189,acceptedRows:2115,pendingLocalOnly:74,uploadPendingRows:0,affectedTeachers:changedIds.size,
    newHistoricalOfferings:offersAfter.length-offeringsBefore,totalReviewsWithEightExisting:16553,
    exactSourceTextAndScores:true,nullDimensions:true,dryRunFullyRolledBack:true,repeatImportAddsNothing:true,
    alteredUploadRejected:true,changedCollegeRejected:true,conflictingReviewRejected:true,existingReviewsPreserved:true,
    confirmedHeXuanCollegePreserved:true,heXuanHistoricalCoursePreserved:true,missingHistoricalEvidenceRejected:true,
    existingNewDimensionsPreserved:true,unrelatedTeachersPreserved:true,pointsAwarded:0,verification:firstVerification,remoteWrites:0};
  fs.writeFileSync(path.join(output,'verification-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {await db.close();}
