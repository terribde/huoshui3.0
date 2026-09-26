import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Teacher, Review, UserPointTransaction, Course, Term, PointRule, TeacherCourseOffering } from '../types';
import { POPULAR_COURSES } from '../data/mockTeachers';
import { normalizeRatingRecord, readRating, RATING_VERSION } from '../lib/ratings';

/**
 * Supabase Data Service
 * Provides real database persistence with graceful local fallback & instant caching
 */

const DEFAULT_ACTION_LABELS: Record<string, string> = {
  welcome_gift: '新用户注册赠送',
  register_init: '新用户注册赠送',
  new_user_welcome: '新用户注册欢迎礼',
  daily_checkin: '每日签到奖励',
  review_approved: '撰写教师评价审核通过',
  ai_question: 'AI 智能问答提问',
  smart_filter: '智能筛选推荐',
  guide_unlock: '攻略类内容解锁',
  recommend_query: '智能偏好选课推荐',
  experience_guide: '解锁经验攻略内容',
  invite_bonus: '邀请校友注册奖励',
};

const getStorageKey = (key: string) => `swjtu_${key}`;

function getLocalItem<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined') return defaultValue;
    const val = localStorage.getItem(getStorageKey(key));
    return val ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalItem<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch (e) {
    console.warn('[LocalStorage] Write failed:', e);
  }
}

