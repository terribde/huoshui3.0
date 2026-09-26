import { useMemo } from 'react';
import type { Teacher, TeacherQuery } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { compareRatings } from '../lib/ratings';
import { supabaseService } from '../services/supabaseService';
import { usePagedQuery } from './usePagedQuery';

export function useTeacherSearch(fallback: Teacher[], options: TeacherQuery, enabled = true) {
  const key = JSON.stringify(options);
  const local = useMemo(() => {
    if (isSupabaseConfigured) return [];
    const keyword = options.query?.trim().toLowerCase() || '';
    const dimensions = { leniency: 'gradingLeniency', quality: 'teachingQuality', attendance: 'attendanceStrictness' } as const;
    return fallback.filter(t => (!options.collegeId || options.collegeId === 'all' || t.collegeId === options.collegeId || t.college === options.collegeId)
      && (!options.onlyThisTerm || t.isTeachingThisTerm)
      && (!keyword || (!options.courseOnly && (t.name.toLowerCase().includes(keyword) || t.tags.some(tag => tag.toLowerCase().includes(keyword)))) || t.courses.some(c => c.toLowerCase().includes(keyword))))
      .sort((a, b) => options.sortBy && options.sortBy !== 'overall'
        ? compareRatings(a.dimensions[dimensions[options.sortBy]], b.dimensions[dimensions[options.sortBy]]) : compareRatings(a.overallScore, b.overallScore));
  }, [fallback, key]);
  const size = options.pageSize || 20;
  return usePagedQuery<Teacher>(key, (page, signal) => isSupabaseConfigured
    ? supabaseService.getTeachersPage({ ...options, page, pageSize: size }, signal)
    : Promise.resolve({ items: local.slice(page * size, (page + 1) * size), total: local.length }), enabled);
}
