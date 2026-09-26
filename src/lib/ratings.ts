import type { TeacherDimensions, TeacherRatingDimensions, RecommendationWeights } from '../types';

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

export function readRating(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const score = Number(value);
  return isRating(score) ? score : null;
}

export const formatRating = (value: unknown, suffix = ''): string =>
  isRating(value) ? `${value.toFixed(1)}${suffix}` : '暂无数据';

// Descending scores, with missing data last (never coerced into a zero score).
export const compareRatings = (a: unknown, b: unknown): number =>
  isRating(a) ? (isRating(b) ? b - a : -1) : (isRating(b) ? 1 : 0);

export function ratingMatchPercent(dimensions: TeacherRatingDimensions, weights: RecommendationWeights): number | null {
  const active = RATING_DIMENSIONS.filter(d => weights[d.key] > 0);
  if (!active.length || active.some(d => !isRating(dimensions[d.key]))) return null;
  const total = active.reduce((sum,d) => sum + weights[d.key],0);
  const weighted = active.reduce((sum,d) => sum + ((dimensions[d.key]! - 1) / 4) * weights[d.key],0);
  return Math.min(99,Math.max(50,Math.round(weighted / total * 100)));
}

// Applied at boundaries only. Version 2 records must never be reversed again.
export function normalizeRatingRecord<T extends { dimensions?: Partial<TeacherRatingDimensions>; ratingVersion?: number; overallScore?: number | null }>(record: T): T {
  if (record.ratingVersion === RATING_VERSION) return record;
  const dimensions = { ...record.dimensions };
  for (const key of ['attendanceStrictness', 'workloadDifficulty'] as const) {
    if (isRating(dimensions[key])) dimensions[key] = Math.round((6 - dimensions[key]!) * 100) / 100;
  }
  const valid = Object.values(dimensions).filter(isRating);
  return { ...record, dimensions, ratingVersion: RATING_VERSION,
    ...(isRating(record.overallScore) && valid.length ? { overallScore: Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*10)/10 } : {}) };
}
