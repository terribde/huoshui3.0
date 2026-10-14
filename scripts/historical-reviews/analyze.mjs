import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { previous, output, parseCSV, read, json, termName } from './common.mjs';

const sourceFile = process.argv[2] || 'C:/Users/terribde/Downloads/comments_new_only.csv';
const bytes = fs.readFileSync(sourceFile);
const source = parseCSV(bytes.toString('utf8'));
const oldReviews = parseCSV(read(path.join(previous,'originals/comments.csv')));
const oldTeachers = parseCSV(read(path.join(previous,'teacher-mapping-and-snapshot.csv')));
const courses = parseCSV(read(path.join(previous,'courses-reference.csv'))).map(c=>({...c,college_id:c.college_id||null}));
const oldCatalog = json(path.join(previous,'catalog-snapshot.json'));
const livePath = path.join(output,'catalog-snapshot.json');
const current = fs.existsSync(livePath) ? json(livePath) : null;
const oldIds = new Set(oldReviews.map(r=>r.id));
const oldById = new Map(oldTeachers.map(t=>[t.old_teacher_id,t]));
const teacherCourses = new Map(oldTeachers.map(t=>[t.new_teacher_id,new Set(t.raw_courses.split('|').map(s=>s.trim()).filter(Boolean))]));
for(const r of oldReviews) teacherCourses.get('legacy_teacher_'+r.teacherId).add(r.course.trim());
const coursesByName = new Map();
for(const c of courses) {
  if(!coursesByName.has(c.name.trim())) coursesByName.set(c.name.trim(),[]);
  coursesByName.get(c.name.trim()).push(c);
}
const categories = {direct:'旧教师 ID 和课程唯一对应',college:'按教师学院确定同名课程',remapped:'姓名及旧课程唯一对应已有教师',unknown_teacher:'教师无法对应',new_teacher_and_course:'教师和课程都需新增',ambiguous_course:'课程候选不明确',new_course:'已有教师但需要新增课程'};
assert.equal(source.length,2189);
assert.equal(new Set(source.map(r=>r.id)).size,2189);
assert.equal(source.filter(r=>oldIds.has(r.id)).length,0);
const mapped = [];
for(const row of source) {
  for(const field of ['id','teacherId','prof','course','overall','quality','grading','workload','comment','updatedAt','source']) assert.ok(row[field],`${row.id}: missing ${field}`);
  assert.match(row.id,/^[a-zA-Z0-9_-]+$/);
  for(const field of ['quality','grading','workload']) {
    assert.ok(Number(row[field])>=1 && Number(row[field])<=5,`${row.id}: ${field}`);
    assert.equal(Number(row[field])*10,Math.round(Number(row[field])*10),'Unsupported score precision');
  }
  assert.equal(Number(row.overall),Number(row.quality)+Number(row.grading)+Number(row.workload));
  assert.match(row.updatedAt,/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  assert.equal(new Date(row.updatedAt).toISOString().slice(0,10),row.updatedAt);
  let teacher = oldById.get(row.teacherId);
  let teacherMethod = 'legacy_id';
  const nameMatches = oldTeachers.filter(t=>t.name.trim()===row.prof.trim());
  if(teacher) assert.equal(teacher.name.trim(),row.prof.trim(),`Teacher ID/name conflict: ${row.id}`);
  else {
    const matches = nameMatches.filter(t=>teacherCourses.get(t.new_teacher_id).has(row.course.trim()));
    if(matches.length===1) { teacher=matches[0]; teacherMethod='name_and_old_course'; }
  }
  const candidates = coursesByName.get(row.course.trim()) || [];
  let course = candidates.length===1 ? candidates[0] : null;
  if(teacher && candidates.length>1) {
    const matches = candidates.filter(c=>c.college_id===teacher.college_id);
    if(matches.length===1) course=matches[0];
  }
  const category = !teacher ? (candidates.length>1?'ambiguous_course':candidates.length?'unknown_teacher':'new_teacher_and_course')
    : !course ? (candidates.length?'ambiguous_course':'new_course')
    : teacherMethod==='name_and_old_course' ? 'remapped' : candidates.length>1 ? 'college' : 'direct';
  mapped.push({source:row,category,reason:categories[category],teacherMethod,teacher:teacher||null,course,
    candidateTeachers:nameMatches.map(t=>({id:t.new_teacher_id,name:t.name,college_id:t.college_id,college_name:t.college_name})),
    candidateCourses:candidates});
}
const counts = Object.fromEntries(Object.keys(categories).map(k=>[k,mapped.filter(r=>r.category===k).length]));
const accepted = mapped.filter(r=>['direct','college','remapped'].includes(r.category));
const pending = mapped.filter(r=>!accepted.includes(r));
console.log(JSON.stringify({counts,accepted:accepted.length,pending:pending.length,
  pendingGroups:[...new Set(pending.map(r=>r.category+': '+r.source.prof+' / '+r.source.course.trim()))],
  knownNameUnresolved: pending.filter(r=>r.category==='unknown_teacher' && r.candidateTeachers.length).map(r=>({id:r.source.id,name:r.source.prof,course:r.source.course,candidates:r.candidateTeachers}))},null,2));
assert.deepEqual(counts,{direct:1947,college:21,remapped:147,unknown_teacher:41,new_teacher_and_course:19,ambiguous_course:9,new_course:5});
assert.equal(accepted.length,2115);assert.equal(pending.length,74);
const term = oldCatalog.terms.find(t=>t.year_term===termName && !t.is_current);
assert.ok(term,'Historical term must exist');
if(current) {
  for(const r of accepted) {
    const t = current.teachers.find(t=>t.id===r.teacher.new_teacher_id);
    assert.ok(t && t.name===r.teacher.name,'Current teacher mismatch: '+r.source.id);
    if(r.category==='college') assert.equal(t.college_id,r.teacher.college_id,'Current college changed');
    const c = current.courses.find(c=>c.id===r.course.id);
    assert.ok(c && c.name.trim()===r.course.name.trim() && c.college_id===r.course.college_id,'Current course mismatch: '+r.source.id);
    assert.ok(!current.reviews.some(v=>v.id==='legacy_review_'+r.source.id),'Already imported: '+r.source.id);
  }
}
fs.mkdirSync(path.join(output,'originals'),{recursive:true});
fs.writeFileSync(path.join(output,'originals/comments_new_only.csv'),bytes);
fs.writeFileSync(path.join(output,'mapping.json'),JSON.stringify({accepted,pending,term},null,2)+'\n');
fs.writeFileSync(path.join(output,'analysis.json'),JSON.stringify({analyzedAt:new Date().toISOString(),sourceRows:source.length,sourceUniqueIds:2189,overlapWithPreviousBatch:0,validScores:2189,counts,accepted:accepted.length,pending:pending.length,
  teacherCount:new Set(accepted.map(r=>r.teacher.new_teacher_id)).size,courseCount:new Set(accepted.map(r=>r.course.id)).size,
  sourceSHA256:createHash('sha256').update(bytes).digest('hex'),host:oldCatalog.host,liveCatalogChecked:!!current,remoteWrites:0},null,2)+'\n');
