import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Teacher, Review, UserPointTransaction } from '../types';

/**
 * Supabase Data Service
 * Provides real database persistence with graceful local fallback
 */

export const supabaseService = {
  /**
   * Fetch all teachers from Supabase
   */
  async getTeachers(): Promise<Teacher[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('overall_score', { ascending: false });

      if (error) {
        console.warn('[Supabase] Error fetching teachers:', error.message);
        return null;
      }

      if (!data || data.length === 0) return null;

      // Transform snake_case columns to camelCase TypeScript model
      return data.map((row: any) => ({
        id: row.id,
        name: row.name,
        title: row.title || '教师',
        college: row.college || '西南交通大学',
        campus: row.campus || '犀浦校区',
        courses: Array.isArray(row.courses) ? row.courses : (typeof row.courses === 'string' ? JSON.parse(row.courses) : []),
        isTeachingThisTerm: Boolean(row.is_teaching_this_term),
        overallScore: Number(row.overall_score) || 4.5,
        reviewCount: Number(row.review_count) || 0,
        dimensions: {
          attendanceStrictness: Number(row.attendance_strictness) || 3,
          gradingLeniency: Number(row.grading_leniency) || 4,
          effortMatters: Number(row.effort_matters) || 4,
          workloadDifficulty: Number(row.workload_difficulty) || 3,
          approachability: Number(row.approachability) || 4,
          teachingQuality: Number(row.teaching_quality) || 4,
        },
        hasHistoricalData: Boolean(row.has_historical_data),
        tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags) : []),
        recentTermCourses: row.recent_term_courses || [],
      }));
    } catch (err) {
      console.warn('[Supabase] Failed to connect to teachers table:', err);
      return null;
    }
  },

  /**
   * Fetch reviews from Supabase
   */
  async getReviews(teacherId?: string): Promise<Review[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (teacherId) {
        query = query.eq('teacher_id', teacherId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Supabase] Error fetching reviews:', error.message);
        return null;
      }

      if (!data) return null;

      return data.map((row: any) => ({
        id: row.id,
        teacherId: row.teacher_id,
        courseName: row.course_name,
        yearTerm: row.year_term || '2024-2025第1学期',
        dimensions: {
          attendanceStrictness: row.attendance_strictness,
          gradingLeniency: row.grading_leniency,
          effortMatters: row.effort_matters,
          workloadDifficulty: row.workload_difficulty,
          approachability: row.approachability,
          teachingQuality: row.teaching_quality,
        },
        comment: row.comment || '',
        authorNickname: row.author_nickname || '匿名交大学子',
        isHistoricalMigrated: Boolean(row.is_historical_migrated),
        status: row.status || 'approved',
        createdAt: row.created_at || new Date().toISOString(),
        likes: Number(row.likes) || 0,
      }));
    } catch (err) {
      console.warn('[Supabase] Failed to fetch reviews:', err);
      return null;
    }
  },

  /**
   * Submit a new teacher review to Supabase
   */
  async submitReview(review: Review): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const { error } = await supabase.from('reviews').insert({
        id: review.id,
        teacher_id: review.teacherId,
        course_name: review.courseName,
        year_term: review.yearTerm,
        attendance_strictness: review.dimensions.attendanceStrictness,
        grading_leniency: review.dimensions.gradingLeniency,
        effort_matters: review.dimensions.effortMatters,
        workload_difficulty: review.dimensions.workloadDifficulty,
        approachability: review.dimensions.approachability,
        teaching_quality: review.dimensions.teachingQuality,
        comment: review.comment,
        author_nickname: review.authorNickname,
        is_historical_migrated: false,
        status: review.status,
        created_at: review.createdAt,
        likes: 0,
      });

      if (error) {
        console.error('[Supabase] Error submitting review:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Supabase] Review submission failed:', err);
      return false;
    }
  },

  /**
   * Fetch User Points & Transactions
   */
  async getUserPoints(userId: string = 'swjtu_student_default'): Promise<{ points: number; transactions: UserPointTransaction[] } | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data: userData } = await supabase
        .from('user_profiles')
        .select('points')
        .eq('id', userId)
        .maybeSingle();

      const { data: txData } = await supabase
        .from('point_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (!userData && (!txData || txData.length === 0)) return null;

      return {
        points: userData?.points ?? 100,
        transactions: (txData || []).map((t: any) => ({
          id: t.id,
          action: t.action,
          amount: Number(t.amount),
          timestamp: t.timestamp,
          balanceAfter: Number(t.balance_after),
        })),
      };
    } catch (err) {
      console.warn('[Supabase] Failed to fetch user points:', err);
      return null;
    }
  },

  /**
   * Save point transaction and update user profile balance
   */
  async savePointTransaction(
    userId: string = 'swjtu_student_default',
    action: string,
    amount: number,
    balanceAfter: number
  ): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      
      // Update or insert user profile
      await supabase
        .from('user_profiles')
        .upsert({ id: userId, points: balanceAfter });

      // Insert transaction log
      await supabase
        .from('point_transactions')
        .insert({
          id: txId,
          user_id: userId,
          action,
          amount,
          balance_after: balanceAfter,
          timestamp: new Date().toISOString(),
        });

      return true;
    } catch (err) {
      console.error('[Supabase] Failed to persist point transaction:', err);
      return false;
    }
  },
};
