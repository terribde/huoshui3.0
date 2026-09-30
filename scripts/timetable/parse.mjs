import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const sourceKey = (department, name) => JSON.stringify([department, name]);
export const compact = text => text.trim().replace(/\s+/g, ' ');
export const normalizedName = text => compact(text).toLowerCase();
export const campusName = text => text.endsWith('校区') ? text : `${text}校区`;

// RFC 4180 fields, including BOM, quoted commas, escaped quotes and newlines.
export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, '');
  const records = []; let row = [], field = '', state = 'start';
  const finishField = () => { row.push(field); field = ''; state = 'start'; };
  const finishRow = () => { finishField(); records.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') state = 'closed';
      else field += c;
    } else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (state === 'start' && c === '"') state = 'quoted';
    else {
      assert.notEqual(state, 'closed', 'CSV: unexpected characters after closing quote');
      assert.notEqual(c, '"', 'CSV: unexpected quote in unquoted field');
      field += c; state = 'plain';
    }
  }
  assert.notEqual(state, 'quoted', 'CSV: unclosed quoted field');
  if (row.length || field || state === 'closed') finishRow();
  const headers = records.shift();
  assert.ok(headers?.length, 'CSV is empty');
  assert.equal(new Set(headers).size, headers.length, 'CSV duplicate headers');
  return records.map((values, index) => {
    assert.equal(values.length, headers.length, `CSV record ${index + 2}: column count mismatch`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

export function parseWeeks(value) {
  const match = value.match(/^([\d、,，-]+)周(?:[（(]?([单双])周?[）)]?)?$/);
  assert.ok(match, `Unknown week expression: ${value}`);
  const weeks = new Set();
  for (const part of match[1].split(/[、,，]/)) {
    const range = part.match(/^(\d+)(?:-(\d+))?$/);
    assert.ok(range, `Invalid week: ${part}`);
    const start = Number(range[1]), end = Number(range[2] ?? start);
    assert.ok(start >= 1 && end <= 53 && end >= start, `Invalid week range: ${part}`);
    for (let n = start; n <= end; n++) {
      if (!match[2] || n % 2 === (match[2] === '单' ? 1 : 0)) weeks.add(n);
    }
  }
  assert.ok(weeks.size, `Empty weeks: ${value}`);
  return [...weeks].sort((a, b) => a - b);
}

const schedulePattern = () => /([\d、,，-]+周(?:[（(]?[单双]周?[）)]?)?)(?:\s+星期([一二三四五六日天])\s+(\d+)(?:-(\d+))?节)?/g;

export function parseSchedule(row) {
  const combined = row['时间地点'].trim();
  if (!combined) {
    assert.equal(row['上课周次节次'].trim(), '', `${row['选课编号']}: missing combined schedule`);
    assert.equal(row['上课地点'].trim(), '', `${row['选课编号']}: location without schedule`);
    return [];
  }
  const matches = [...combined.matchAll(schedulePattern())];
  assert.ok(matches.length && !combined.slice(0, matches[0].index).trim(), `Unparsed schedule: ${combined}`);
  const meetings = matches.map((match, i) => {
    const rawLocation = combined.slice(match.index + match[0].length, matches[i + 1]?.index ?? combined.length).trim();
    let room = rawLocation, campus = campusName(row['校区']), teacherName = null, groupLabel = null;
    if (rawLocation.includes('(') || rawLocation.includes('（')) {
      const location = rawLocation.match(/^(.*?)\s*[（(]([^()（）]+)[）)](?:\s*[（(]([^()（）]+)[）)])?$/);
      assert.ok(location, `${row['选课编号']}: unrecognized location: ${rawLocation}`);
      room = compact(location[1]);
      const suffixes = location.slice(2).filter(Boolean).map(compact);
      for (const suffix of suffixes) {
        if (/^(九里|犀浦|峨眉|东部)(校区)?$/.test(suffix)) campus = campusName(suffix);
        else if (/^G\d+$/i.test(suffix)) groupLabel = suffix;
        else { assert.equal(teacherName, null, 'Multiple teacher annotations'); teacherName = suffix; }
      }
    }
    if (/^Online$/i.test(room)) { room = 'Online'; campus = '线上'; }
    if (/^TBC$/i.test(room)) room = '';
    if (/^(九里|犀浦|峨眉|东部)/.test(room)) campus = campusName(room.match(/^(九里|犀浦|峨眉|东部)/)[1]);
    const start = match[3] ? Number(match[3]) : null;
    const end = match[3] ? Number(match[4] ?? match[3]) : null;
    assert.ok(start === null || start >= 1 && end >= start && end <= 24, 'Invalid lesson periods');
    // Reject leftovers that look like malformed scheduling rather than a classroom.
    assert.ok(!/[周节]|星期/.test(room), `${row['选课编号']}: unparsed schedule suffix: ${room}`);
    return { index: i + 1, weeks: parseWeeks(match[1]), weekday: match[2] ? '一二三四五六日'.indexOf(match[2].replace('天', '日')) + 1 : null,
      period_start: start, period_end: end, room: room || null, campus, teacher_name: teacherName, group_label: groupLabel,
      raw_schedule: match[0], raw_location: rawLocation };
  });
  assert.equal(compact(matches.map(m => m[0]).join(' ')), compact(row['上课周次节次']), `${row['选课编号']}: schedule columns disagree`);
  assert.equal(compact(meetings.map(m => m.raw_location).filter(Boolean).join(' ')), compact(row['上课地点']), `${row['选课编号']}: location columns disagree`);
  return meetings;
}

export function buildPayload(rows, config) {
  assert.ok(rows.length, 'No source records');
  const required = ['序号','选课编号','课程代码','课程名称','教学班','学分','性质','开课','教师','职称','时间地点','优选','已选/容量','校区','学期','上课周次节次','上课地点','教师主页'];
  for (const key of required) assert.ok(Object.hasOwn(rows[0], key), `Missing column: ${key}`);
  assert.equal(typeof config.setCurrentTerm, 'boolean');
  const seen = new Set(), teachers = new Map(), courses = new Map(), classNames = new Map(), issues = [], sections = [];
  const addIssue = (code, type, detail) => issues.push({ selection_code: code, type, detail });
  const teacher = (name, row, isPrimary) => {
    if (!name) return null;
    const key = sourceKey(row['开课'].trim(), name);
    if (!teachers.has(key)) teachers.set(key, { key, name, normalized_name: normalizedName(name), department: row['开课'].trim(), college: config.collegeAliases[row['开课'].trim()] || null,
      title: '未知', campuses: [], homepages: [], override: config.teacherOverrides?.[key] ?? null,
      new_id: `timetable_${hash(normalizedName(name)).slice(0, 24)}` });
    const t = teachers.get(key);
    if (isPrimary && row['职称'].trim()) t.title = row['职称'].trim();
    const campus = campusName(row['校区'].trim());
    if (!t.campuses.includes(campus)) t.campuses.push(campus);
    if (isPrimary && row['教师主页'].trim() && !t.homepages.includes(row['教师主页'].trim())) t.homepages.push(row['教师主页'].trim());
    return key;
  };
  for (const raw of rows) {
    const code = raw['选课编号'].trim(), department = raw['开课'].trim();
    assert.equal(raw['学期'].trim(), config.term, `${code}: unexpected term`);
    for (const key of ['选课编号','课程代码','课程名称','开课','校区']) assert.ok(raw[key].trim(), `${code}: empty ${key}`);
    assert.ok(!seen.has(code), `Duplicate selection code: ${code}`); seen.add(code);
    assert.ok(/^\d+(?:\.\d+)?$/.test(raw['学分']), `${code}: invalid credits`);
    const capacity = raw['已选/容量'].match(/^(\d+)\/(-1|\d+)$/);
    assert.ok(capacity, `${code}: invalid enrollment/capacity`);
    if (capacity[2] === '-1') addIssue(code, 'unknown_capacity', '原始容量为 -1，结构化容量留空，不推定为无限容量');
    const courseKey = sourceKey(department, raw['课程代码'].trim());
    const course = { key: courseKey, code: raw['课程代码'].trim(), name: raw['课程名称'].trim(), department,
      college: config.collegeAliases[department] || null, override: config.courseOverrides?.[courseKey] ?? null };
    if (courses.has(courseKey)) assert.deepEqual(courses.get(courseKey), course, `${code}: conflicting course code`);
    else courses.set(courseKey, course);
    const meetings = parseSchedule(raw);
    for (const m of meetings) m.teacher_key = teacher(m.teacher_name, raw, false);
    const primaryKey = teacher(raw['教师'].trim(), raw, true);
    const codes = raw['教学班'].split(/[,，]/).map(x => x.trim()).filter(Boolean);
    const names = raw['优选'].split(/[,，]/).map(x => x.trim()).filter(Boolean);
    const pairs = codes.length === names.length && names.every(x => x.endsWith('班'));
    if (codes.length && !pairs) addIssue(code, 'class_names_unmatched', '班级编号已保留；优选不是可逐项对应的班级名');
    const classes = codes.map((classCode, i) => {
      const name = pairs ? names[i] : null;
      if (!classNames.has(classCode)) classNames.set(classCode, new Set());
      if (name) classNames.get(classCode).add(name);
      return { code: classCode, name };
    });
    if (!meetings.length) addIssue(code, 'missing_schedule', '原始课表未提供时间');
    else if (meetings.every(m => m.weekday === null)) addIssue(code, 'weeks_only', '仅提供周次，星期和节次留空');
    if (!primaryKey) addIssue(code, 'missing_teacher', '原始课表未提供课程教师');
    for (let i = 0; i < meetings.length; i++) for (let j = i + 1; j < meetings.length; j++) {
      const a = meetings[i], b = meetings[j];
      if (a.weekday && a.weekday === b.weekday && a.period_start <= b.period_end && b.period_start <= a.period_end && a.weeks.some(w => b.weeks.includes(w))) {
        addIssue(code, 'overlapping_meetings', `第 ${a.index}、${b.index} 段有重叠，原样保留，不能自动认定哪段有效`);
      }
    }
    sections.push({ code, course_key: courseKey, teacher_key: primaryKey, department, credits: Number(raw['学分']), nature: raw['性质'],
      campus: campusName(raw['校区'].trim()), enrolled: Number(capacity[1]), capacity: capacity[2] === '-1' ? null : Number(capacity[2]),
      preferred: raw['优选'], classes, meetings, raw, row_hash: hash(JSON.stringify(raw)) });
  }
  const classes = [...classNames].map(([code, names]) => {
    if (names.size > 1) addIssue(null, 'class_name_conflict', `${code}: ${[...names].join(' / ')}；公共班级名留空，各开课关联保留原名`);
    return { code, name: names.size === 1 ? [...names][0] : null };
  });
  for (const key of Object.keys(config.teacherOverrides || {})) assert.ok(teachers.has(key), `Unused teacher override: ${key}`);
  for (const key of Object.keys(config.courseOverrides || {})) assert.ok(courses.has(key), `Unused course override: ${key}`);
  // A teacher seen in several source departments gets one page. Derive new
  // profile metadata from the entire file, not whichever department sorts first.
  const profiles = new Map();
  for (const t of teachers.values()) {
    if (!profiles.has(t.normalized_name)) profiles.set(t.normalized_name,{ titles:new Set(), campuses:new Set() });
    const p = profiles.get(t.normalized_name);
    if (t.title !== '未知') p.titles.add(t.title);
    for (const campus of t.campuses) p.campuses.add(campus);
  }
  for (const t of teachers.values()) {
    const p = profiles.get(t.normalized_name);
    t.new_title = p.titles.size === 1 ? [...p.titles][0] : '未知';
    t.new_campus = p.campuses.size === 1 ? [...p.campuses][0] : '多校区';
  }
  const summary = { sourceRows: rows.length, courseCodes: new Set([...courses.values()].map(c => c.code)).size,
    departmentCourseKeys: courses.size, teacherSourceKeys: teachers.size, classes: classes.length,
    meetings: sections.reduce((n, s) => n + s.meetings.length, 0), explicitMeetingTeachers: sections.reduce((n, s) => n + s.meetings.filter(m => m.teacher_key).length, 0),
    issues: Object.fromEntries([...new Set(issues.map(i => i.type))].map(type => [type, issues.filter(i => i.type === type).length])) };
  return { term: config.term, source_digest: hash(JSON.stringify(rows)), config_digest:hash(JSON.stringify(config)),
    set_current: config.setCurrentTerm, teachers: [...teachers.values()].sort((a,b)=>a.key.localeCompare(b.key)),
    courses: [...courses.values()], classes, sections, issues, summary };
}
