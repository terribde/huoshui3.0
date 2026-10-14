import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { output, previous, json, read, parseCSV, csv, termName } from './common.mjs';
import { heXuan, requiredTeacherCollegeSQL } from './confirmed-mappings.mjs';

const uploadTable = 'legacy_review_upload_20261013';
const {accepted,pending,term} = json(path.join(output,'mapping.json'));
const analysis = json(path.join(output,'analysis.json'));
assert.equal(accepted.length,2115); assert.equal(pending.length,74);
const records = accepted.map(({source:r,teacher,course,category})=>({
  source_id:r.id,teacher_name:teacher.name.trim(),course_name:course.name.trim(),
  college_id_required:category==='college' ? teacher.college_id : null,
  review:{id:'legacy_review_'+r.id,teacher_id:teacher.new_teacher_id,course_id:course.id,
    year_term:termName,attendance_strictness:null,grading_leniency:Number(r.grading),effort_matters:null,
    workload_difficulty:Number(r.workload),approachability:null,teaching_quality:Number(r.quality),
    comment:r.comment,author_nickname:'旧站匿名用户',user_id:null,is_historical_migrated:true,
    status:'approved',created_at:r.updatedAt+'T00:00:00+08:00',likes:0,legacy_likes:0,rating_version:2},
}));
const uploadRows = records.map(r=>({source_id:r.source_id,payload_text:JSON.stringify(r).replace(/[^\x00-\x7f]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))}));
const uploadCSV = csv(uploadRows);
assert.ok(/^[\x00-\x7f]*$/.test(uploadCSV));
const digestSQL = `md5(string_agg(md5(source_id||chr(31)||payload_text::jsonb::text),'' ORDER BY source_id COLLATE "C"))`;
const db = new PGlite();
let digest;
try {
  await db.exec('CREATE TABLE upload(source_id text PRIMARY KEY,payload_text text NOT NULL)');
  await db.query(`COPY upload FROM '/dev/blob' WITH (FORMAT csv,HEADER true)`,[],{blob:new Blob([uploadCSV])});
  digest=(await db.query(`SELECT ${digestSQL} AS digest FROM upload`)).rows[0].digest;
} finally {await db.close();}
const fields = Object.keys(records[0].review);
// Likes can legitimately change after import. Reruns preserve them.
const stableFields = fields.filter(f=>!['likes','legacy_likes'].includes(f));
const mismatch = stableFields.map(f=>`r.${f} IS DISTINCT FROM e.${f}`).join(' OR\n    ');
const teacherCollege = '('+requiredTeacherCollegeSQL('m.data')+')';
const preflight = `SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(20261013,2115);
LOCK TABLE public.${uploadTable} IN SHARE MODE;
DO $check$ BEGIN
  IF (SELECT count(*) FROM public.${uploadTable})<>2115
    OR (SELECT ${digestSQL} FROM public.${uploadTable}) IS DISTINCT FROM '${digest}' THEN
    RAISE EXCEPTION 'Upload incomplete or changed: expected exactly 2115 verified records';
  END IF;
END $check$;
CREATE TEMP TABLE _new_metadata ON COMMIT DROP AS
  SELECT payload_text::jsonb AS data FROM public.${uploadTable};
CREATE TEMP TABLE _new_reviews ON COMMIT DROP AS
  SELECT r.* FROM _new_metadata m CROSS JOIN LATERAL jsonb_populate_record(NULL::public.reviews,m.data->'review') r;
ALTER TABLE _new_reviews ADD PRIMARY KEY(id);
CREATE TEMP TABLE _new_teacher_ids ON COMMIT DROP AS SELECT DISTINCT teacher_id FROM _new_reviews;
-- Keep checks and insertion consistent with concurrent edits.
LOCK TABLE public.teachers,public.reviews,public.courses,public.terms,public.course_offerings IN SHARE ROW EXCLUSIVE MODE;
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.terms WHERE id='${term.id}' AND year_term='${termName}' AND NOT is_current) THEN
    RAISE EXCEPTION 'Historical term missing or changed';
  END IF;
  IF EXISTS(SELECT 1 FROM _new_metadata m LEFT JOIN public.teachers t ON t.id=m.data->'review'->>'teacher_id'
    WHERE t.id IS NULL OR btrim(t.name,E' \\t\\r\\n') IS DISTINCT FROM m.data->>'teacher_name' OR t.rating_version IS DISTINCT FROM 2
      OR (${teacherCollege} IS NOT NULL AND t.college_id::text IS DISTINCT FROM ${teacherCollege})) THEN
    RAISE EXCEPTION 'Teacher identity, college or rating version changed; do not guess a replacement';
  END IF;
  IF EXISTS(SELECT 1 FROM _new_metadata m LEFT JOIN public.courses c ON c.id=(m.data->'review'->>'course_id')::uuid
    WHERE c.id IS NULL OR btrim(c.name,E' \\t\\r\\n') IS DISTINCT FROM m.data->>'course_name'
      OR (m.data->>'college_id_required' IS NOT NULL AND c.college_id::text IS DISTINCT FROM m.data->>'college_id_required')) THEN
    RAISE EXCEPTION 'Course identity or college changed; do not guess a replacement';
  END IF;
  -- User-confirmed teacher college; course retained only with historical evidence.
  IF NOT EXISTS(SELECT 1 FROM public.reviews WHERE teacher_id='${heXuan.teacherId}'
      AND course_id='${heXuan.courseId}' AND is_historical_migrated IS TRUE
      AND id IN (${heXuan.priorReviewIds.map(id=>"'"+id+"'").join(',')}))
    OR NOT EXISTS(SELECT 1 FROM public.course_offerings WHERE teacher_id='${heXuan.teacherId}'
      AND course_id='${heXuan.courseId}' AND term_id='${term.id}') THEN
    RAISE EXCEPTION 'He Xuan historical course evidence missing; do not guess a replacement';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reviews'::regclass
    AND tgname='trg_recalc_teacher_scores' AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'Teacher score trigger is missing or disabled';
  END IF;
  IF EXISTS(SELECT 1 FROM _new_reviews e JOIN public.reviews r USING(id) WHERE ${mismatch}) THEN
    RAISE EXCEPTION 'An existing review ID has different data: aborting without overwriting';
  END IF;
END $check$;
CREATE TEMP TABLE _new_import_before ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM public.reviews) AS reviews,
  (SELECT count(*) FROM public.course_offerings) AS offerings,
  (SELECT count(*) FROM public.point_transactions) AS points,
  (SELECT count(*) FROM _new_reviews e JOIN public.reviews r USING(id)) AS already_present;
`;
const aggregateCheck = `WITH a AS (
  SELECT r.teacher_id,count(*) AS n,
    round(avg(r.attendance_strictness),1) AS attendance_strictness,
    round(avg(r.grading_leniency),1) AS grading_leniency,
    round(avg(r.effort_matters),1) AS effort_matters,
    round(avg(r.workload_difficulty),1) AS workload_difficulty,
    round(avg(r.approachability),1) AS approachability,
    round(avg(r.teaching_quality),1) AS teaching_quality,
    round(avg((coalesce(r.attendance_strictness,0)+coalesce(r.grading_leniency,0)+coalesce(r.effort_matters,0)+
      coalesce(r.workload_difficulty,0)+coalesce(r.approachability,0)+coalesce(r.teaching_quality,0))/
      nullif((r.attendance_strictness IS NOT NULL)::int+(r.grading_leniency IS NOT NULL)::int+(r.effort_matters IS NOT NULL)::int+
      (r.workload_difficulty IS NOT NULL)::int+(r.approachability IS NOT NULL)::int+(r.teaching_quality IS NOT NULL)::int,0)),1) AS overall_score
  FROM public.reviews r JOIN _new_teacher_ids i ON i.teacher_id=r.teacher_id WHERE r.status='approved' GROUP BY r.teacher_id
) SELECT count(*) FROM a JOIN public.teachers t ON t.id=a.teacher_id WHERE
  t.review_count IS DISTINCT FROM a.n OR NOT t.has_historical_data OR
  ${['overall_score','attendance_strictness','grading_leniency','effort_matters','workload_difficulty','approachability','teaching_quality'].map(f=>`(a.${f} IS NOT NULL AND t.${f} IS DISTINCT FROM a.${f})`).join(' OR\n  ')}`;