export const supabaseService = {
  /**
   * Local storage helpers for reviews & user points
   */
  getLocalReviews(): Review[] {
    const local = getLocalItem<Review[]>('submitted_reviews', []).map(normalizeRatingRecord);
    if (local.length === 0) {
      try {
        const legacy = localStorage.getItem('swjtu_local_reviews');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLocalItem('submitted_reviews', parsed);
            localStorage.removeItem('swjtu_local_reviews');
            return parsed.map(normalizeRatingRecord);
          }
        }
      } catch (e) {
        // ignore legacy parsing error
      }
    }
    return local;
  },

  saveLocalReview(review: Review): void {
    const existing = this.getLocalReviews();
    const updated = [{ ...review, ratingVersion: RATING_VERSION }, ...existing.filter((r) => r.id !== review.id)];
    setLocalItem('submitted_reviews', updated);
  },

  getLocalUserPoints(userId: string): { points: number; transactions: UserPointTransaction[] } | null {
    const cache = getLocalItem<{ points: number; transactions: UserPointTransaction[] } | null>(
      `points_${userId}`,
      null
    );
    return cache;
  },

  saveLocalUserPoints(userId: string, points: number, transactions: UserPointTransaction[]): void {
    setLocalItem(`points_${userId}`, { points, transactions });
  },

  /**
   * Check-in date tracking (local and remote)
   */
  getLocalDateString(): string {
    // Campus check-ins use the same calendar day as the database (Asia/Shanghai).
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  },

  getLocalCheckInDate(userId: string): string | null {
    return getLocalItem<string | null>(`last_checkin_${userId}`, null);
  },

  saveLocalCheckInDate(userId: string, dateStr: string): void {
    setLocalItem(`last_checkin_${userId}`, dateStr);
  },

  async hasUserCheckedInToday(userId: string): Promise<boolean> {
    const data = await this.getUserPoints(userId);
    return data.hasCheckedInToday === true;
  },

  /**
   * Execute Daily Check-in via Supabase Database Function `handle_daily_checkin`
   * Only a confirmed server response updates the local cache.
   */
  async handleDailyCheckin(userId: string): Promise<{
    success: boolean; points: number; alreadyCheckedIn: boolean; message?: string;
  }> {
    const failure = (message: string) => ({ success: false, points: 0, alreadyCheckedIn: false, message });
    if (!isSupabaseConfigured || !supabase) return failure('数据库未连接，签到未完成');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user || auth.user.id !== userId) return failure('请重新登录后签到');
      // Never replace an uncertain RPC result with a client-side balance write.
      const { data, error } = await supabase.rpc('handle_daily_checkin');
      if (error) return failure(error.message || '签到失败，请稍后重试');
      const res = Array.isArray(data) ? data[0] : data;
      if (!res || !Number.isSafeInteger(res.points) || res.points < 0 || typeof res.already_checked_in !== 'boolean') {
        return failure('签到结果无法确认，请刷新积分后重试');
      }
      const local = this.getLocalUserPoints(userId);
      this.saveLocalUserPoints(userId, res.points, local?.transactions || []);
      this.saveLocalCheckInDate(userId, res.checkin_date || this.getLocalDateString());
      return { success: true, points: res.points, alreadyCheckedIn: res.already_checked_in };
    } catch (err: any) {
      return failure(err?.message || '签到结果无法确认，请刷新积分后重试');
    }
  },

  async recordCheckIn(userId: string, _added: number, _newBalance: number): Promise<boolean> {
    const res = await this.handleDailyCheckin(userId);
    return res.success;
  },

  /**
   * Fetch all teachers from Supabase
   * Aligned with new schema: joins colleges & course_offerings(courses, terms)
   */
  async getTeachers(): Promise<Teacher[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      let teachersData: any[] = [];
      
      // Try relational query first
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          colleges ( id, name ),
          course_offerings (
            course_id,
            courses ( id, name ),
            term_id,
            terms ( id, year_term, is_current )
          )
        `)
        .order('overall_score', { ascending: false });

      if (error) {
        console.warn('[Supabase] Relational teachers query note:', error.message);
        // Fallback to simple query if relational join fails
        const { data: simpleData, error: simpleError } = await supabase
          .from('teachers')
          .select('*')
          .order('overall_score', { ascending: false });
        
        if (simpleError || !simpleData) {
          console.warn('[Supabase] Error fetching teachers:', simpleError?.message);
          return null;
        }
        teachersData = simpleData;
      } else if (data) {
        teachersData = data;
      }

      if (!teachersData || teachersData.length === 0) return null;

      // Transform snake_case columns & relation objects to camelCase TypeScript model
      return teachersData.map((row: any) => {
        // College name resolution: from colleges.name join, or row.college fallback
        const collegeName = row.colleges?.name || row.college || '西南交通大学';

        // Course offerings resolution from course_offerings join
        const rawOfferings: any[] = Array.isArray(row.course_offerings) ? row.course_offerings : [];
        const offerings: TeacherCourseOffering[] = [];
        const courseNamesSet = new Set<string>();
        let isTeachingCurrentTerm = false;

        for (const off of rawOfferings) {
          const cName = off.courses?.name;
          const cId = off.course_id || off.courses?.id;
          const isCurr = Boolean(off.terms?.is_current);
          if (isCurr) isTeachingCurrentTerm = true;
          if (cName) {
            courseNamesSet.add(cName);
            offerings.push({
              courseId: cId,
              courseName: cName,
              termId: off.term_id,
              yearTerm: off.terms?.year_term,
              isCurrentTerm: isCurr,
            });
          }
        }

        // Fallback for mock/legacy courses if course_offerings was empty in database
        const fallbackCourses = Array.isArray(row.courses)
          ? row.courses
          : (typeof row.courses === 'string' ? JSON.parse(row.courses) : []);

        const finalCourses = courseNamesSet.size > 0
          ? Array.from(courseNamesSet)
          : fallbackCourses;

        const isTeachingThisTerm = rawOfferings.length > 0
          ? isTeachingCurrentTerm
          : Boolean(row.is_teaching_this_term ?? (finalCourses.length > 0));

        // New teachers have numeric database defaults even before any rating exists.
        // Only review statistics or explicitly imported history establish rating data.
        const hasRatingData = Number(row.review_count) > 0 || row.has_historical_data === true;
        const rating = (value: unknown) => hasRatingData ? readRating(value) : null;
        return normalizeRatingRecord({
          ratingVersion: row.rating_version ?? 1,
          id: row.id,
          name: row.name,
          title: row.title || '教师',
          college: collegeName,
          collegeId: row.college_id || row.colleges?.id || undefined,
          campus: row.campus || '犀浦校区',
          courses: finalCourses,
          courseOfferings: offerings,
          isTeachingThisTerm,
          overallScore: rating(row.overall_score),
          reviewCount: Number(row.review_count) || 0,
          dimensions: {
            attendanceStrictness: rating(row.attendance_strictness),
            gradingLeniency: rating(row.grading_leniency),
            effortMatters: rating(row.effort_matters),
            workloadDifficulty: rating(row.workload_difficulty),
            approachability: rating(row.approachability),
            teachingQuality: rating(row.teaching_quality),
          },
          hasHistoricalData: Boolean(row.has_historical_data),
          tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags) : []),
          recentTermCourses: row.recent_term_courses || [],
        });
      });
    } catch (err) {
      console.warn('[Supabase] Failed to connect to teachers table:', err);
      return null;
    }
  },

  /**
   * Fetch reviews: Merges remote Supabase records with local user-submitted reviews
   * Aligned with new schema: joins courses(id, name) and reads reject_reason
   */
  async getReviews(teacherId?: string): Promise<Review[] | null> {
    let remoteReviews: Review[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('reviews')
          .select(`
            *,
            courses ( id, name )
          `)
          .order('created_at', { ascending: false });

        if (teacherId) {
          query = query.eq('teacher_id', teacherId);
        }

        const { data, error } = await query;
        if (!error && data) {
          remoteReviews = data.map((row: any) => ({
            ratingVersion: row.rating_version ?? 1,
            remote: true,
            id: row.id,
            teacherId: row.teacher_id,
            courseId: row.course_id || row.courses?.id || undefined,
            courseName: row.courses?.name || row.course_name || '大学核心课程',
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
            userId: row.user_id,
            userEmail: row.user_email,
            isHistoricalMigrated: Boolean(row.is_historical_migrated),
            status: row.status || 'approved',
            rejectReason: row.reject_reason || row.rejection_reason || undefined,
            rejectionReason: row.reject_reason || row.rejection_reason || undefined,
            reviewerId: row.reviewer_id || undefined,
            reviewedAt: row.reviewed_at || undefined,
            createdAt: row.created_at || new Date().toISOString(),
            likes: Number(row.likes) || 0,
          }));
        } else if (error) {
          console.warn('[Supabase] getReviews relational query warning:', error.message);
          // Fallback to simple query if relational join fails
          const { data: simpleData } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
          if (simpleData) {
            remoteReviews = simpleData.map((row: any) => ({
              ratingVersion: row.rating_version ?? 1,
              remote: true,
              id: row.id,
              teacherId: row.teacher_id,
              courseId: row.course_id || undefined,
              courseName: row.course_name || '大学核心课程',
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
              userId: row.user_id,
              userEmail: row.user_email,
              isHistoricalMigrated: Boolean(row.is_historical_migrated),
              status: row.status || 'approved',
              rejectReason: row.reject_reason || row.rejection_reason || undefined,
              rejectionReason: row.reject_reason || row.rejection_reason || undefined,
              reviewerId: row.reviewer_id || undefined,
              reviewedAt: row.reviewed_at || undefined,
              createdAt: row.created_at || new Date().toISOString(),
              likes: Number(row.likes) || 0,
            }));
          }
        }
      } catch (err) {
        console.warn('[Supabase] Failed to fetch remote reviews:', err);
      }
    }

    // Always include locally saved user reviews so they are never lost on reload
    let localReviews = this.getLocalReviews();
    if (teacherId) {
      localReviews = localReviews.filter((r) => r.teacherId === teacherId);
    }

    // Merge deduplicated by id:
    // Remote database (Supabase) is the single source of truth for moderation and audit status.
    // Local reviews are only used to supplement newly submitted reviews that have not synced yet.
    const reviewMap = new Map<string, Review>();
    
    // 1. Insert local reviews first
    for (const r of localReviews) {
      reviewMap.set(r.id, r);
    }

    // 2. Remote reviews take absolute precedence and overwrite local status
    let hasLocalUpdates = false;
    const allLocal = this.getLocalReviews();

    for (const r of remoteReviews) {
      reviewMap.set(r.id, r);

      // If this review exists locally, sync the remote audit status & likes back to localStorage
      const localIdx = allLocal.findIndex((lr) => lr.id === r.id);
      if (localIdx >= 0) {
        if (
          allLocal[localIdx].status !== r.status ||
          allLocal[localIdx].likes !== r.likes ||
          allLocal[localIdx].rejectionReason !== r.rejectionReason
        ) {
          allLocal[localIdx] = {
            ...allLocal[localIdx],
            status: r.status,
            rejectionReason: r.rejectionReason,
            likes: r.likes,
          };
          hasLocalUpdates = true;
        }
      }
    }

    if (hasLocalUpdates) {
      setLocalItem('submitted_reviews', allLocal);
    }

    const merged = Array.from(reviewMap.values()).map(normalizeRatingRecord);
    return merged.length > 0 ? merged : null;
  },

  /**
   * Submit a new teacher review to Supabase & Local Cache
   * Aligned with new schema & security policies:
   * - Requires course_id (NOT NULL, FK -> courses)
   * - Requires authenticated user (user_id = auth.uid())
   * - Forces status = 'pending'
   * - Does NOT write course_name or user_email (removed from DB)
   * - Does NOT write to teachers table (read-only for normal users)
   */
  async submitReview(review: Review): Promise<{ success: boolean; message?: string }> {
    // 1. If Supabase is not configured, fall back to purely local storage
    if (!isSupabaseConfigured || !supabase) {
      this.saveLocalReview(review);
      return { success: true };
    }

    try {
      let validCreatedAt: string = new Date().toISOString();
      if (review.createdAt && !isNaN(Date.parse(review.createdAt))) {
        validCreatedAt = new Date(review.createdAt).toISOString();
      }

      // Security Policy Requirement: user must be authenticated, user_id = auth.uid()
      const sessionUser = (await supabase.auth.getUser())?.data?.user;
      const currentUserId = sessionUser?.id || review.userId;

      if (!sessionUser || !currentUserId) {
        return {
          success: false,
          message: '提交未通过安全校验：请先登录您的西南交大账号后再提交评教。',
        };
      }

      // Resolve valid course_id
      let resolvedCourseId = review.courseId;
      if (!resolvedCourseId && review.courseName) {
        const found = await this.findCourseByName(review.courseName);
        if (found) resolvedCourseId = found.id;
      }
      if (!resolvedCourseId) {
        const allCourses = await this.getCourses();
        if (allCourses && allCourses.length > 0) {
          resolvedCourseId = allCourses[0].id;
        }
      }

      if (!resolvedCourseId) {
        return {
          success: false,
          message: '提交失败：未匹配到有效的课程记录，请选择一门授课课程。',
        };
      }

      const insertPayload: any = {
        rating_version: RATING_VERSION,
        id: review.id,
        teacher_id: review.teacherId,
        course_id: resolvedCourseId,
        year_term: review.yearTerm,
        attendance_strictness: review.dimensions.attendanceStrictness,
        grading_leniency: review.dimensions.gradingLeniency,
        effort_matters: review.dimensions.effortMatters,
        workload_difficulty: review.dimensions.workloadDifficulty,
        approachability: review.dimensions.approachability,
        teaching_quality: review.dimensions.teachingQuality,
        comment: review.comment,
        author_nickname: review.authorNickname,
        user_id: currentUserId,
        is_historical_migrated: false,
        status: 'pending', // Strictly 'pending' per database RLS policy
        created_at: validCreatedAt,
        likes: 0,
      };

      const { error } = await supabase.from('reviews').insert(insertPayload);

      if (error) {
        console.error('[Supabase] Error submitting review to remote:', error.message);
        let userMsg = error.message;
        if (error.code === '42501' || userMsg.includes('row-level security')) {
          userMsg = '云端数据库安全策略拒绝写入，请确认已在 Supabase 运行最新的 reviews 权限策略且处于登录状态。';
        }
        return { success: false, message: userMsg };
      }

      // Save locally only after cloud accepted it
      this.saveLocalReview(review);
      return { success: true };
    } catch (err: any) {
      console.warn('[Supabase] Review remote submission exception:', err);
      return { success: false, message: err?.message || '网络连接异常，未能存入云端' };
    }
  },

  /**
   * Update local review status in browser storage
   */
  updateLocalReviewStatus(reviewId: string, status: 'approved' | 'rejected', rejectionReason?: string) {
    const local = this.getLocalReviews();
    const updated = local.map((r) =>
      r.id === reviewId ? { ...r, status, rejectionReason: status === 'rejected' ? rejectionReason : undefined } : r
    );
    try {
      setLocalItem('submitted_reviews', updated);
      localStorage.removeItem('swjtu_local_reviews');
    } catch (e) {
      console.warn('Failed to update review in local storage:', e);
    }
  },

  /**
   * Approve a review
   * Uses the database RPC `approve_review` exclusively.
   * RPC failure is returned to the caller without any direct table writes.
   */
  async approveReview(reviewId: string): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured || !supabase) return { success: false, message: '数据库未连接，无法审核' };
    try {
      // Authorization, status transition and reward are one database transaction.
      const { data, error } = await supabase.rpc('approve_review', { p_review_id: reviewId });
      if (error || data?.success !== true) {
        return { success: false, message: error?.message || data?.message || '审核未完成，请刷新后重试' };
      }
      this.updateLocalReviewStatus(reviewId, 'approved');
      return { success: true, message: data.message || '评价已通过审核' };
    } catch (err: any) {
      return { success: false, message: err?.message || '审核结果无法确认，请刷新后重试' };
    }
  },

  async getMyLikedReviewIds(): Promise<string[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return [];
    const ids: string[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('review_likes').select('review_id')
        .eq('user_id', auth.user.id).order('review_id').range(offset, offset + pageSize - 1);
      if (error) throw new Error('点赞状态读取失败，请刷新后重试');
      ids.push(...(data || []).map(row => row.review_id));
      if (!data || data.length < pageSize) return ids;
    }
  },

  async setReviewLike(reviewId: string, liked: boolean): Promise<{ likes: number; liked: boolean }> {
    if (!isSupabaseConfigured || !supabase) throw new Error('数据库未连接，点赞未保存');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error('请先登录后点赞');
    const { data, error } = await supabase.rpc('set_review_like', { p_review_id: reviewId, p_liked: liked });
    if (error) throw new Error(error.message);
    if (!data || !Number.isSafeInteger(data.likes) || data.likes < 0 || typeof data.liked !== 'boolean') {
      throw new Error('点赞结果无法确认，请刷新后重试');
    }
    return data;
  },

  /**
   * Reject a review
   * Calls the authorized reject_review RPC and fails closed.
   */
  async rejectReview(reviewId: string, reason: string): Promise<{ success: boolean; message?: string }> {
    if (!isSupabaseConfigured || !supabase) return { success: false, message: '数据库未连接，无法审核' };
    try {
      const { data, error } = await supabase.rpc('reject_review', {
        p_review_id: reviewId, p_reason: reason || '内容不符合审核规范，请修改后重新提交',
      });
      if (error || data?.success !== true) {
        return { success: false, message: error?.message || data?.message || '驳回未完成，请刷新后重试' };
      }
      this.updateLocalReviewStatus(reviewId, 'rejected', reason);
      return { success: true, message: data.message || '评价已被驳回' };
    } catch (err: any) {
      return { success: false, message: err?.message || '驳回结果无法确认，请刷新后重试' };
    }
  },

  /**
   * Re-edit user's own review (pending or rejected -> reset to pending for re-audit)
   * Aligned with new schema: updates course_id and resets reject_reason to null
   */
  async updateMyReview(review: Review): Promise<{ success: boolean; message?: string }> {
    this.saveLocalReview({ ...review, status: 'pending', rejectReason: undefined, rejectionReason: undefined });

    if (isSupabaseConfigured && supabase) {
      try {
        const sessionUser = (await supabase.auth.getUser())?.data?.user;
        if (!sessionUser) {
          return { success: false, message: '请先登录' };
        }

        let resolvedCourseId = review.courseId;
        if (!resolvedCourseId && review.courseName) {
          const found = await this.findCourseByName(review.courseName);
          if (found) resolvedCourseId = found.id;
        }

        const updatePayload: any = {
          rating_version: RATING_VERSION,
          year_term: review.yearTerm,
          attendance_strictness: review.dimensions.attendanceStrictness,
          grading_leniency: review.dimensions.gradingLeniency,
          effort_matters: review.dimensions.effortMatters,
          workload_difficulty: review.dimensions.workloadDifficulty,
          approachability: review.dimensions.approachability,
          teaching_quality: review.dimensions.teachingQuality,
          comment: review.comment,
          status: 'pending',
          reject_reason: null,
        };

        if (resolvedCourseId) {
          updatePayload.course_id = resolvedCourseId;
        }

        const { error } = await supabase
          .from('reviews')
          .update(updatePayload)
          .eq('id', review.id)
          .eq('user_id', sessionUser.id);

        if (error) {
          console.error('[Supabase] updateMyReview error:', error);
          return { success: false, message: error.message };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }
    return { success: true };
  },

  /**
   * Backward-compatible status updater: routes to RPC functions
   */
  async updateReviewStatus(
    reviewId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string,
    _authorUserId?: string
  ): Promise<boolean> {
    if (status === 'approved') {
      const res = await this.approveReview(reviewId);
      return res.success;
    } else {
      const res = await this.rejectReview(reviewId, rejectionReason || '未说明驳回理由');
      return res.success;
    }
  },

  /**
   * Delete a review (e.g., author deletes rejected review or admin removes)
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    // 1. Remove from local cache
    const local = this.getLocalReviews();
    const filtered = local.filter((r) => r.id !== reviewId);
    try {
      setLocalItem('submitted_reviews', filtered);
      localStorage.removeItem('swjtu_local_reviews');
    } catch (e) {
      console.warn('Failed to delete review from local storage:', e);
    }

    // 2. Remove from Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('reviews').delete().eq('id', reviewId);
      } catch (err) {
        console.warn('[Supabase] Failed to delete review from remote:', err);
      }
    }

    return true;
  },

  /**
   * Subscribe to real-time changes on the reviews table
   */
  subscribeToReviews(onChange: () => void): { unsubscribe: () => void } {
    if (!isSupabaseConfigured || !supabase) {
      return { unsubscribe: () => {} };
    }

    try {
      const channel = supabase
        .channel('reviews_realtime_' + Date.now())
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reviews' },
          () => {
            onChange();
          }
        )
        .subscribe();

      return {
        unsubscribe: () => {
          try {
            supabase?.removeChannel(channel);
          } catch (e) {
            console.warn('[Supabase Realtime] Error removing channel:', e);
          }
        },
      };
    } catch (e) {
      console.warn('[Supabase Realtime] Failed to subscribe to reviews:', e);
      return { unsubscribe: () => {} };
    }
  },

  /**
   * Read the authenticated user's authoritative balance and ledger.
   */
  async getUserPoints(userId: string): Promise<{
    points: number; transactions: UserPointTransaction[]; hasCheckedInToday: boolean;
  }> {
    if (!isSupabaseConfigured || !supabase) throw new Error('数据库未连接，无法确认积分');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user || auth.user.id !== userId) throw new Error('请重新登录后查看积分');
    // No cached balance may override a successful authoritative read, including zero.
    const [userRes, txRes] = await Promise.all([
      supabase.from('user_profiles').select('points, last_checkin_date').eq('id', userId).maybeSingle(),
      supabase.from('point_transactions').select('*').eq('user_id', userId).order('timestamp', { ascending: false }),
    ]);
    if (userRes.error) throw new Error(userRes.error.message);
    if (txRes.error) throw new Error(txRes.error.message);
    if (!userRes.data || !Number.isSafeInteger(userRes.data.points) || userRes.data.points < 0) {
      throw new Error('未找到有效积分账户，请确认数据库迁移已完成');
    }
    const transactions: UserPointTransaction[] = (txRes.data || []).map((t: any) => ({
      id: t.id, actionCode: t.action_code,
      action: t.action || DEFAULT_ACTION_LABELS[t.action_code] || '积分变动',
      amount: Number(t.amount),
      timestamp: t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '刚刚',
      balanceAfter: Number(t.balance_after), relatedReviewId: t.related_review_id || undefined,
    }));
    const checkinDate = userRes.data.last_checkin_date ? String(userRes.data.last_checkin_date).slice(0, 10) : null;
    const result = { points: userRes.data.points, transactions, hasCheckedInToday: checkinDate === this.getLocalDateString() };
    this.saveLocalUserPoints(userId, result.points, transactions);
    this.saveLocalCheckInDate(userId, checkinDate || '');
    return result;
  },

  /**
   * Spend Points via Supabase Database Function `spend_points`
   * Requirement 2: Unified RPC deduction function
   */
  async spendPoints(
    actionCode: string, note?: string, _fallbackAmount: number = 2
  ): Promise<{ success: boolean; newBalance: number; message?: string; error?: string }> {
    const failure = (message: string) => ({ success: false, newBalance: 0, message, error: message });
    if (!isSupabaseConfigured || !supabase) return failure('数据库未连接，未完成扣费');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) return failure('请先登录后使用该功能');
      const { data, error } = await supabase.rpc('spend_points', {
        p_action_code: actionCode, p_note: note || undefined,
      });
      if (error) return failure(error.message || '扣除积分失败');
      if (!Number.isSafeInteger(data) || data < 0) return failure('扣费结果无法确认，请刷新积分后重试');
      const local = this.getLocalUserPoints(auth.user.id);
      this.saveLocalUserPoints(auth.user.id, data, local?.transactions || []);
      return { success: true, newBalance: data };
    } catch (err: any) {
      return failure(err?.message || '扣费结果无法确认，请刷新积分后重试');
    }
  },

  /**
   * Supabase Auth: User Sign Up with Email & Password
   */
  async signUp(email: string, password: string, metadata?: { nickname?: string; college?: string; campus?: string }) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase 未配置或密钥未激活');
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: metadata?.nickname || '交大学子',
          college: metadata?.college || '计算机与人工智能学院',
          campus: metadata?.campus || '犀浦校区',
        },
      },
    });

    if (error) {
      throw error;
    }

    // Critical: Supabase anti-enumeration protection returns a user with empty identities[] if email is already registered
    const isAlreadyRegistered = Boolean(
      data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
    );
    if (isAlreadyRegistered) {
      throw new Error('User already registered');
    }

    // Ensure user_profile entry and 100 points are created immediately
    if (data.user) {
      await this.ensureUserProfile(data.user.id, data.user.email || email);
    }

    return data;
  },

  /**
   * Supabase Auth: Send Password Reset Email
   */
  async resetPassword(email: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase 未配置或密钥未激活');
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Supabase Auth: Resend Verification Email
   */
  async resendVerificationEmail(email: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase 未配置或密钥未激活');
    }
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Supabase Auth: User Sign In with Email & Password
   */
  async signIn(email: string, password: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase 未配置或密钥未激活');
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (data.user) {
      await this.ensureUserProfile(data.user.id, data.user.email || email);
    }

    return data;
  },

  /**
   * Supabase Auth: Sign Out
   */
  async signOut() {
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[Supabase] Sign out error:', error.message);
    }
  },

  /**
   * Get current auth user & session
   */
  async getCurrentUser() {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;
      return user;
    } catch {
      return null;
    }
  },

  /**
   * Ensure user profile exists (managed by DB trigger on auth.users automatically)
   */
  async ensureUserProfile(_userId: string, _email: string) {
    // Created transactionally by the auth.users trigger; never invent a local balance.
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: any) => void) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange(callback);
  },

  /**
   * Check whether a user email is an authorized administrator dynamically from Supabase database
   */
  async checkIsAdmin(_email?: string, _userMetadata?: any): Promise<{ isAdmin: boolean; role?: string; nickname?: string }> {
    if (!isSupabaseConfigured || !supabase) return { isAdmin: false };
    try {
      // The server derives identity from auth.uid(), never from a supplied email or role.
      const { data, error } = await supabase.rpc('get_my_admin_status');
      if (error || data?.is_admin !== true || !['super_admin', 'admin', 'moderator'].includes(data.role)) {
        return { isAdmin: false };
      }
      return { isAdmin: true, role: data.role, nickname: data.nickname || undefined };
    } catch {
      return { isAdmin: false };
    }
  },

  /**
   * Get all admin users from database
   */
  async getAdminList(): Promise<Array<{ id: string; email: string; role: string; nickname: string; is_active: boolean; created_at: string }>> {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase.from('admin_users').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Add or update an administrator in the database
   */
  async addAdminUser(email: string, role: string = 'admin', nickname: string = '评教审核员'): Promise<boolean> {
    if (!email || !isSupabaseConfigured || !supabase || !['super_admin', 'admin', 'moderator'].includes(role)) return false;
    try {
      const { data, error } = await supabase.from('admin_users').upsert({
        email: email.trim().toLowerCase(), role, nickname, is_active: true,
      }, { onConflict: 'email' }).select('id');
      return !error && data?.length === 1;
    } catch { return false; }
  },

  /**
   * Toggle or remove an administrator
   */
  async toggleAdminStatus(email: string, isActive: boolean): Promise<boolean> {
    if (!email || !isSupabaseConfigured || !supabase) return false;
    try {
      const { data, error } = await supabase.from('admin_users').update({ is_active: isActive })
        .eq('email', email.trim().toLowerCase()).select('id');
      return !error && data?.length === 1;
    } catch { return false; }
  },

  /**
   * Fetch standardized colleges list from Supabase `colleges` table
   * Requirement 7: college_id reference table
   */
  async getColleges(): Promise<Array<{ id: string; name: string; code?: string }> | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('*')
        .order('name');
      if (error) {
        console.warn('[Supabase] getColleges note:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[Supabase] getColleges exception:', err);
      return null;
    }
  },

  /**
   * Fetch standardized courses from Supabase `courses` table
   * New Database Schema: courses reference table (id uuid, name text, college_id uuid)
   */
  async getCourses(collegeId?: string): Promise<Course[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('courses').select('*').order('name');
        if (collegeId && collegeId !== 'all') {
          query = query.eq('college_id', collegeId);
        }
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map((c: any) => ({
            id: c.id,
            name: c.name,
            collegeId: c.college_id,
            createdAt: c.created_at,
          }));
        }
      } catch (err) {
        console.warn('[Supabase] getCourses exception:', err);
      }
    }

    // Standard fallback courses
    return POPULAR_COURSES.map((name, idx) => ({
      id: `course_seed_${idx + 1}`,
      name,
    }));
  },

  /**
   * Find course by exact or fuzzy name match
   */
  async findCourseByName(name: string): Promise<Course | null> {
    if (!name) return null;
    const courses = await this.getCourses();
    const exact = courses.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exact) return exact;
    const fuzzy = courses.find((c) => c.name.includes(name) || name.includes(c.name));
    return fuzzy || null;
  },

  /**
   * Fetch terms list from Supabase `terms` table
   */
  async getTerms(): Promise<Term[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('terms')
          .select('*')
          .order('is_current', { ascending: false });
        if (!error && data && data.length > 0) {
          return data.map((t: any) => ({
            id: t.id,
            yearTerm: t.year_term,
            isCurrent: Boolean(t.is_current),
            createdAt: t.created_at,
          }));
        }
      } catch (err) {
        console.warn('[Supabase] getTerms exception:', err);
      }
    }
    return [
      { id: 'term_current', yearTerm: '2024-2025第1学期', isCurrent: true },
      { id: 'term_prev_1', yearTerm: '2023-2024第2学期', isCurrent: false },
      { id: 'term_prev_2', yearTerm: '2023-2024第1学期', isCurrent: false },
    ];
  },

  /**
   * Fetch point rules from Supabase `point_rules` table
   */
  async getPointRules(): Promise<PointRule[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('point_rules')
          .select('*')
          .order('points_delta', { ascending: false });
        if (!error && data && data.length > 0) {
          return data.map((r: any) => ({
            actionCode: r.action_code,
            label: r.label,
            pointsDelta: Number(r.points_delta),
            isActive: Boolean(r.is_active),
            description: r.description,
          }));
        }
      } catch (err) {
        console.warn('[Supabase] getPointRules exception:', err);
      }
    }
    return Object.entries(DEFAULT_ACTION_LABELS).map(([actionCode, label]) => ({
      actionCode,
      label,
      pointsDelta: actionCode.includes('checkin') ? 5 : actionCode.includes('review') ? 20 : -2,
      isActive: true,
    }));
  },
};
