export const SCHEDULE_SELECT = 'section_id,selection_code,term_id,course_id,course_code,course_name,source_department,primary_teacher_id,primary_teacher_name,teacher_id,teacher_name,teacher_match_status,credits,nature,section_campus,preferred,capacity,meeting_id,source_index,weeks,weekday,period_start,period_end,classroom_campus,classroom,group_label,raw_schedule,raw_location,schedule_status';

export const normalizeCampus = campus => campus === '西部校区' ? '犀浦校区' : campus;

export function timetableOptions(query) {
  const options = {};
  for (const key of ['query', 'campus', 'collegeId', 'preferred']) {
    if (query[key] !== undefined && typeof query[key] !== 'string') throw new Error('Invalid timetable filter');
    options[key] = (query[key] || '').trim();
    if (options[key].length > 200) throw new Error('Invalid timetable filter');
  }
  options.query = options.query.replace(/\s*[\(（][^()（）]+[\)）]/g, '').trim() || options.query;
  options.campus = normalizeCampus(options.campus);
  const weekday = query.weekday;
  if (weekday !== undefined && weekday !== '' && weekday !== 'all') {
    if (!['string', 'number'].includes(typeof weekday) || !/^[1-7]$/.test(String(weekday))) throw new Error('Invalid weekday');
    options.weekday = Number(weekday);
  }
  return options;
}

export function buildTimetableSections(rows) {
  const sections = new Map();
  for (const row of rows) {
    let section = sections.get(row.section_id);
    if (!section) {
      section = {
        id: row.section_id, sectionId: row.section_id, termId: row.term_id,
        selectionCode: row.selection_code, courseId: row.course_id,
        courseCode: row.course_code, courseName: row.course_name,
        sourceDepartment: row.source_department,
        credits: row.credits == null ? null : Number(row.credits), nature: row.nature,
        campus: normalizeCampus(row.section_campus), preferred: row.preferred,
        capacity: row.capacity == null ? null : Number(row.capacity), meetings: [],
      };
      sections.set(row.section_id, section);
    }
    section.meetings.push({
      id: row.meeting_id, sourceIndex: row.source_index,
      teacherId: row.teacher_id, teacherName: row.teacher_name || row.primary_teacher_name,
      teacherMatchStatus: row.teacher_match_status,
      weeks: row.weeks, weekday: row.weekday, periodStart: row.period_start,
      periodEnd: row.period_end, classroomCampus: normalizeCampus(row.classroom_campus),
      classroom: row.classroom, groupLabel: row.group_label,
      rawSchedule: row.raw_schedule, rawLocation: row.raw_location?.replaceAll('西部校区', '犀浦校区'),
      scheduleStatus: row.schedule_status,
    });
  }
  return [...sections.values()];
}

export function timetableRecommendations(sections, teachers, options) {
  const profiles = new Map(teachers.map(teacher => [teacher.id, teacher]));
  const groups = new Map();
  const text = options.query.toLocaleLowerCase();
  for (const section of sections) {
    if (text && !section.courseName?.toLocaleLowerCase().includes(text)) continue;
    if (options.preferred && !section.preferred?.toLocaleLowerCase().includes(options.preferred.toLocaleLowerCase())) continue;
    const teacherGroups = new Map();
    for (const meeting of section.meetings) {
      const key = meeting.teacherId || meeting.teacherName || '未知教师';
      if (!teacherGroups.has(key)) teacherGroups.set(key, []);
      teacherGroups.get(key).push(meeting);
    }
    for (const [key, meetings] of teacherGroups) {
      // Match campus and weekday on the same meeting, then retain its full schedule.
      if (!meetings.some(meeting =>
        (!options.weekday || meeting.weekday === options.weekday) &&
        (!options.campus || options.campus === 'all' || section.campus === options.campus || meeting.classroomCampus === options.campus))) continue;
      const first = meetings[0];
      const teacher = profiles.get(first.teacherId) || {
        id: first.teacherId || `tt_${first.teacherName || '未知教师'}`,
        name: first.teacherName || '未知教师', title: '授课教师',
        college: section.sourceDepartment || '开课学院', campus: section.campus,
        courses: [section.courseName], is_teaching_this_term: true,
        overall_score: null, review_count: 0, tags: [], rating_version: 2,
      };
      if (options.collegeId && options.collegeId !== 'all' && teacher.college_id !== options.collegeId && teacher.college !== options.collegeId) continue;
      if (!groups.has(key)) groups.set(key, { teacher, sections: [] });
      groups.get(key).sections.push({ ...section, meetings: meetings.filter(meeting => meeting.scheduleStatus !== 'unknown') });
    }
  }
  const results = [...groups.values()].sort((a, b) =>
    (b.teacher.overall_score ?? -1) - (a.teacher.overall_score ?? -1) ||
    (b.teacher.review_count || 0) - (a.teacher.review_count || 0) ||
    String(a.teacher.id).localeCompare(String(b.teacher.id)));
  return !text && !options.preferred && !options.weekday ? results.slice(0, 60) : results;
}