const body = `INSERT INTO public.reviews (${fields.join(',')})
SELECT ${fields.map(f=>'e.'+f).join(',')} FROM _new_reviews e
WHERE NOT EXISTS(SELECT 1 FROM public.reviews r WHERE r.id=e.id);
INSERT INTO public.course_offerings(teacher_id,course_id,term_id)
SELECT DISTINCT e.teacher_id,e.course_id,'${term.id}'::uuid FROM _new_reviews e
WHERE NOT EXISTS(SELECT 1 FROM public.course_offerings o
  WHERE o.teacher_id=e.teacher_id AND o.course_id=e.course_id AND o.term_id='${term.id}');
UPDATE public.teachers t SET has_historical_data=true FROM _new_teacher_ids i
WHERE t.id=i.teacher_id AND NOT t.has_historical_data;
DO $verify$ BEGIN
  IF (SELECT count(*) FROM public.reviews)<>(SELECT reviews+2115-already_present FROM _new_import_before) THEN
    RAISE EXCEPTION 'Review total changed unexpectedly'; END IF;
  IF (SELECT count(*) FROM _new_reviews e JOIN public.reviews r USING(id))<>2115
    OR EXISTS(SELECT 1 FROM _new_reviews e JOIN public.reviews r USING(id) WHERE ${mismatch}) THEN
    RAISE EXCEPTION 'Imported review content mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM _new_reviews e WHERE NOT EXISTS(SELECT 1 FROM public.course_offerings o
    WHERE o.teacher_id=e.teacher_id AND o.course_id=e.course_id AND o.term_id='${term.id}')) THEN
    RAISE EXCEPTION 'Missing historical course offering'; END IF;
  IF (SELECT count(*) FROM public.point_transactions)<>(SELECT points FROM _new_import_before) THEN
    RAISE EXCEPTION 'Unexpected reward entries'; END IF;
  IF (${aggregateCheck})<>0 THEN RAISE EXCEPTION 'Teacher aggregate verification failed'; END IF;
END $verify$;
SELECT 2115 AS batch_verified,(SELECT already_present FROM _new_import_before) AS already_present,
  2115-(SELECT already_present FROM _new_import_before) AS inserted_reviews,
  (SELECT count(*) FROM public.reviews) AS total_reviews_after,
  (SELECT count(*) FROM public.course_offerings)-(SELECT offerings FROM _new_import_before) AS added_historical_offerings,
  (SELECT count(*) FROM _new_teacher_ids) AS affected_teachers;
`;
const verification = `BEGIN;
${preflight}
SELECT (SELECT count(*) FROM _new_reviews e JOIN public.reviews r USING(id)) AS batch_reviews_expected_2115,
  (SELECT count(*) FROM _new_reviews e JOIN public.reviews r USING(id) WHERE ${mismatch}) AS invalid_reviews_expected_0,
  (SELECT count(*) FROM _new_reviews e WHERE NOT EXISTS(SELECT 1 FROM public.course_offerings o
    WHERE o.teacher_id=e.teacher_id AND o.course_id=e.course_id AND o.term_id='${term.id}')) AS missing_offerings_expected_0,
  (${aggregateCheck}) AS invalid_teacher_aggregates_expected_0,
  (SELECT count(*) FROM public.reviews WHERE id LIKE 'legacy_review_%') AS legacy_reviews_expected_16545,
  (SELECT count(*) FROM public.reviews) AS total_reviews;
ROLLBACK;
`;
const files = {
  '03a-diagnose-teachers.sql':read(new URL('./diagnose-teachers.sql',import.meta.url)).replace('/* REQUIRED_TEACHER_COLLEGE */',requiredTeacherCollegeSQL('payload_text::jsonb')),
  '00-create-upload-table.sql':`-- Only creates restricted staging for 2115 accepted reviews.\nBEGIN;\nCREATE TABLE IF NOT EXISTS public.${uploadTable}(source_id text PRIMARY KEY,payload_text text NOT NULL);\nALTER TABLE public.${uploadTable} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public.${uploadTable} FROM PUBLIC,anon,authenticated;\nCOMMIT;\nSELECT '${uploadTable}' AS upload_target,2115 AS expected_rows;\n`,
  '01-upload-2115-ascii.csv':uploadCSV,
  '02-check-upload.sql':`SELECT CASE WHEN count(*)=2115 AND ${digestSQL}='${digest}' THEN 'READY' ELSE 'NOT_READY' END AS upload_status,count(*) AS uploaded_rows,2115 AS expected_rows FROM public.${uploadTable};\n`,
  '03-dry-run.sql':`-- Simulate the entire import, then roll back business changes.\nBEGIN;\n${preflight}${body}ROLLBACK;\n`,
  '04-import.sql':`-- Append only 2115 accepted reviews. All checks must pass before COMMIT.\nBEGIN;\n${preflight}${body}COMMIT;\n`,
  '05-verify.sql':verification,
};
const local = path.join(output,'local-only'); fs.mkdirSync(local,{recursive:true});
const collegeNames = new Map(json(path.join(previous,'catalog-snapshot.json')).colleges.map(c=>[c.id,c.name]));
fs.writeFileSync(path.join(local,'待处理74条-不要上传.csv'),csv(pending.map(r=>({...r.source,
  hold_reason:r.reason,teacher_matched:r.teacher?.new_teacher_id||'',
  candidate_courses:JSON.stringify(r.candidateCourses.map(c=>({...c,college_name:collegeNames.get(c.college_id)||'未标注学院'}))),
  candidate_teachers:JSON.stringify(r.candidateTeachers)}))));
