// User confirmed on 2026-10-13: keep He Xuan in Information Science and Technology.
// The course is retained from six previous reviews and the historical offering;
// a teacher's current college does not rewrite a course's owning college.
export const heXuan = {
  sourceId: '6966df57fc754f151d0edb1b',
  teacherId: 'legacy_teacher_108',
  name: '何宣',
  teacherCollegeId: 'aa643cd9-cd9e-4c60-bd82-60c37f76b61b',
  teacherCollegeName: '信息科学与技术学院',
  courseId: 'bb6e01f1-5868-4d64-9898-6ba7e63a18a0',
  courseName: '数据结构与算法',
  courseCollegeId: '4a487fd8-0db4-4713-bc4f-914ebe487f2c',
  priorReviewIds: ['1490','2424','3186','4208','4207','4225'].map(id=>'legacy_review_'+id),
};
// Scope the exception to the exact uploaded record and its existing course.
export function requiredTeacherCollegeSQL(data) {
  return `CASE WHEN ${data}->>'source_id'='${heXuan.sourceId}'
    AND ${data}->'review'->>'teacher_id'='${heXuan.teacherId}'
    AND ${data}->'review'->>'course_id'='${heXuan.courseId}'
    THEN '${heXuan.teacherCollegeId}' ELSE ${data}->>'college_id_required' END`;
}
