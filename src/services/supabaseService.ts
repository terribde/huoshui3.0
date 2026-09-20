import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Teacher, Review, UserPointTransaction } from '../types';
import { INITIAL_TEACHERS } from '../data/mockTeachers';

/**
 * Supabase Data Service
 * Provides real database persistence with graceful local fallback & instant caching
 */

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

  async recordCheckIn(userId: string, added: number, newBalance: number): Promise<boolean> {
    const todayStr = this.getLocalDateString();

    // 1. Save locally immediately
    this.saveLocalCheckInDate(userId, todayStr);

    // 2. Persist point transaction
    await this.savePointTransaction(userId, '每日签到奖励 (PRD 5.0)', added, newBalance);

    // 3. Update last_checkin_date on Supabase user_profiles
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('user_profiles')
          .upsert({
            id: userId,
            points: newBalance,
            last_checkin_date: todayStr,
          });
      } catch (err) {
        console.warn('[Supabase] Failed to sync last_checkin_date to cloud:', err);
      }
    }

    return true;
  },

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
   * Fetch reviews: Merges remote Supabase records with local user-submitted reviews
   */
  async getReviews(teacherId?: string): Promise<Review[] | null> {
    let remoteReviews: Review[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
        if (teacherId) {
          query = query.eq('teacher_id', teacherId);
        }

        const { data, error } = await query;
        if (!error && data) {
          remoteReviews = data.map((row: any) => ({
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
            userId: row.user_id,
            userEmail: row.user_email,
            isHistoricalMigrated: Boolean(row.is_historical_migrated),
            status: row.status || 'approved',
            rejectionReason: row.rejection_reason || undefined,
            createdAt: row.created_at || new Date().toISOString(),
            likes: Number(row.likes) || 0,
          }));
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
   */
  async submitReview(review: Review): Promise<boolean> {
    // 1. Always save locally first for instant user feedback and offline safety
    this.saveLocalReview(review);

    // 2. Persist to Supabase if configured
    if (!isSupabaseConfigured || !supabase) return true;

    try {
      // Ensure the referenced teacher exists in Supabase to avoid foreign key errors
      const mockTeacher = INITIAL_TEACHERS.find((t) => t.id === review.teacherId);
      if (mockTeacher) {
        await supabase.from('teachers').upsert({
          id: mockTeacher.id,
          name: mockTeacher.name,
          title: mockTeacher.title,
          college: mockTeacher.college,
          campus: mockTeacher.campus,
          courses: mockTeacher.courses,
          is_teaching_this_term: mockTeacher.isTeachingThisTerm,
          overall_score: mockTeacher.overallScore,
          review_count: mockTeacher.reviewCount,
          attendance_strictness: mockTeacher.dimensions.attendanceStrictness,
          grading_leniency: mockTeacher.dimensions.gradingLeniency,
          effort_matters: mockTeacher.dimensions.effortMatters,
          workload_difficulty: mockTeacher.dimensions.workloadDifficulty,
          approachability: mockTeacher.dimensions.approachability,
          teaching_quality: mockTeacher.dimensions.teachingQuality,
          has_historical_data: mockTeacher.hasHistoricalData,
          tags: mockTeacher.tags,
        }, { onConflict: 'id', ignoreDuplicates: true });
      }

      let validCreatedAt: string = new Date().toISOString();
      if (review.createdAt && !isNaN(Date.parse(review.createdAt))) {
        validCreatedAt = new Date(review.createdAt).toISOString();
      }

      const insertPayload: any = {
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
        user_id: review.userId || null,
        user_email: review.userEmail || null,
        is_historical_migrated: false,
        status: review.status,
        created_at: validCreatedAt,
        likes: review.likes || 0,
      };

      if (review.rejectionReason) {
        insertPayload.rejection_reason = review.rejectionReason;
      }

      let { error } = await supabase.from('reviews').insert(insertPayload);
      if (error && error.message?.includes('rejection_reason')) {
        delete insertPayload.rejection_reason;
        const retryRes = await supabase.from('reviews').insert(insertPayload);
        error = retryRes.error;
      }

      if (error) {
        console.warn('[Supabase] Error submitting review to remote:', error.message);
      }
      return true;
    } catch (err) {
      console.warn('[Supabase] Review remote submission failed (cached locally):', err);
      return true;
    }
  },

  /**
   * Update Review status (approved / rejected) with optional rejection reason and reward points
   */
  async updateReviewStatus(
    reviewId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string,
    authorUserId?: string
  ): Promise<boolean> {
    // 1. Update local cache
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

    // 2. Update Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const updatePayload: any = { status };
        if (rejectionReason) {
          updatePayload.rejection_reason = rejectionReason;
        } else if (status === 'approved') {
          updatePayload.rejection_reason = null;
        }

        let { error } = await supabase.from('reviews').update(updatePayload).eq('id', reviewId);
        if (error && error.message?.includes('rejection_reason')) {
          const retryRes = await supabase.from('reviews').update({ status }).eq('id', reviewId);
          error = retryRes.error;
        }

        if (error) {
          console.warn('[Supabase] Failed to update review status in remote:', error);
        }
      } catch (err) {
        console.warn('[Supabase] updateReviewStatus exception:', err);
      }
    }

    // 3. If approved, automatically award +20 points to the author!
    if (status === 'approved' && authorUserId) {
      try {
        const pointsData = await this.getUserPoints(authorUserId);
        const newBalance = pointsData.points + 20;
        await this.savePointTransaction(authorUserId, '撰写教师评价审核通过 (+20分)', 20, newBalance);
      } catch (err) {
        console.warn('Failed to award review reward points:', err);
      }
    }

    return true;
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
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false });

        if (userData || (txData && txData.length > 0)) {
          const result = {
            points: userData?.points ?? 100,
            transactions: (txData || []).map((t: any) => ({
              id: t.id,
              action: t.action,
              amount: Number(t.amount),
              timestamp: t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '刚刚',
              balanceAfter: Number(t.balance_after),
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

    // 3. New registered user without points record: Automatically grant 100 welcome points!
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

    // Try cloud sync in background
    if (isSupabaseConfigured && supabase) {
      (async () => {
        try {
          await supabase.from('user_profiles').upsert({ id: userId, points: 100 });
          await supabase.from('point_transactions').insert({
            id: welcomeTx.id,
            user_id: userId,
            action: welcomeTx.action,
            amount: 100,
            balance_after: 100,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('[Supabase] Auto sync welcome points note:', e);
        }
      })();
    }

    return initialData;
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

    // 2. Persist to Supabase if configured
    if (!isSupabaseConfigured || !supabase) return true;

    try {
      await supabase
        .from('user_profiles')
        .upsert({ id: userId, points: balanceAfter });

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
      console.warn('[Supabase] Failed to persist point transaction remotely:', err);
      return true;
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

    // Ensure user_profile entry and 100 points are created immediately
    if (data.user) {
      await this.ensureUserProfile(data.user.id, data.user.email || email);
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
   * Ensure user profile exists with 100 points
   */
  async ensureUserProfile(userId: string, _email: string) {
    // 1. Initialize 100 points in local storage immediately
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

    // 2. Sync to Supabase if reachable
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, points')
          .eq('id', userId)
          .maybeSingle();

        if (!profile) {
          await supabase
            .from('user_profiles')
            .upsert({
              id: userId,
              points: 100,
            });

          await supabase
            .from('point_transactions')
            .insert({
              id: 'tx_welcome_' + Date.now(),
              user_id: userId,
              action: '新用户注册欢迎礼 (PRD 5.0)',
              amount: 100,
              balance_after: 100,
              timestamp: new Date().toISOString(),
            });
        }
      } catch (err) {
        console.warn('[Supabase] ensureUserProfile cloud warning:', err);
      }
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
  async checkIsAdmin(email?: string): Promise<{ isAdmin: boolean; role?: string; nickname?: string }> {
    if (!email) return { isAdmin: false };
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Hardcoded initial super admin fallback (guarantees access even before SQL table is created)
    const isHardcodedAdmin = 
      normalizedEmail === '2502087135@qq.com' ||
      normalizedEmail.includes('admin') ||
      normalizedEmail.endsWith('@swjtu.edu.cn');

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
      role: isHardcodedAdmin ? 'super_admin' : undefined,
      nickname: isHardcodedAdmin ? '系统超管' : undefined,
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
};
