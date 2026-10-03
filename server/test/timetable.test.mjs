import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimetableSections, timetableOptions, timetableRecommendations } from '../timetable.mjs';
import { createSource } from '../data.mjs';

const row = (overrides = {}) => ({ section_id: 's', term_id: 'current', selection_code: '001',
  course_name: '高等数学', teacher_id: 't', teacher_name: '老师', capacity: 80,
  section_campus: '西部校区', preferred: '计算机2024-01班', meeting_id: 'm',
  weekday: 1, weeks: [1, 3, 5], period_start: 1, period_end: 2,
  raw_location: '西部校区 X123', schedule_status: 'scheduled', ...overrides });
const teachers = [{ id: 'absent', overall_score: 5 }, { id: 't', college_id: 'c', overall_score: 4, review_count: 10 }];

test('course filters use actual schedules, normalize campus, and retain total capacity and all teacher meetings', () => {
  const sections = buildTimetableSections([row(), row({ meeting_id: 'm2', weekday: 3 })]);
  const results = timetableRecommendations(sections, teachers, timetableOptions({
    query: '高等数学 (I)', campus: '犀浦校区', weekday: '1', preferred: '计算机', collegeId: 'c',
  }));
  assert.equal(results.length, 1);
  assert.equal(results[0].sections[0].capacity, 80);
  assert.equal(results[0].sections[0].meetings.length, 2);
  assert.deepEqual(results[0].sections[0].meetings[0].weeks, [1, 3, 5]);
  assert.equal(results[0].sections[0].campus, '犀浦校区');
  assert.equal(results[0].sections[0].meetings[0].rawLocation, '犀浦校区 X123');
  assert.equal(timetableRecommendations(sections, teachers, timetableOptions({ query: '不存在' })).length, 0);
  assert.equal(timetableRecommendations(sections, teachers, timetableOptions({}))[0].teacher.id, 't');
});

test('multiple teachers keep their own meetings, and unknown weekdays do not match a weekday filter', () => {
  const sections = buildTimetableSections([row(), row({ meeting_id: 'm2', teacher_id: 'other', teacher_name: '另一位', weekday: null, schedule_status: 'weeks_only' })]);
  const results = timetableRecommendations(sections, teachers, timetableOptions({ weekday: '1' }));
  assert.equal(results.length, 1);
  assert.equal(results[0].sections[0].meetings.length, 1);
  assert.equal(timetableRecommendations(sections, teachers, timetableOptions({})).length, 2);
  assert.throws(() => timetableOptions({ weekday: '8' }));
  assert.throws(() => timetableOptions({ weekday: ['1'] }));
  assert.throws(() => timetableOptions({ query: ['a', 'b'] }));
});

test('timetable source reads all capped pages, isolates terms and refuses incomplete snapshots', async () => {
  const rows = Array.from({ length: 1203 }, (_, i) => row({ section_id: `s${String(i).padStart(4, '0')}`, meeting_id: `m${i}` }));
  rows.push(row({ term_id: 'previous', section_id: 'old' }));
  let fail = false;
  const client = { from(table) {
    assert.equal(table, 'timetable_schedule');
    let termId, from, to;
    const query = { select: () => query, eq: (column, value) => { assert.equal(column, 'term_id'); termId = value; return query; },
      order: () => query, range: (start, end) => { from = start; to = end; return query; },
      then: resolve => {
        const selected = rows.filter(r => r.term_id === termId);
        return Promise.resolve({ data: fail && from ? [] : selected.slice(from, Math.min(to + 1, from + 100)), count: selected.length }).then(resolve);
      } };
    return query;
  } };
  const source = createSource(client);
  const sections = await source.timetable('current');
  assert.equal(sections.length, 1203);
  assert.ok(sections.every(section => section.termId === 'current'));
  fail = true;
  await assert.rejects(source.timetable('current'), /changed/);
});
