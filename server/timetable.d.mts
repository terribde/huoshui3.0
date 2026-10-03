import type { CourseSection } from '../src/types';
export const SCHEDULE_SELECT: string;
export function normalizeCampus(campus: string | null | undefined): string | null | undefined;
export interface TimetableOptions {
  query: string;
  campus: string;
  collegeId: string;
  preferred: string;
  weekday?: number;
}
export function timetableOptions(query: Record<string, unknown>): TimetableOptions;
export function buildTimetableSections(rows: any[]): CourseSection[];
export function timetableRecommendations(sections: CourseSection[], teachers: any[], options: TimetableOptions): { teacher: any; sections: CourseSection[] }[];
