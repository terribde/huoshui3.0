/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Teacher, Review, UserPointTransaction } from './types';
import { INITIAL_TEACHERS, INITIAL_REVIEWS } from './data/mockTeachers';
import { supabaseService } from './services/supabaseService';
import { isSupabaseConfigured } from './lib/supabase';

// Mobile Dedicated Views (Clean, pure Quark layout matching reference image)
import { MobileQuarkHome } from './components/mobile/MobileQuarkHome';
import { MobileUserProfile } from './components/mobile/MobileUserProfile';
import { MobileTeacherSearch } from './components/mobile/MobileTeacherSearch';
import { MobileServicesView } from './components/mobile/MobileServicesView';
import { BottomNav, NavTab } from './components/BottomNav';

// Desktop Dedicated Views (Spacious 2-column wide screen layout)
import { DesktopQuarkHome } from './components/desktop/DesktopQuarkHome';
import { DesktopUserProfile } from './components/desktop/DesktopUserProfile';
import { DesktopTeacherSearch } from './components/desktop/DesktopTeacherSearch';

// Shared Functional Components
import { CourseRecommend } from './components/CourseRecommend';
import { TeacherDetailModal } from './components/TeacherDetailModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { ReviewModal } from './components/ReviewModal';
import { UserPointsModal } from './components/UserPointsModal';
import { CollegeListModal } from './components/CollegeListModal';
import { ExperienceGuideModal } from './components/ExperienceGuideModal';
import { AuthModal } from './components/AuthModal';
import { AdminAuditModal } from './components/AdminAuditModal';

