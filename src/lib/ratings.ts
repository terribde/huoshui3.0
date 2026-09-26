import type { TeacherDimensions } from '../types';

export const RATING_VERSION = 2;
export const RATING_DIMENSIONS: Array<{
  key: keyof TeacherDimensions; label: string; lowDesc: string; highDesc: string;
}> = [
  { key: 'attendanceStrictness', label: '考勤宽松度', lowDesc: '每节必点', highDesc: '几乎不点名' },
  { key: 'gradingLeniency', label: '给分宽松度', lowDesc: '给分严格', highDesc: '给分大方' },
  { key: 'effortMatters', label: '努力回报', lowDesc: '努力回报少', highDesc: '认真投入有回报' },
  { key: 'workloadDifficulty', label: '作业轻松度', lowDesc: '作业繁重', highDesc: '作业少负担轻' },
  { key: 'approachability', label: '师生亲和力', lowDesc: '难以沟通', highDesc: '友善好沟通' },
  { key: 'teachingQuality', label: '教学质量', lowDesc: '讲解薄弱', highDesc: '清晰扎实' },
];
export const isRating = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;

// Applied at boundaries only. Version 2 records must never be reversed again.
export function normalizeRatingRecord<T extends { dimensions?: Partial<TeacherDimensions>; ratingVersion?: number; overallScore?: number }>(record: T): T {
  if (record.ratingVersion === RATING_VERSION) return record;
  const dimensions = { ...record.dimensions };
  for (const key of ['attendanceStrictness', 'workloadDifficulty'] as const) {
    if (isRating(dimensions[key])) dimensions[key] = Math.round((6 - dimensions[key]!) * 100) / 100;
  }
  const valid = Object.values(dimensions).filter(isRating);
  return { ...record, dimensions, ratingVersion: RATING_VERSION,
    ...('overallScore' in record && valid.length ? { overallScore: Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*10)/10 } : {}) };
}
