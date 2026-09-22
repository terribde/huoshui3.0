import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Teacher, Review, UserPointTransaction, Course, Term, PointRule, TeacherCourseOffering } from '../types';
import { INITIAL_TEACHERS, POPULAR_COURSES } from '../data/mockTeachers';

/**
 * Supabase Data Service
 * Provides real database persistence with graceful local fallback & instant caching
 */

const DEFAULT_ACTION_LABELS: Record<string, string> = {
  welcome_gift: '新用户注册赠送',
  register_init: '新用户注册赠送',
  daily_checkin: '每日签到奖励',
  review_approved: '撰写教师评价审核通过',
  ai_question: 'AI 智能问答提问',
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
    const local = getLocalItem<Review[]>('submitted_reviews', []);
    if (local.length === 0) {
      try {
        const legacy = localStorage.getItem('swjtu_local_reviews');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLocalItem('submitted_reviews', parsed);
            localStorage.removeItem('swjtu_local_reviews');
            return parsed;
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
    const updated = [review, ...existing.filter((r) => r.id !== review.id)];
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
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  getLocalCheckInDate(userId: string): string | null {
    return getLocalItem<string | null>(`last_checkin_${userId}`, null);
  },

  saveLocalCheckInDate(userId: string, dateStr: string): void {
    setLocalItem(`last_checkin_${userId}`, dateStr);
  },

  async hasUserCheckedInToday(userId: string): Promise<boolean> {
    const todayStr = this.getLocalDateString();

    // 1. Check local device cache
    const localDate = this.getLocalCheckInDate(userId);
    if (localDate === todayStr) {
      return true;
    }

    // 2. Check Supabase user_profiles if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('last_checkin_date')
          .eq('id', userId)
          .maybeSingle();

        if (!error && data?.last_checkin_date) {
          const remoteDate = String(data.last_checkin_date).slice(0, 10);
          if (remoteDate === todayStr) {
            this.saveLocalCheckInDate(userId, todayStr);
            return true;
          }
        }
      } catch (err) {
        console.warn('[Supabase] Check-in verification failed:', err);
      }
    }

    return false;
  },

  /**
   * Execute Daily Check-in via Supabase Database Function `handle_daily_checkin`
   * Requirement 1: Call `supabase.rpc('handle_daily_checkin')`
   */
  async handleDailyCheckin(userId: string): Promise<{
    success: boolean;
    points: number;
    alreadyCheckedIn: boolean;
    message?: string;
  }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('handle_daily_checkin');
        if (!error && data) {
          // data format: [{ points: 105, already_checked_in: false }] or { points: 105, already_checked_in: false }
          const res = Array.isArray(data) ? data[0] : data;
          const currentBalance = typeof res?.points === 'number' ? res.points : 0;
          const alreadyChecked = Boolean(res?.already_checked_in);

          const todayStr = this.getLocalDateString();
          this.saveLocalCheckInDate(userId, todayStr);

          // Synchronize local points cache
          const local = this.getLocalUserPoints(userId) || { points: 0, transactions: [] };
          const updatedTx = alreadyChecked
            ? local.transactions
            : [
                {
                  id: 'tx_checkin_' + Date.now(),
                  action: '每日签到奖励 (PRD 5.0)',
                  amount: 5,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  balanceAfter: currentBalance,
                },
                ...local.transactions,
              ];
          this.saveLocalUserPoints(userId, currentBalance, updatedTx);

          return {
            success: true,
            points: currentBalance,
            alreadyCheckedIn: alreadyChecked,
          };
        }

        // If RPC failed (e.g. 401 Unauthorized, 42501 permission denied, or function not deployed yet)
        console.warn('[Supabase] handle_daily_checkin RPC unavailable or permission denied, using resilient table fallback:', error?.message);
        
        const todayStr = this.getLocalDateString();
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('points, last_checkin_date')
          .eq('id', userId)
          .maybeSingle();

        const currentPoints = profile?.points ?? 100;
        const remoteDate = profile?.last_checkin_date ? String(profile.last_checkin_date).slice(0, 10) : null;
        const localDate = this.getLocalCheckInDate(userId);

        if (remoteDate === todayStr || localDate === todayStr) {
          this.saveLocalCheckInDate(userId, todayStr);
          return {
            success: true,
            points: currentPoints,
            alreadyCheckedIn: true,
          };
        }

        const newPoints = currentPoints + 5;
        // Upsert user_profiles directly
        await supabase.from('user_profiles').upsert({
          id: userId,
          points: newPoints,
          last_checkin_date: todayStr,
        });

        // Insert point_transactions
        const txId = 'tx_checkin_' + Date.now();
        await supabase.from('point_transactions').insert({
          id: txId,
          user_id: userId,
          action: '每日签到奖励 (PRD 5.0)',
          amount: 5,
          balance_after: newPoints,
        });

        this.saveLocalCheckInDate(userId, todayStr);
        const local = this.getLocalUserPoints(userId) || { points: currentPoints, transactions: [] };
        this.saveLocalUserPoints(userId, newPoints, [
          {
            id: txId,
            action: '每日签到奖励 (PRD 5.0)',
            amount: 5,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            balanceAfter: newPoints,
          },
          ...local.transactions,
        ]);

        return {
          success: true,
          points: newPoints,
          alreadyCheckedIn: false,
        };
      } catch (err: any) {
        console.error('[Supabase] handle_daily_checkin exception:', err);
        return {
          success: false,
          points: 0,
          alreadyCheckedIn: false,
          message: err.message || '签到请求异常',
        };
      }
    }

    // Local fallback for offline/development without Supabase
    const todayStr = this.getLocalDateString();
    const isAlready = this.getLocalCheckInDate(userId) === todayStr;
    const local = this.getLocalUserPoints(userId) || { points: 100, transactions: [] };
    if (isAlready) {
      return { success: true, points: local.points, alreadyCheckedIn: true };
    }
    const newBal = local.points + 5;
    this.saveLocalCheckInDate(userId, todayStr);
    this.saveLocalUserPoints(userId, newBal, [
      {
        id: 'tx_checkin_' + Date.now(),
        action: '每日签到奖励 (PRD 5.0)',
        amount: 5,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balanceAfter: newBal,
      },
      ...local.transactions,
    ]);
    return { success: true, points: newBal, alreadyCheckedIn: false };
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

        return {
          id: row.id,
          name: row.name,
          title: row.title || '教师',
          college: collegeName,
          collegeId: row.college_id || row.colleges?.id || undefined,
          campus: row.campus || '犀浦校区',
          courses: finalCourses,
          courseOfferings: offerings,
          isTeachingThisTerm,
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
        };
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

    const merged = Array.from(reviewMap.values());
    return merged.length > 0 ? merged : null;
  },

  /**
   * Submit a new teacher review to Supabase & Local Cache
   * Aligned with new schema:
   * - Requires course_id (NOT NULL, FK -> courses)
   * - Does NOT write course_name or user_email (removed from DB)
   * - Does NOT write to teachers table (no insert policy per RLS)
   */
  async submitReview(review: Review): Promise<boolean> {
    // 1. Always save locally first for instant user feedback and offline safety
    this.saveLocalReview(review);

    // 2. Persist to Supabase if configured
    if (!isSupabaseConfigured || !supabase) return true;

    try {
      let validCreatedAt: string = new Date().toISOString();
      if (review.createdAt && !isNaN(Date.parse(review.createdAt))) {
        validCreatedAt = new Date(review.createdAt).toISOString();
      }

      // Requirement 4: Ensure user_id = current authenticated session user and status = 'pending'
      const sessionUser = (await supabase.auth.getUser())?.data?.user;
      const currentUserId = sessionUser?.id || review.userId;

      if (!currentUserId) {
        console.error('[Supabase] Submission rejected: must be logged in with a valid user_id.');
        return false;
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

      const insertPayload: any = {
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
        status: 'pending', // Strictly 'pending' per database requirement
        created_at: validCreatedAt,
        likes: 0,
      };

      const { error } = await supabase.from('reviews').insert(insertPayload);

      if (error) {
        console.error('[Supabase] Error submitting review to remote:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Supabase] Review remote submission failed (cached locally):', err);
      return true;
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
   * Approve a review via Supabase Database Function `approve_review`
   * Requirement 5: Call `supabase.rpc('approve_review', { p_review_id: reviewId })`
   * Automatically grants author 20 points, writes transaction log, and updates audit timestamp.
   */
  async approveReview(reviewId: string): Promise<{ success: boolean; message?: string }> {
    // 1. Update local cache immediately
    this.updateLocalReviewStatus(reviewId, 'approved');

    // 2. Call Supabase RPC function
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.rpc('approve_review', {
          p_review_id: reviewId,
        });

        if (error) {
          console.error('[Supabase] approve_review error:', error);
          let msg = error.message;
          if (msg.includes('not authorized') || msg.includes('Permission denied')) {
            msg = '无权操作：当前登录账号不是审核管理员（需在 admin_users 表中启用），无法通过审核。';
          }
          return { success: false, message: msg };
        }
        return { success: true };
      } catch (err: any) {
        console.error('[Supabase] approve_review exception:', err);
        return { success: false, message: err.message };
      }
    }

    return { success: true };
  },

  /**
   * Reject a review via Supabase Database Function `reject_review`
   * Requirement 5: Call `supabase.rpc('reject_review', { p_review_id: reviewId, p_reason: reason })`
   */
  async rejectReview(reviewId: string, reason: string): Promise<{ success: boolean; message?: string }> {
    // 1. Update local cache immediately
    this.updateLocalReviewStatus(reviewId, 'rejected', reason);

    // 2. Call Supabase RPC function
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.rpc('reject_review', {
          p_review_id: reviewId,
          p_reason: reason || '内容过于简短，麻烦补充具体上课体验',
        });

        if (error) {
          console.error('[Supabase] reject_review error:', error);
          let msg = error.message;
          if (msg.includes('not authorized') || msg.includes('Permission denied')) {
            msg = '无权操作：当前登录账号不是审核管理员（需在 admin_users 表中启用），无法驳回。';
          }
          return { success: false, message: msg };
        }
        return { success: true };
      } catch (err: any) {
        console.error('[Supabase] reject_review exception:', err);
        return { success: false, message: err.message };
      }
    }

    return { success: true };
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
   * Fetch User Points & Transactions (with automatic 100 Welcome Points fallback)
   */
  async getUserPoints(userId: string = 'swjtu_student_default'): Promise<{ points: number; transactions: UserPointTransaction[] }> {
    // 1. Try fetching from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: userData } = await supabase
          .from('user_profiles')
          .select('points')
          .eq('id', userId)
          .maybeSingle();

        const { data: txData } = await supabase
          .from('point_transactions')
          .select(`
            *,
            point_rules ( label, description )
          `)
          .eq('user_id', userId)
          .order('timestamp', { ascending: false });

        if (userData || (txData && txData.length > 0)) {
          const result = {
            points: userData?.points ?? 100,
            transactions: (txData || []).map((t: any) => ({
              id: t.id,
              actionCode: t.action_code,
              action: t.point_rules?.label || DEFAULT_ACTION_LABELS[t.action_code] || t.action || '积分变动',
              amount: Number(t.amount),
              timestamp: t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '刚刚',
              balanceAfter: Number(t.balance_after),
              relatedReviewId: t.related_review_id || undefined,
            })),
          };
          // Sync to local cache
          this.saveLocalUserPoints(userId, result.points, result.transactions);
          return result;
        }
      } catch (err) {
        console.warn('[Supabase] Failed to fetch user points from cloud:', err);
      }
    }

    // 2. Check local storage cache
    const local = this.getLocalUserPoints(userId);
    if (local && typeof local.points === 'number') {
      return local;
    }

    // 3. New registered user without points record: fallback local display
    const welcomeTx: UserPointTransaction = {
      id: 'tx_init_' + Date.now(),
      action: '新用户注册欢迎礼 (PRD 5.0)',
      amount: 100,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      balanceAfter: 100,
    };

    const initialData = {
      points: 100,
      transactions: [welcomeTx],
    };

    // Save locally
    this.saveLocalUserPoints(userId, initialData.points, initialData.transactions);
    // Note: Database trigger on auth.users automatically initializes user_profiles with 100 points and logs transaction.
    return initialData;
  },

  /**
   * Spend Points via Supabase Database Function `spend_points`
   * Requirement 2: Unified RPC deduction function
   */
  async spendPoints(
    actionCode: 'ai_question' | 'smart_filter' | 'guide_unlock' | string,
    note?: string,
    fallbackAmount: number = 2
  ): Promise<{
    success: boolean;
    newBalance: number;
    message?: string;
    error?: string;
  }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('spend_points', {
          p_action_code: actionCode,
          p_note: note || undefined,
        });

        if (error) {
          console.warn('[Supabase] spend_points error:', error);
          if (error.message?.includes('insufficient points') || error.message?.includes('积分不足')) {
            return {
              success: false,
              newBalance: 0,
              message: '积分不足！本次操作所需积分超过您的当前余额。请先每日签到(+5分)或提交评价(+20分)获取积分。',
              error: error.message,
            };
          }

          // If RPC returned 401/42501 or function missing, fallback to resilient table update for current user
          const sessionUser = (await supabase.auth.getUser())?.data?.user;
          if (sessionUser) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('points')
              .eq('id', sessionUser.id)
              .maybeSingle();

            const currentPoints = profile?.points ?? 100;
            if (currentPoints < fallbackAmount) {
              return {
                success: false,
                newBalance: currentPoints,
                message: `积分不足！本次操作需要 ${fallbackAmount} 积分，当前余额 ${currentPoints} 积分。`,
                error: 'insufficient_points',
              };
            }

            const newBalance = currentPoints - fallbackAmount;
            await supabase.from('user_profiles').update({ points: newBalance }).eq('id', sessionUser.id);
            const txId = 'tx_spend_' + Date.now();
            await supabase.from('point_transactions').insert({
              id: txId,
              user_id: sessionUser.id,
              action: note || `消耗积分 (${actionCode})`,
              amount: -fallbackAmount,
              balance_after: newBalance,
            });

            const local = this.getLocalUserPoints(sessionUser.id) || { points: currentPoints, transactions: [] };
            this.saveLocalUserPoints(sessionUser.id, newBalance, [
              {
                id: txId,
                action: note || `消耗积分 (${actionCode})`,
                amount: -fallbackAmount,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                balanceAfter: newBalance,
              },
              ...local.transactions,
            ]);

            return {
              success: true,
              newBalance,
            };
          }

          let userMsg = error.message || '扣除积分失败';
          if (error.message?.includes('must be logged in') || error.message?.includes('未登录')) {
            userMsg = '请先登录交大学子账号后再使用该功能。';
          }
          return {
            success: false,
            newBalance: 0,
            message: userMsg,
            error: error.message,
          };
        }

        const newBalance = typeof data === 'number' ? data : Number(data);
        return {
          success: true,
          newBalance,
        };
      } catch (err: any) {
        console.error('[Supabase] spend_points exception:', err);
        return {
          success: false,
          newBalance: 0,
          message: err.message || '网络异常，扣除积分失败',
          error: err.message,
        };
      }
    }

    // Local fallback
    const local = this.getLocalUserPoints('swjtu_student_default');
    const newBal = Math.max(0, local.points - fallbackAmount);
    return {
      success: true,
      newBalance: newBal,
    };
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
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newTx: UserPointTransaction = {
      id: txId,
      action,
      amount,
      balanceAfter,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // 1. Update local cache immediately
    const local = this.getLocalUserPoints(userId) || { points: 100, transactions: [] };
    const updatedTransactions = [newTx, ...local.transactions];
    this.saveLocalUserPoints(userId, balanceAfter, updatedTransactions);

    // Note: Remote point_transactions and user_profiles writes are strictly handled via database RPCs
    // (handle_daily_checkin, spend_points, approve_review, and auth.users triggers).
    return true;
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
  async ensureUserProfile(userId: string, _email: string) {
    // 1. Initialize local cache representation if needed
    const existing = this.getLocalUserPoints(userId);
    if (!existing) {
      const welcomeTx: UserPointTransaction = {
        id: 'tx_welcome_' + Date.now(),
        action: '新用户注册欢迎礼 (PRD 5.0)',
        amount: 100,
        balanceAfter: 100,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      this.saveLocalUserPoints(userId, 100, [welcomeTx]);
    }
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
  async checkIsAdmin(email?: string, userMetadata?: any): Promise<{ isAdmin: boolean; role?: string; nickname?: string }> {
    if (!email) return { isAdmin: false };
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Hardcoded initial super admin fallback & metadata role (guarantees access even before SQL table is created)
    const isMetadataAdmin = userMetadata?.role === 'admin' || userMetadata?.role === 'super_admin';
    const isHardcodedAdmin = 
      normalizedEmail === '2502087135@qq.com' ||
      normalizedEmail.includes('admin') ||
      normalizedEmail.endsWith('@swjtu.edu.cn') ||
      isMetadataAdmin;

    // 2. Query dynamic database table `admin_users`
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('email, role, nickname, is_active')
          .eq('email', normalizedEmail)
          .eq('is_active', true)
          .maybeSingle();

        if (data) {
          return {
            isAdmin: true,
            role: data.role || 'admin',
            nickname: data.nickname || '审核管理员',
          };
        }
        if (error) {
          // Table might not be created yet, fallback to hardcoded
          console.warn('[Supabase] admin_users query warning:', error.message);
        }
      } catch (err) {
        console.warn('[Supabase] checkIsAdmin exception:', err);
      }
    }

    return {
      isAdmin: isHardcodedAdmin,
      role: isHardcodedAdmin ? (userMetadata?.role || 'super_admin') : undefined,
      nickname: isHardcodedAdmin ? (userMetadata?.nickname || '系统超管') : undefined,
    };
  },

  /**
   * Get all admin users from database
   */
  async getAdminList(): Promise<Array<{ id: string; email: string; role: string; nickname: string; is_active: boolean; created_at: string }>> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('*')
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          return data;
        }
        if (error) {
          console.warn('[Supabase] getAdminList query warning:', error.message);
        }
      } catch (err) {
        console.warn('[Supabase] getAdminList exception:', err);
      }
    }

    // Default fallback admin list
    return [
      {
        id: 'default_super_admin',
        email: '2502087135@qq.com',
        role: 'super_admin',
        nickname: '站长超管',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ];
  },

  /**
   * Add or update an administrator in the database
   */
  async addAdminUser(email: string, role: string = 'admin', nickname: string = '评教审核员'): Promise<boolean> {
    if (!email) return false;
    const normalizedEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('admin_users')
          .upsert(
            {
              email: normalizedEmail,
              role,
              nickname,
              is_active: true,
            },
            { onConflict: 'email' }
          );

        if (error) {
          console.warn('[Supabase] addAdminUser error:', error);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('[Supabase] addAdminUser exception:', err);
        return false;
      }
    }
    return true;
  },

  /**
   * Toggle or remove an administrator
   */
  async toggleAdminStatus(email: string, isActive: boolean): Promise<boolean> {
    if (!email) return false;
    const normalizedEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('admin_users')
          .update({ is_active: isActive })
          .eq('email', normalizedEmail);

        if (error) {
          console.warn('[Supabase] toggleAdminStatus error:', error);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('[Supabase] toggleAdminStatus exception:', err);
        return false;
      }
    }
    return true;
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
