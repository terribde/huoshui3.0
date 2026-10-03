import { SCHEDULE_SELECT, buildTimetableSections } from './timetable.mjs';

export const TEACHER_SELECT = '*,colleges(id,name),course_offerings(course_id,courses(id,name),term_id,terms(id,year_term,is_current))';
export const REVIEW_SELECT = 'id,teacher_id,course_id,year_term,attendance_strictness,grading_leniency,effort_matters,workload_difficulty,approachability,teaching_quality,comment,author_nickname,is_historical_migrated,status,created_at,likes,rating_version,courses(id,name),teachers(name)';

const teacherFields = ['id', 'name', 'title', 'college', 'college_id', 'campus', 'courses',
  'is_teaching_this_term', 'overall_score', 'review_count', 'attendance_strictness',
  'grading_leniency', 'effort_matters', 'workload_difficulty', 'approachability',
  'teaching_quality', 'has_historical_data', 'tags', 'recent_term_courses', 'rating_version'];
const reviewFields = ['id', 'teacher_id', 'course_id', 'year_term', 'attendance_strictness',
  'grading_leniency', 'effort_matters', 'workload_difficulty', 'approachability',
  'teaching_quality', 'comment', 'author_nickname', 'is_historical_migrated', 'status',
  'created_at', 'likes', 'rating_version'];
const pick = (row, fields) => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]));

export function publicTeacher(row) {
  return { ...pick(row, teacherFields),
    colleges: row.colleges ? pick(row.colleges, ['id', 'name']) : null,
    course_offerings: (row.course_offerings || []).map(off => ({
      ...pick(off, ['course_id', 'term_id']),
      courses: off.courses ? pick(off.courses, ['id', 'name']) : null,
      terms: off.terms ? pick(off.terms, ['id', 'year_term', 'is_current']) : null,
    })),
  };
}

export function publicReview(row) {
  if (!row || row.status !== 'approved') return null;
  return { ...pick(row, reviewFields),
    courses: row.courses ? pick(row.courses, ['id', 'name']) : null,
    teachers: row.teachers ? pick(row.teachers, ['name']) : null,
  };
}

// Count and stable ID ordering detect truncated pages before a snapshot is published.
export async function readAll(loadPage) {
  const rows = [];
  let total;
  let pageSize = 500;
  do {
    const result = await loadPage(rows.length, rows.length + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data)) throw new Error('Incomplete database response');
    if (total === undefined) {
      if (!Number.isSafeInteger(result.count)) throw new Error('Missing database count');
      total = result.count;
      pageSize = result.data.length || pageSize;
    }
    if (result.data.length !== Math.min(pageSize, total - rows.length)) {
      throw new Error('Database changed during snapshot; retry required');
    }
    rows.push(...result.data);
  } while (rows.length < total);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate snapshot rows');
  return rows;
}

export function createSource(client) {
  return {
    async terms() {
      return readAll((from, to) => client.from('terms').select('id,year_term,is_current',
        { count: from === 0 ? 'exact' : undefined }).order('id').range(from, to));
    },
    async timetable(termId) {
      const rows = await readAll(async (from, to) => {
        const result = await client.from('timetable_schedule').select(SCHEDULE_SELECT,
          { count: from === 0 ? 'exact' : undefined }).eq('term_id', termId)
          .order('section_id').order('meeting_id', { nullsFirst: true }).range(from, to);
        return { ...result, data: result.data?.map(row => ({ ...row, id: `${row.section_id}:${row.meeting_id || 'unknown'}` })) };
      });
      return buildTimetableSections(rows);
    },
    async teachers() {
      return (await readAll((from, to) => client.from('teachers').select(TEACHER_SELECT,
        { count: from === 0 ? 'exact' : undefined }).order('id').range(from, to))).map(publicTeacher);
    },
    async teacher(id) {
      const { data, error } = await client.from('teachers').select(TEACHER_SELECT).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? publicTeacher(data) : null;
    },
    async reviews(teacherId) {
      return (await readAll((from, to) => client.from('reviews').select(REVIEW_SELECT,
        { count: from === 0 ? 'exact' : undefined }).eq('teacher_id', teacherId)
        .eq('status', 'approved').order('id').range(from, to))).map(publicReview);
    },
    async review(id) {
      const { data, error } = await client.from('reviews').select(REVIEW_SELECT)
        .eq('id', id).eq('status', 'approved').maybeSingle();
      if (error) throw new Error(error.message);
      return publicReview(data);
    },
  };
}

function integer(value, fallback, max) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new Error('Invalid pagination');
  return number;
}
export function pagination(query) {
  const page = integer(query.page, 0, 100000);
  const pageSize = integer(query.pageSize, 20, 100);
  if (!pageSize) throw new Error('Invalid page size');
  return { page, pageSize };
}
export function teacherOptions(query) {
  const options = { ...pagination(query), query: String(query.query || '').trim(),
    collegeId: String(query.collegeId || ''), sortBy: query.sortBy || 'overall' };
  if (options.query.length > 200 || options.collegeId.length > 200 ||
    !['overall', 'leniency', 'quality', 'attendance'].includes(options.sortBy)) throw new Error('Invalid teacher filter');
  for (const flag of ['onlyThisTerm', 'courseOnly']) {
    if (query[flag] !== undefined && !['true', 'false'].includes(query[flag])) throw new Error('Invalid boolean filter');
    options[flag] = query[flag] === 'true';
  }
  return options;
}
const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function teacherPage(rows, options) {
  const text = options.query.toLocaleLowerCase();
  const filtered = rows.filter(row => {
    if (options.collegeId && options.collegeId !== 'all' && row.college_id !== options.collegeId) return false;
    if (options.onlyThisTerm && !row.course_offerings?.some(off => off.terms?.is_current)) return false;
    if (!text) return true;
    const courseMatch = row.course_offerings?.some(off => off.courses?.name?.toLocaleLowerCase().includes(text));
    return options.courseOnly ? courseMatch : courseMatch || row.name?.toLocaleLowerCase().includes(text) ||
      (Array.isArray(row.tags) && row.tags.includes(options.query));
  });
  const column = { overall: 'overall_score', leniency: 'grading_leniency', quality: 'teaching_quality', attendance: 'attendance_strictness' }[options.sortBy];
  filtered.sort((a, b) => {
    const score = a[column] == null ? (b[column] == null ? 0 : 1) :
      b[column] == null ? -1 : Number(b[column]) - Number(a[column]);
    return score || Number(b.review_count || 0) - Number(a.review_count || 0) || compareId(a.id, b.id);
  });
  const start = options.page * options.pageSize;
  return { items: filtered.slice(start, start + options.pageSize), total: filtered.length };
}
export function reviewPage(rows, { page, pageSize }) {
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || compareId(a.id, b.id));
  return { items: sorted.slice(page * pageSize, (page + 1) * pageSize), total: sorted.length };
}