import { 
  BookOpen, 
  Search, 
  Sliders, 
  User, 
  Coins, 
  Sparkles,
  LogIn,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Info,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Current logged in user via Supabase Auth
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  // Core application states
  const [teachers, setTeachers] = useState<Teacher[]>(INITIAL_TEACHERS);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [hasCheckedInToday, setHasCheckedInToday] = useState<boolean>(false);
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [isCheckinStatusLoading, setIsCheckinStatusLoading] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<UserPointTransaction[]>([]);

  // Floating feedback Toast system (replaces jarring synchronous alerts)
  const [appToast, setAppToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const showAppToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now();
    setAppToast({ id, message, type });
    setTimeout(() => {
      setAppToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  }, []);

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [initialTeacherSearch, setInitialTeacherSearch] = useState<string>('');

  // Modals state
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [reviewTargetTeacher, setReviewTargetTeacher] = useState<Teacher | null>(null);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState<boolean>(false);
  const [isCollegesModalOpen, setIsCollegesModalOpen] = useState<boolean>(false);
  const [colleges, setColleges] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [isExperienceModalOpen, setIsExperienceModalOpen] = useState<boolean>(false);
  const [experienceTab, setExperienceTab] = useState<'guides' | 'notices' | 'history'>('guides');
  const [isAdminAuditModalOpen, setIsAdminAuditModalOpen] = useState<boolean>(false);
  const [isUserAdmin, setIsUserAdmin] = useState<boolean>(false);

  // Automatic Device Detection: Accurately identifies mobile phone vs computer/desktop
  const [deviceInfo, setDeviceInfo] = useState<{ isMobile: boolean; screenWidth: number }>(() => {
    if (typeof window === 'undefined') return { isMobile: false, screenWidth: 1200 };
    const userAgent = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isSmallScreen = window.innerWidth < 768;
    return {
      isMobile: isMobileUA || isSmallScreen,
      screenWidth: window.innerWidth,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const userAgent = navigator.userAgent || '';
      const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isSmallScreen = window.innerWidth < 768;
      setDeviceInfo({
        isMobile: isMobileUA || isSmallScreen,
        screenWidth: window.innerWidth,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadUserPointsData = useCallback(async (userId: string) => {
    setIsCheckinStatusLoading(true);
    try {
      const pointData = await supabaseService.getUserPoints(userId);
      if (pointData) {
        setUserPoints(pointData.points);
        setTransactions(pointData.transactions);
        if (typeof pointData.hasCheckedInToday === 'boolean') {
          setHasCheckedInToday(pointData.hasCheckedInToday);
        }
      }
    } catch (err) {
      console.warn('Failed to load user points data:', err);
    } finally {
      setIsCheckinStatusLoading(false);
    }
  }, []);

  // Refresh reviews from Supabase & local cache (remote status always takes precedence)
  const handleRefreshReviews = useCallback(async () => {
    const allReviews = await supabaseService.getReviews();
    if (allReviews && allReviews.length > 0) {
      const existingIds = new Set(allReviews.map((r) => r.id));
      const combined = [...allReviews, ...INITIAL_REVIEWS.filter((r) => !existingIds.has(r.id))];
      setReviews(combined);
    } else {
      setReviews(INITIAL_REVIEWS);
    }
  }, []);

  // Sync Supabase Auth, Initial Data, and Realtime Listeners
  useEffect(() => {
    // Load initial teachers from Supabase
    if (isSupabaseConfigured) {
      supabaseService.getTeachers().then((remoteTeachers) => {
        if (remoteTeachers && remoteTeachers.length > 0) {
          setTeachers(remoteTeachers);
        }
      });
    }

    // Initial reviews load
    handleRefreshReviews();

    // Load colleges list
    if (isSupabaseConfigured) {
      supabaseService.getColleges().then((data) => {
        if (data && data.length > 0) {
          setColleges(data);
        }
      });
    }

    if (!isSupabaseConfigured) return;

    // Check active auth session with instant local cache hydration
    supabaseService.getCurrentUser().then((user) => {
      if (user) {
        setCurrentUser(user);
        const local = supabaseService.getLocalUserPoints(user.id);
        if (local) {
          setUserPoints(local.points);
          setTransactions(local.transactions);
        }
        const localDate = supabaseService.getLocalCheckInDate(user.id);
        if (localDate === supabaseService.getLocalDateString()) {
          setHasCheckedInToday(true);
        }
        loadUserPointsData(user.id);
      }
    });

    // Subscribe to auth state changes
    const { data: authListener } = supabaseService.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setUserPoints(0);
        setTransactions([]);
        setHasCheckedInToday(false);
      } else if (user) {
        setCurrentUser(user);
        loadUserPointsData(user.id);
      }
    });

    // Subscribe to real-time reviews changes (e.g. admin approval from another device)
    const reviewsSub = supabaseService.subscribeToReviews(() => {
      handleRefreshReviews();
      supabaseService.getCurrentUser().then((u) => {
        if (u) loadUserPointsData(u.id);
      });
    });

    // Window focus and visibility listeners for auto background sync
    const handleSyncOnActive = () => {
      handleRefreshReviews();
      supabaseService.getCurrentUser().then((u) => {
        if (u) loadUserPointsData(u.id);
      });
    };

    window.addEventListener('focus', handleSyncOnActive);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSyncOnActive();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      authListener?.subscription?.unsubscribe();
      reviewsSub?.unsubscribe();
      window.removeEventListener('focus', handleSyncOnActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleRefreshReviews, loadUserPointsData]);

  // Re-sync reviews and user points whenever user navigates to the 'profile' tab
  useEffect(() => {
    if (currentTab === 'profile') {
      handleRefreshReviews();
      if (currentUser) {
        loadUserPointsData(currentUser.id);
      }
    }
  }, [currentTab, currentUser, handleRefreshReviews, loadUserPointsData]);

  // Verify administrator privilege whenever currentUser changes
  useEffect(() => {
    let isMounted = true;
    if (!currentUser || !currentUser.email) {
      setIsUserAdmin(false);
      setIsAdminAuditModalOpen(false);
      return;
    }

    const email = currentUser.email.trim().toLowerCase();
    const roleMeta = currentUser.user_metadata?.role;
    // Immediate synchronous check for known admin accounts or role metadata
    const isKnownAdmin =
      email === '2502087135@qq.com' ||
      email.includes('admin') ||
      email.endsWith('@swjtu.edu.cn') ||
      roleMeta === 'admin' ||
      roleMeta === 'super_admin';

    if (isKnownAdmin) {
      setIsUserAdmin(true);
    }

    // Dynamic database check from admin_users table in Supabase
    supabaseService.checkIsAdmin(currentUser.email, currentUser.user_metadata).then((res) => {
      if (isMounted) {
        setIsUserAdmin(res.isAdmin || isKnownAdmin);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    await supabaseService.signOut();
    setCurrentUser(null);
    setIsUserAdmin(false);
    setIsAdminAuditModalOpen(false);
    setUserPoints(0);
    setTransactions([]);
    setHasCheckedInToday(false);
  };

  const viewMode: 'mobile' | 'desktop' = deviceInfo.isMobile ? 'mobile' : 'desktop';

  // Points Deduction Handler (PRD 5.0) via unified spend_points RPC function
  const handleDeductPoints = async (
    amount: number,
    reason: string,
    actionCode: 'ai_question' | 'smart_filter' | 'guide_unlock' | string = 'ai_question'
  ): Promise<boolean> => {
    if (!currentUser) {
      handleOpenAuth('login');
      return false;
    }

    if (userPoints < amount) {
      showAppToast(`积分不足！本次操作需消耗 ${amount} 积分，当前剩余 ${userPoints} 积分。请先每日签到(+5分)或写评价(+20分)赚取积分。`, 'error');
      return false;
    }

    const res = await supabaseService.spendPoints(actionCode, reason, amount);
    if (!res.success) {
      showAppToast(res.message || '扣除积分失败', 'error');
      return false;
    }

    const newBalance = res.newBalance;
    setUserPoints(newBalance);
    setTransactions((prev) => [
      {
        id: `tx_${Date.now()}`,
        action: reason,
        amount: -amount,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balanceAfter: newBalance,
      },
      ...prev,
    ]);

    return true;
  };

  // Daily Check-in Handler via handle_daily_checkin RPC function
  const handleCheckIn = async () => {
    if (!currentUser) {
      handleOpenAuth('login');
      return;
    }

    if (isCheckingIn || isCheckinStatusLoading || hasCheckedInToday) {
      if (hasCheckedInToday) {
        showAppToast('您今日已经完成签到啦，明日 00:00 后即可再次签到！', 'info');
      }
      return;
    }

    setIsCheckingIn(true);
    try {
      const res = await supabaseService.handleDailyCheckin(currentUser.id);
      if (!res.success) {
        showAppToast(res.message || '签到失败，请稍后重试', 'error');
        return;
      }

      setHasCheckedInToday(true);
      setUserPoints(res.points);

      if (res.alreadyCheckedIn) {
        showAppToast('您今日已经完成签到啦，明日 00:00 后即可再次签到领取积分！', 'info');
        return;
      }

      setTransactions((prev) => [
        {
          id: `tx_${Date.now()}`,
          action: '每日签到奖励 (PRD 5.0)',
          amount: 5,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          balanceAfter: res.points,
        },
        ...prev,
      ]);
      showAppToast('🎉 签到成功！已获得 +5 积分奖励', 'success');
    } catch (err: any) {
      showAppToast(err?.message || '签到异常，请稍后重试', 'error');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Guarded Review Open: Requires User Login!
  const handleOpenReview = (teacher?: Teacher | null) => {
    if (!currentUser) {
      handleOpenAuth('login');
      return;
    }
    setReviewTargetTeacher(teacher || null);
    setIsReviewModalOpen(true);
  };

  // Submit Review Handler (PRD & Audit State Machine: initial status is 'pending')
  const handleSubmitReview = async (
    newReviewData: Omit<Review, 'id' | 'createdAt' | 'likes'>
  ): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) {
      handleOpenAuth('login');
      return { success: false, message: '请先登录您的西南交大账号' };
    }

    const nickname = currentUser.user_metadata?.nickname || '西南交大学子';
    const nowIso = new Date().toISOString();
    const newReview: Review = {
      ...newReviewData,
      id: `rev_${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      authorNickname: nickname,
      createdAt: nowIso,
      likes: 0,
      status: 'pending', // 初始状态为待审核
    };

    // Persist to Supabase and cache with full RLS validation
    const res = await supabaseService.submitReview(newReview);
    if (!res.success) {
      return res;
    }

    // Add into current reviews list
    setReviews((prev) => [newReview, ...prev]);

    // Refresh remote reviews list
    handleRefreshReviews();

    return { success: true };
  };

  // Approve review handler: calls approve_review RPC function with server-side validation
  const handleApproveReview = async (reviewId: string, _authorUserId?: string): Promise<{ success: boolean; message?: string }> => {
    const originalReview = reviews.find((r) => r.id === reviewId);

    // 1. Optimistic UI update: Immediately reflect approved status in local React state
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, status: 'approved', rejectionReason: undefined } : r
      )
    );

    const res = await supabaseService.approveReview(reviewId);

    // Roll back if rejected by database
    if (!res.success) {
      if (originalReview) {
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? originalReview : r))
        );
      }
      return res;
    }

    // 2. Refresh reviews and teachers from remote (DB trigger calculates scores and review counts)
    handleRefreshReviews();
    if (isSupabaseConfigured) {
      supabaseService.getTeachers().then((remoteTeachers) => {
        if (remoteTeachers && remoteTeachers.length > 0) {
          setTeachers(remoteTeachers);
        }
      });
    }

    // 3. If current user is author, reload user points (+20 awarded by approve_review function)
    if (currentUser) {
      loadUserPointsData(currentUser.id);
    }

    return res;
  };

  // Reject review handler: calls reject_review RPC function with server-side validation
  const handleRejectReview = async (reviewId: string, reason: string): Promise<{ success: boolean; message?: string }> => {
    const originalReview = reviews.find((r) => r.id === reviewId);

    // 1. Optimistic UI update: Immediately reflect rejected status in local React state
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, status: 'rejected', rejectionReason: reason } : r
      )
    );

    const res = await supabaseService.rejectReview(reviewId, reason);

    // Roll back if rejected by database
    if (!res.success) {
      if (originalReview) {
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? originalReview : r))
        );
      }
      return res;
    }

    handleRefreshReviews();
    return res;
  };

  // Delete review handler
  const handleDeleteReview = async (reviewId: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    await supabaseService.deleteReview(reviewId);
  };

  // Like review
  const handleLikeReview = (reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, likes: r.likes + 1 } : r))
    );
  };

  // Lock background scroll when any modal is open to prevent scrollbar flicker & layout jump
  const isAnyModalOpen = Boolean(
    selectedTeacher ||
    isAiModalOpen ||
    isReviewModalOpen ||
    isPointsModalOpen ||
    isCollegesModalOpen ||
    isExperienceModalOpen ||
    isAuthModalOpen ||
    isAdminAuditModalOpen
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  // Filter reviews written by current user (supports user id, email, nickname, and local client submissions)
  const myUserNickname = currentUser?.user_metadata?.nickname;
  const localSubmittedIds = new Set(supabaseService.getLocalReviews().map((r) => r.id));
  const myReviews = currentUser
    ? reviews.filter(
        (r) =>
          (r.userId && r.userId === currentUser.id) ||
          (currentUser.email && r.userEmail === currentUser.email) ||
          (myUserNickname && r.authorNickname === myUserNickname) ||
          localSubmittedIds.has(r.id)
      )
    : [];

  return (
    <div className="min-h-screen bg-white sm:bg-slate-100/90 text-gray-900 flex flex-col items-center relative">
      {/* Top Floating Toast Notification Banner */}
      <AnimatePresence>
        {appToast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[92%] sm:w-auto px-4 py-3 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-sm font-semibold backdrop-blur-md pointer-events-auto ${
              appToast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-300 text-emerald-900 shadow-emerald-500/10'
                : appToast.type === 'error'
                ? 'bg-rose-50/95 border-rose-300 text-rose-900 shadow-rose-500/10'
                : 'bg-amber-50/95 border-amber-300 text-amber-900 shadow-amber-500/10'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {appToast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : appToast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              ) : (
                <Info className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <span className="leading-snug">{appToast.message}</span>
            </div>
            <button
              onClick={() => setAppToast(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-gray-400 hover:text-gray-700 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ========================================================= */}
      {/* 1. MOBILE MODE: Pure, 100% faithful Quark mobile layout   */}
      {/* ========================================================= */}
      {viewMode === 'mobile' && (
        <div className="w-full flex justify-center py-0 sm:py-4">
          <div className="w-full max-w-[430px] min-h-screen sm:min-h-[92vh] bg-white sm:rounded-3xl sm:shadow-[0_20px_60px_rgba(0,0,0,0.12)] sm:border sm:border-gray-200/80 relative overflow-x-hidden flex flex-col justify-between">
            
            {/* Mobile Tab Views with Smooth Fade Transition */}
            <div className="flex-1 w-full relative overflow-x-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="w-full"
                >
                  {currentTab === 'home' && (
                    <MobileQuarkHome
                      currentUser={currentUser}
                      onOpenAuth={handleOpenAuth}
                      userPoints={userPoints}
                      onOpenSearch={(query) => {
                        setInitialTeacherSearch(query || '');
                        setCurrentTab('search');
                      }}
                      onOpenRecommend={() => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenPoints={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
                      onOpenReview={() => handleOpenReview()}
                    />
                  )}

                  {currentTab === 'search' && (
                    <MobileTeacherSearch
                      teachers={teachers}
                      colleges={colleges}
                      initialSearch={initialTeacherSearch}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
                    />
                  )}

                  {currentTab === 'services' && (
                    <MobileServicesView
                      teachers={teachers}
                      userPoints={userPoints}
                      onOpenSearch={(query) => {
                        setInitialTeacherSearch(query || '');
                        setCurrentTab('search');
                      }}
                      onOpenRecommend={() => {
                        setCurrentTab('recommend');
                      }}
                      onOpenAiChat={(prompt) => {
                        setAiInitialPrompt(prompt || '');
                        setIsAiModalOpen(true);
                      }}
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
                      onOpenPoints={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
                      onOpenCollegeList={() => setIsCollegesModalOpen(true)}
                      onOpenExperienceModal={(tab) => {
                        setExperienceTab(tab || 'guides');
                        setIsExperienceModalOpen(true);
                      }}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                    />
                  )}

                  {currentTab === 'recommend' && (
                    <div className="pt-3 px-3 pb-24">
                      <CourseRecommend
                        teachers={teachers}
                        colleges={colleges}
                        userPoints={userPoints}
                        onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                        onDeductPoints={handleDeductPoints}
                      />
                    </div>
                  )}

                  {currentTab === 'profile' && (
                    <MobileUserProfile
                      currentUser={currentUser}
                      onOpenAuth={handleOpenAuth}
                      onLogout={handleLogout}
                      userPoints={userPoints}
                      transactions={transactions}
                      hasCheckedInToday={hasCheckedInToday}
                      isCheckingIn={isCheckingIn}
                      isCheckinStatusLoading={isCheckinStatusLoading}
                      onCheckIn={handleCheckIn}
                      onOpenPointsModal={() => {
                        if (!currentUser) {
                          handleOpenAuth('login');
                        } else {
                          setIsPointsModalOpen(true);
                        }
                      }}
                      onOpenReview={() => handleOpenReview()}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      myReviews={myReviews}
                      teachers={teachers}
                      onOpenAdminAudit={isUserAdmin ? () => setIsAdminAuditModalOpen(true) : undefined}
                      onDeleteReview={handleDeleteReview}
                      onRefreshReviews={handleRefreshReviews}
                      isUserAdmin={isUserAdmin}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Quark Mobile Bottom Navigation Dock */}
            <BottomNav
              currentTab={currentTab}
              onTabChange={(tab) => setCurrentTab(tab)}
              userPoints={userPoints}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. DESKTOP MODE: Spacious, full-featured wide screen view */}
      {/* ========================================================= */}
      {viewMode === 'desktop' && (
        <div className="w-full flex flex-col items-center">
          {/* Desktop Navigation Header */}
          <header className="w-full bg-white/95 backdrop-blur-md border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
              {/* Logo */}
              <div 
                onClick={() => setCurrentTab('home')}
                className="flex items-center gap-3 cursor-pointer select-none group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs shadow-indigo-200 group-hover:scale-105 transition-transform">
                  交
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-base tracking-tight text-gray-950 font-sans">
                      交大评教
                    </span>
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                      Agent
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 -mt-0.5">
                    西南交通大学专属教师评价 · 校园智能助手
                  </p>
                </div>
              </div>

              {/* Desktop Nav Items */}
              <nav className="flex items-center gap-1.5 bg-gray-100/90 p-1.5 rounded-2xl border border-gray-200/60">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('home')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'home'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>首页推荐</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('search')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'search'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>教师库 (免费)</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('recommend')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    currentTab === 'recommend'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>智能选课</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCurrentTab('profile')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
                    currentTab === 'profile'
                      ? 'bg-white text-gray-950 shadow-xs'
                      : 'text-gray-600 hover:text-gray-950 hover:bg-white/50'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>个人中心</span>
                  {currentUser && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-white font-extrabold ml-0.5">
                      {userPoints}
                    </span>
                  )}
                </motion.button>
              </nav>

              {/* Auth, Points & AI Quick Buttons */}
              <div className="flex items-center gap-2.5">
                {currentUser ? (
                  <>
                    <motion.div 
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setIsPointsModalOpen(true)}
                      className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200/80 cursor-pointer transition-all shadow-2xs"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-bold text-xs">{userPoints}</span>
                      <span className="text-[10px] text-amber-700">分</span>
                    </motion.div>

                    <div className="flex items-center gap-2 pl-1 border-l border-gray-200">
                      <div 
                        onClick={() => setCurrentTab('profile')}
                        className="flex items-center gap-1.5 cursor-pointer p-1 rounded-xl hover:bg-gray-100 transition-colors"
                        title="查看个人中心"
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                          {(currentUser.user_metadata?.nickname || '交').slice(0, 1)}
                        </div>
                        <span className="text-xs font-bold text-gray-800 max-w-[80px] truncate">
                          {currentUser.user_metadata?.nickname || '学子'}
                        </span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="退出登录"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAuth('login')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 transition-all shadow-2xs"
                    >
                      <LogIn className="w-3.5 h-3.5 text-gray-500" />
                      <span>登录</span>
                    </button>
                    <button
                      onClick={() => handleOpenAuth('register')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>注册 (+100积分)</span>
                    </button>
                  </div>
                )}

                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setIsAiModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-xs font-semibold transition-all shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI 智能问答</span>
                </motion.button>

                {/* Admin Audit Quick Switch - Only visible when an administrator is logged in */}
                {isUserAdmin && (
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => setIsAdminAuditModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-100 text-xs font-bold transition-all shadow-2xs cursor-pointer group"
                    title="进入评教审核管理工作台"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                    <span>管理审核</span>
                    {reviews.filter((r) => r.status === 'pending').length > 0 && (
                      <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full text-[9px] font-black animate-pulse">
                        {reviews.filter((r) => r.status === 'pending').length}
                      </span>
                    )}
                  </motion.button>
                )}
              </div>
            </div>
          </header>

          {/* Desktop Views with AnimatePresence */}
          <main className="w-full max-w-6xl mx-auto px-6 py-4 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {currentTab === 'home' && (
                  <DesktopQuarkHome
                    currentUser={currentUser}
                    onOpenAuth={handleOpenAuth}
                    teachers={teachers}
                    userPoints={userPoints}
                    onOpenSearch={(query) => {
                      setInitialTeacherSearch(query || '');
                      setCurrentTab('search');
                    }}
                    onOpenRecommend={() => {
                      setCurrentTab('recommend');
                    }}
                    onOpenAiChat={(prompt) => {
                      setAiInitialPrompt(prompt || '');
                      setIsAiModalOpen(true);
                    }}
                    onOpenReview={(teacher) => handleOpenReview(teacher)}
                    onOpenPoints={() => {
                      if (!currentUser) {
                        handleOpenAuth('login');
                      } else {
                        setIsPointsModalOpen(true);
                      }
                    }}
                    onOpenCollegeList={() => setIsCollegesModalOpen(true)}
                    onOpenExperienceModal={(tab) => {
                      setExperienceTab(tab || 'guides');
                      setIsExperienceModalOpen(true);
                    }}
                    onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                  />
                )}

                {currentTab === 'search' && (
                  <div className="pt-2">
                    <DesktopTeacherSearch
                      teachers={teachers}
                      colleges={colleges}
                      initialSearch={initialTeacherSearch}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onOpenReview={(teacher) => handleOpenReview(teacher)}
                    />
                  </div>
                )}

                {currentTab === 'recommend' && (
                  <div className="pt-2">
                    <CourseRecommend
                      teachers={teachers}
                      colleges={colleges}
                      userPoints={userPoints}
                      onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                      onDeductPoints={handleDeductPoints}
                    />
                  </div>
                )}

                {currentTab === 'profile' && (
                  <DesktopUserProfile
                    currentUser={currentUser}
                    onOpenAuth={handleOpenAuth}
                    onLogout={handleLogout}
                    userPoints={userPoints}
                    transactions={transactions}
                    hasCheckedInToday={hasCheckedInToday}
                    isCheckingIn={isCheckingIn}
                    isCheckinStatusLoading={isCheckinStatusLoading}
                    onCheckIn={handleCheckIn}
                    onOpenPointsModal={() => {
                      if (!currentUser) {
                        handleOpenAuth('login');
                      } else {
                        setIsPointsModalOpen(true);
                      }
                    }}
                    onOpenReview={() => handleOpenReview()}
                    onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
                    myReviews={myReviews}
                    teachers={teachers}
                    onOpenAdminAudit={isUserAdmin ? () => setIsAdminAuditModalOpen(true) : undefined}
                    onDeleteReview={handleDeleteReview}
                    onRefreshReviews={handleRefreshReviews}
                    isUserAdmin={isUserAdmin}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      )}

      {/* ========================================================= */}
      {/* Shared Modals                                             */}
      {/* ========================================================= */}
      
      {/* 1. 教师主页 / 详细六维评测 Modal */}
      <AnimatePresence>
        {selectedTeacher && (
          <TeacherDetailModal
            teacher={selectedTeacher}
            reviews={reviews}
            onClose={() => setSelectedTeacher(null)}
            onOpenReview={(t) => handleOpenReview(t)}
            onLikeReview={handleLikeReview}
          />
        )}
      </AnimatePresence>

      {/* 2. AI 问答 / Agent 问答 Modal (PRD 3.2 & 6) */}
      <AnimatePresence>
        {isAiModalOpen && (
          <AiAssistantModal
            isOpen={isAiModalOpen}
            onClose={() => setIsAiModalOpen(false)}
            teachers={teachers}
            userPoints={userPoints}
            onDeductPoints={handleDeductPoints}
            onSelectTeacher={(teacher) => setSelectedTeacher(teacher)}
            initialPrompt={aiInitialPrompt}
          />
        )}
      </AnimatePresence>

      {/* 3. 评价打分 Modal (PRD 4 & 8) */}
      <AnimatePresence>
        {isReviewModalOpen && (
          <ReviewModal
            isOpen={isReviewModalOpen}
            onClose={() => setIsReviewModalOpen(false)}
            teachers={teachers}
            preselectedTeacher={reviewTargetTeacher}
            onSubmitReview={handleSubmitReview}
          />
        )}
      </AnimatePresence>

      {/* 4. 积分中心 Modal (PRD 5) */}
      <AnimatePresence>
        {isPointsModalOpen && (
          <UserPointsModal
            isOpen={isPointsModalOpen}
            onClose={() => setIsPointsModalOpen(false)}
            points={userPoints}
            transactions={transactions}
            hasCheckedInToday={hasCheckedInToday}
            isCheckingIn={isCheckingIn}
            isCheckinStatusLoading={isCheckinStatusLoading}
            onCheckIn={handleCheckIn}
            onOpenReview={() => handleOpenReview()}
          />
        )}
      </AnimatePresence>

      {/* 5. 院系库 Modal */}
      <AnimatePresence>
        {isCollegesModalOpen && (
          <CollegeListModal
            isOpen={isCollegesModalOpen}
            onClose={() => setIsCollegesModalOpen(false)}
            colleges={colleges}
            onSelectCollege={(_college, collegeId) => {
              setInitialTeacherSearch(collegeId || _college || '');
              setCurrentTab('search');
            }}
          />
        )}
      </AnimatePresence>

      {/* 6. 经验攻略 / 教务通知 / 历史迁移说明 Modal (PRD 3.4 & 4.1) */}
      <AnimatePresence>
        {isExperienceModalOpen && (
          <ExperienceGuideModal
            isOpen={isExperienceModalOpen}
            onClose={() => setIsExperienceModalOpen(false)}
            defaultTab={experienceTab}
          />
        )}
      </AnimatePresence>

      {/* 7. Supabase 用户认证 Modal (登录 / 注册) */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            initialMode={authModalMode}
            onAuthSuccess={(user, isNewRegistration) => {
              setCurrentUser(user);
              loadUserPointsData(user.id, isNewRegistration);
              setIsAuthModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 8. 管理员审核后台工作台 Modal (PRD 核心审核机制) */}
      <AnimatePresence>
        {isAdminAuditModalOpen && isUserAdmin && (
          <AdminAuditModal
            isOpen={isAdminAuditModalOpen}
            onClose={() => setIsAdminAuditModalOpen(false)}
            reviews={reviews}
            teachers={teachers}
            onApproveReview={handleApproveReview}
            onRejectReview={handleRejectReview}
            onDeleteReview={handleDeleteReview}
            onRefreshReviews={handleRefreshReviews}
            currentUserEmail={currentUser?.email}
            currentUserId={currentUser?.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