fs.writeFileSync(path.join(local,'已确认2115条映射.csv'),csv(accepted.map(r=>({source_id:r.source.id,
  old_teacher_id:r.source.teacherId,source_name:r.source.prof,teacher_id:r.teacher.new_teacher_id,
  teacher_name:r.teacher.name,course:r.course.name,course_id:r.course.id,
  confirmed_teacher_college:r.source.id===heXuan.sourceId ? heXuan.teacherCollegeName : '',
  method:r.source.id===heXuan.sourceId ? '用户确认保留信息科学与技术学院；课程沿用上一批评价及历史授课关联' : r.reason}))));
for(const [name,text] of Object.entries(files)) fs.writeFileSync(path.join(output,name),text,'utf8');
const previousOfferings = parseCSV(read(path.join(previous,'course_offerings.csv')));
const existingPairs = new Set(previousOfferings.map(r=>r.teacher_id+':'+r.course_id));
const newPairs = new Set(records.map(r=>r.review.teacher_id+':'+r.review.course_id).filter(k=>!existingPairs.has(k)));
const manifest = {...analysis,revision:'he-xuan-confirmed-college',confirmedMappings:[heXuan],uploadTable,uploadRows:2115,stagedPendingRows:0,semanticChecksum:digest,
  potentialNewHistoricalOfferings:newPairs.size,files:Object.fromEntries(Object.entries(files).map(([name,text])=>[name,{bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')}])),remoteWrites:0};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,uploadRows:2115,pendingLocalOnly:74,teachers:analysis.teacherCount,potentialNewHistoricalOfferings:newPairs.size,files:manifest.files},null,2));
